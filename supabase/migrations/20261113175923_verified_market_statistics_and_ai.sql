INSERT INTO public.data_sources(id,name,url,api_endpoint,market_type,region,quality_score,status,attribution,license,free_tier_limit,independence_id)
VALUES('un-comtrade','UN Comtrade — годовая торговая статистика','https://comtradeplus.un.org/','https://comtradeapi.un.org/public/v1/preview/C/A/HS','wholesale','Глобальный',0.9,'pending','United Nations Statistics Division — UN Comtrade. Annual country totals, imports CIF / exports FOB; not market quotations.','https://uncomtrade.org/docs/re-dissemination-of-data/ — limited re-dissemination below 100000 records, preserve UN attribution; application hard cap 5000 observations. No bulk resale.','Public preview до 500 записей; здесь до 100 записей/запрос, последовательные запросы и почасовое расписание.','un-comtrade') ON CONFLICT(id) DO NOTHING;
CREATE TABLE public.market_statistics(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_id text NOT NULL REFERENCES public.data_sources(id),metal_id text NOT NULL REFERENCES public.active_metals(metal_id),
 metric text NOT NULL CHECK(metric IN('import_value','export_value','import_mass','export_mass','mine_production','reserves')),
 value numeric NOT NULL CHECK(value>=0 AND value<'Infinity'::numeric),unit text NOT NULL CHECK(unit IN('USD','kg','ton')),
 period_year integer NOT NULL CHECK(period_year BETWEEN 1900 AND 2100),country_code text NOT NULL,country text NOT NULL,region text NOT NULL,
 commodity_code text NOT NULL,product_description text NOT NULL,estimated boolean NOT NULL DEFAULT false,source_reported boolean,source_aggregate boolean,
 source_url text NOT NULL CHECK(source_url LIKE 'https://%'),retrieved_at timestamptz NOT NULL DEFAULT now(),payload_id uuid NOT NULL REFERENCES public.ingestion_payloads(id),
 UNIQUE(source_id,metal_id,metric,country_code,period_year,commodity_code),
 CHECK((metric IN('import_value','export_value') AND unit='USD') OR (metric NOT IN('import_value','export_value') AND unit IN('kg','ton')))
);
CREATE INDEX market_statistics_metal_year ON public.market_statistics(metal_id,period_year DESC,country_code);
CREATE INDEX market_statistics_payload ON public.market_statistics(payload_id);
ALTER TABLE public.market_statistics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.market_statistics FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.market_statistics TO anon,authenticated;
GRANT ALL ON public.market_statistics TO service_role;
CREATE POLICY public_completed_statistics ON public.market_statistics FOR SELECT TO anon,authenticated USING(period_year<extract(year from now()));
CREATE POLICY service_statistics ON public.market_statistics FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE TABLE public.statistic_collection_state(metal_id text PRIMARY KEY REFERENCES public.active_metals(metal_id),last_attempt_at timestamptz,status text NOT NULL DEFAULT 'pending',error_code text);
ALTER TABLE public.statistic_collection_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.statistic_collection_state FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.statistic_collection_state TO service_role;
CREATE POLICY service_statistics_state ON public.statistic_collection_state FOR ALL TO service_role USING(true) WITH CHECK(true);
INSERT INTO public.statistic_collection_state(metal_id) SELECT metal_id FROM public.active_metals WHERE metal_id<>'niobium';
CREATE TABLE public.market_ai_reports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),evidence_hash text NOT NULL UNIQUE CHECK(evidence_hash~'^[a-f0-9]{64}$'),report jsonb NOT NULL,provider text NOT NULL,model text NOT NULL,generated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX market_ai_reports_time ON public.market_ai_reports(generated_at DESC);
ALTER TABLE public.market_ai_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.market_ai_reports FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.market_ai_reports TO anon,authenticated;
GRANT ALL ON public.market_ai_reports TO service_role;
CREATE POLICY read_generated_market_reports ON public.market_ai_reports FOR SELECT TO anon,authenticated USING(true);
CREATE POLICY service_market_reports ON public.market_ai_reports FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE TABLE analytics_internal.ai_call_budget(day date PRIMARY KEY,requests integer NOT NULL CHECK(requests>0));
CREATE TABLE analytics_internal.ai_call_windows(window_start timestamptz PRIMARY KEY,requests integer NOT NULL CHECK(requests>0));
CREATE TABLE analytics_internal.ai_work_locks(key text PRIMARY KEY CHECK(key~'^[a-f0-9]{64}$'),lease_until timestamptz NOT NULL,token uuid);
CREATE TABLE public.ai_provider_health(provider text PRIMARY KEY,last_success_at timestamptz NOT NULL,model text NOT NULL);
ALTER TABLE public.ai_provider_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_provider_health FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.ai_provider_health TO service_role;
CREATE POLICY service_model_health ON public.ai_provider_health FOR ALL TO service_role USING(true) WITH CHECK(true);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['ai_call_budget','ai_call_windows','ai_work_locks'] LOOP EXECUTE format('ALTER TABLE analytics_internal.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON analytics_internal.%I FROM PUBLIC,anon,authenticated',t);EXECUTE format('GRANT ALL ON analytics_internal.%I TO service_role',t);EXECUTE format('CREATE POLICY server_only ON analytics_internal.%I FOR ALL TO service_role USING(true) WITH CHECK(true)',t);END LOOP;END $$;
CREATE FUNCTION public.reserve_free_ai_call(p_daily_limit integer,p_minute_limit integer) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n integer;
BEGIN
 INSERT INTO analytics_internal.ai_call_budget VALUES((now() AT TIME ZONE 'UTC')::date,1) ON CONFLICT(day) DO UPDATE SET requests=analytics_internal.ai_call_budget.requests+1 WHERE analytics_internal.ai_call_budget.requests<least(greatest(p_daily_limit,1),40) RETURNING requests INTO n;
 IF n IS NULL THEN RETURN false;END IF;
 n:=NULL;INSERT INTO analytics_internal.ai_call_windows VALUES(date_trunc('minute',now()),1) ON CONFLICT(window_start) DO UPDATE SET requests=analytics_internal.ai_call_windows.requests+1 WHERE analytics_internal.ai_call_windows.requests<least(greatest(p_minute_limit,1),4) RETURNING requests INTO n;
 RETURN n IS NOT NULL;
END $$;
CREATE FUNCTION public.claim_ai_work(p_key text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
 IF p_key IS NULL OR p_key!~'^[a-f0-9]{64}$' THEN RETURN NULL;END IF;
 INSERT INTO analytics_internal.ai_work_locks VALUES(p_key,now()+interval '100 seconds',gen_random_uuid()) ON CONFLICT(key) DO UPDATE SET lease_until=now()+interval '100 seconds',token=gen_random_uuid() WHERE analytics_internal.ai_work_locks.lease_until<now() RETURNING token INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.release_ai_work(p_key text,p_token uuid) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ UPDATE analytics_internal.ai_work_locks SET lease_until=now(),token=NULL WHERE key=p_key AND token=p_token $$;
REVOKE ALL ON FUNCTION public.reserve_free_ai_call(integer,integer),public.claim_ai_work(text),public.release_ai_work(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_free_ai_call(integer,integer),public.claim_ai_work(text),public.release_ai_work(text,uuid) TO service_role;
ALTER TABLE analytics_internal.automation_state DROP CONSTRAINT automation_state_job_check;
ALTER TABLE analytics_internal.automation_state ADD CONSTRAINT automation_state_job_check CHECK(job IN('collect-fx','collect-quotes','compute-orientations','collect-reference-prices','collect-trade','generate-market-report'));
INSERT INTO analytics_internal.automation_state(job,min_interval_seconds) VALUES('collect-trade',3500),('generate-market-report',3500);
