-- Additive only. Existing metals and observations are preserved.
CREATE TABLE regional_markets(code text PRIMARY KEY CHECK(code IN ('Европа','США','Азия')),name_ru text NOT NULL);
INSERT INTO regional_markets VALUES ('Европа','Европа'),('США','США'),('Азия','Азия');
INSERT INTO metals(id,category_id,symbol,name,name_ru,aliases,atomic_number,unit,currency,description) VALUES('chromium','non-ferrous','Cr','Chromium','Хром',ARRAY['хром','хрома'],24,'kg','USD','Промышленный хром; коммерческая спецификация требует сертификата') ON CONFLICT(id) DO NOTHING;
CREATE TABLE active_metals(metal_id text PRIMARY KEY REFERENCES metals(id));
INSERT INTO active_metals VALUES ('tungsten'),('molybdenum'),('ferromolybdenum'),('ferrotungsten'),('tin'),('zinc'),('copper'),('aluminum'),('chromium'),('cobalt'),('zirconium'),('niobium'),('tantalum');
ALTER TABLE metal_specifications ADD COLUMN purity numeric CHECK(purity>0 AND purity<=100);
ALTER TABLE metal_specifications ADD COLUMN element_content numeric CHECK(element_content>0 AND element_content<=100);
ALTER TABLE metal_specifications ADD COLUMN delivery_terms text;
ALTER TABLE metal_specifications ADD COLUMN market_type text;
ALTER TABLE price_quotations ADD COLUMN specification_id uuid REFERENCES metal_specifications(id);
ALTER TABLE price_quotations ADD COLUMN country text;
ALTER TABLE price_quotations ADD COLUMN purity numeric CHECK(purity>0 AND purity<=100);
ALTER TABLE price_quotations ADD COLUMN element_content numeric CHECK(element_content>0 AND element_content<=100);
ALTER TABLE price_quotations ADD COLUMN delivery_terms text;
ALTER TABLE price_history ADD COLUMN region_code text REFERENCES regional_markets(code);
ALTER TABLE price_history ADD COLUMN country text;
ALTER TABLE price_history ADD COLUMN specification_id uuid REFERENCES metal_specifications(id);
-- Old global data remain stored. Only fully specified supported observations are published.
DROP POLICY public_read_price_quotations ON price_quotations;
CREATE POLICY public_read_price_quotations ON price_quotations FOR SELECT TO anon,authenticated USING(
 data_status IN ('live','cached') AND validation_status='valid' AND normalized_price>0 AND
 metal_id IN(SELECT metal_id FROM active_metals) AND region IN('Европа','США','Азия') AND
 (region<>'Азия' OR nullif(country,'') IS NOT NULL) AND nullif(delivery_terms,'') IS NOT NULL AND (purity IS NOT NULL OR element_content IS NOT NULL));
DROP POLICY public_read_price_history ON price_history;
CREATE POLICY public_read_price_history ON price_history FOR SELECT TO anon,authenticated USING(data_status IN('live','cached') AND close>0 AND region_code IS NOT NULL AND metal_id IN(SELECT metal_id FROM active_metals));
ALTER TABLE price_quotations DROP CONSTRAINT quote_specification_unique;
ALTER TABLE price_quotations ADD CONSTRAINT quote_specification_unique UNIQUE NULLS NOT DISTINCT(metal_id,source_id,quoted_at,region,market_type,grade,product_form,composition,price_type,country,purity,element_content,delivery_terms);
CREATE INDEX regional_quotes_lookup ON price_quotations(metal_id,region,quoted_at DESC);
CREATE INDEX regional_history_lookup ON price_history(metal_id,region_code,trade_date DESC);
CREATE TABLE news_sources(
 id text PRIMARY KEY,name text NOT NULL,feed_url text NOT NULL CHECK(feed_url LIKE 'https://%'),home_url text NOT NULL,
 format text NOT NULL DEFAULT 'rss' CHECK(format IN('rss','atom','json')),enabled boolean NOT NULL DEFAULT false,
 approved_at timestamptz,license_url text NOT NULL,license_note text NOT NULL,allowed_hosts text[] NOT NULL,
 min_interval_seconds integer NOT NULL DEFAULT 1800 CHECK(min_interval_seconds>=60),
 retry_after_at timestamptz,last_attempt_at timestamptz,last_success_at timestamptz,etag text,last_modified text,status text NOT NULL DEFAULT 'pending'
);
INSERT INTO news_sources(id,name,feed_url,home_url,license_url,license_note,allowed_hosts,enabled,approved_at) VALUES
 ('usgs-minerals','USGS Mineral Resources','https://www.usgs.gov/news/minerals/feed','https://www.usgs.gov/programs/mineral-resources-program/news','https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits','Официальная RSS-лента; только текстовые метаданные и собственное краткое резюме. Не импортировать сторонние изображения или полные статьи.',ARRAY['www.usgs.gov'],true,now());
CREATE TABLE news_articles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_id text NOT NULL REFERENCES news_sources(id),
 canonical_url text NOT NULL UNIQUE CHECK(canonical_url LIKE 'https://%'),fingerprint text NOT NULL UNIQUE,
 original_title text NOT NULL,title_ru text,excerpt text NOT NULL CHECK(length(excerpt)<=800),summary_ru text CHECK(length(summary_ru)<=1200),
 language text NOT NULL DEFAULT 'en',translation_status text NOT NULL DEFAULT 'pending' CHECK(translation_status IN('pending','ready','failed')),
 metal_ids text[] NOT NULL CHECK(cardinality(metal_ids)>0),regions text[] NOT NULL DEFAULT '{}',categories text[] NOT NULL DEFAULT '{}',
 published_at timestamptz NOT NULL,retrieved_at timestamptz NOT NULL DEFAULT now(),is_public boolean NOT NULL DEFAULT true
);
CREATE TABLE news_metal_links(article_id uuid REFERENCES news_articles(id) ON DELETE CASCADE,metal_id text REFERENCES active_metals(metal_id),PRIMARY KEY(article_id,metal_id));
CREATE INDEX news_published_idx ON news_articles(published_at DESC);
CREATE INDEX news_metals_idx ON news_articles USING gin(metal_ids);
CREATE INDEX news_regions_idx ON news_articles USING gin(regions);
CREATE TABLE news_ingestion_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_id text REFERENCES news_sources(id),started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,accepted integer NOT NULL DEFAULT 0,status text NOT NULL CHECK(status IN('started','success','error')),error_code text);
CREATE TABLE analytical_summaries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid REFERENCES auth.users(id),cache_key text NOT NULL,kind text NOT NULL CHECK(kind IN('news','daily','weekly','chat')),content text NOT NULL,source_ids text[] NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,UNIQUE(owner_id,cache_key));
CREATE TABLE ai_daily_budget(day date PRIMARY KEY,reserved_tokens integer NOT NULL CHECK(reserved_tokens>0));
CREATE OR REPLACE FUNCTION public.reserve_ai_tokens(p_tokens integer,p_limit integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer;lim integer:=least(greatest(p_limit,0),1000000);
BEGIN
 IF p_tokens<1 OR p_tokens>16000 OR p_tokens>lim THEN RETURN false; END IF;
 INSERT INTO public.ai_daily_budget VALUES((now() AT TIME ZONE 'UTC')::date,p_tokens)
 ON CONFLICT(day) DO UPDATE SET reserved_tokens=public.ai_daily_budget.reserved_tokens+p_tokens
 WHERE public.ai_daily_budget.reserved_tokens+p_tokens<=lim RETURNING reserved_tokens INTO n;
 RETURN n IS NOT NULL;
END $$;
CREATE OR REPLACE FUNCTION public.claim_news_source(p_id text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed text;
BEGIN
 UPDATE public.news_sources SET last_attempt_at=now() WHERE id=p_id AND enabled AND approved_at IS NOT NULL AND
 (retry_after_at IS NULL OR retry_after_at<=now()) AND (last_attempt_at IS NULL OR last_attempt_at<=now()-make_interval(secs=>min_interval_seconds)) RETURNING id INTO changed;
 RETURN changed IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.reserve_ai_tokens(integer,integer),public.claim_news_source(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_tokens(integer,integer),public.claim_news_source(text) TO service_role;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['regional_markets','active_metals','news_sources','news_articles','news_metal_links','news_ingestion_runs','analytical_summaries','ai_daily_budget'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON %I FROM anon,authenticated',t);
 EXECUTE format('GRANT ALL ON %I TO service_role',t);
 END LOOP;
END $$;
GRANT SELECT ON regional_markets,active_metals,news_articles,news_metal_links TO anon,authenticated;
CREATE POLICY read_regions ON regional_markets FOR SELECT TO anon,authenticated USING(true);
CREATE POLICY read_active ON active_metals FOR SELECT TO anon,authenticated USING(true);
CREATE POLICY read_news ON news_articles FOR SELECT TO anon,authenticated USING(is_public AND metal_ids <@ ARRAY['tungsten','molybdenum','ferromolybdenum','ferrotungsten','tin','zinc','copper','aluminum','chromium','cobalt','zirconium','niobium','tantalum']::text[]);
CREATE POLICY read_links ON news_metal_links FOR SELECT TO anon,authenticated USING(EXISTS(SELECT 1 FROM news_articles WHERE id=article_id));
GRANT SELECT ON analytical_summaries TO authenticated;
CREATE POLICY read_own_summaries ON analytical_summaries FOR SELECT TO authenticated USING(owner_id=auth.uid());
-- No news schedule is activated here. See ops/news-schedule.sql after deployment.

GRANT SELECT(id,name,home_url,last_success_at,status,license_note) ON news_sources TO anon,authenticated;
CREATE POLICY read_news_sources ON news_sources FOR SELECT TO anon,authenticated USING(enabled AND approved_at IS NOT NULL);

ALTER TABLE news_articles ADD CONSTRAINT news_scope CHECK(metal_ids <@ ARRAY['tungsten','molybdenum','ferromolybdenum','ferrotungsten','tin','zinc','copper','aluminum','chromium','cobalt','zirconium','niobium','tantalum']::text[]);
ALTER TABLE news_articles ADD CONSTRAINT news_regions CHECK(regions <@ ARRAY['Европа','США','Азия']::text[]);
