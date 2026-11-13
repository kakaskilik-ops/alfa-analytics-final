-- Separate monthly statistical series from regional spot/commercial quotations.
INSERT INTO public.data_sources(id,name,url,api_endpoint,market_type,region,quality_score,status,attribution,license,free_tier_limit,independence_id)
VALUES('world-bank-pink-sheet','World Bank — Commodity Price Data (Pink Sheet)','https://www.worldbank.org/en/research/commodity-markets','https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx','exchange','Глобальный',0.9,'pending','The World Bank: Commodity Price Data (Pink Sheet): LME-based monthly averages. Not affiliated with or endorsed by the World Bank.','https://data.worldbank.org/summary-terms-of-use — CC BY 4.0 with additional terms; attribution to World Bank and underlying providers; dataset-specific restrictions take precedence.','Месячные данные, проверка не чаще раза в сутки','world-bank-pink-sheet') ON CONFLICT(id) DO NOTHING;
CREATE TABLE public.reference_import_payloads(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_id text NOT NULL REFERENCES public.data_sources(id),
 source_url text NOT NULL CHECK(source_url LIKE 'https://%'),content_sha256 text NOT NULL CHECK(content_sha256~'^[a-f0-9]{64}$'),
 raw_base64 text NOT NULL CHECK(octet_length(raw_base64)<=3400000),fetched_at timestamptz NOT NULL DEFAULT now(),UNIQUE(source_id,content_sha256)
);
ALTER TABLE public.reference_import_payloads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reference_import_payloads FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.reference_import_payloads TO service_role;
CREATE POLICY service_reference_payloads ON public.reference_import_payloads FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE TABLE public.reference_price_observations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),metal_id text NOT NULL REFERENCES public.active_metals(metal_id) CHECK(metal_id IN('aluminum','copper','tin','zinc')),
 source_id text NOT NULL REFERENCES public.data_sources(id),period_start date NOT NULL CHECK(extract(day from period_start)=1),
 price numeric NOT NULL CHECK(price>0 AND price<'Infinity'::numeric),currency text NOT NULL CHECK(currency='USD'),unit text NOT NULL CHECK(unit='ton'),
 region text NOT NULL CHECK(region='Мировой ориентир (LME)'),specification text NOT NULL CHECK(length(specification)>0),
 source_url text NOT NULL CHECK(source_url LIKE 'https://%'),retrieved_at timestamptz NOT NULL DEFAULT now(),payload_id uuid NOT NULL REFERENCES public.reference_import_payloads(id),
 UNIQUE(source_id,metal_id,period_start,price)
);
CREATE INDEX reference_observations_metal_period ON public.reference_price_observations(metal_id,period_start DESC,retrieved_at DESC);
CREATE INDEX reference_observations_payload ON public.reference_price_observations(payload_id);
ALTER TABLE public.reference_price_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reference_price_observations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.reference_price_observations TO anon,authenticated;
GRANT ALL ON public.reference_price_observations TO service_role;
CREATE POLICY public_monthly_reference ON public.reference_price_observations FOR SELECT TO anon,authenticated USING(period_start<date_trunc('month',now())::date);
CREATE POLICY server_monthly_reference ON public.reference_price_observations FOR ALL TO service_role USING(true) WITH CHECK(true);
ALTER TABLE analytics_internal.automation_state DROP CONSTRAINT automation_state_job_check;
ALTER TABLE analytics_internal.automation_state ADD CONSTRAINT automation_state_job_check CHECK(job IN('collect-fx','collect-quotes','compute-orientations','collect-reference-prices'));
INSERT INTO analytics_internal.automation_state(job,min_interval_seconds) VALUES('collect-reference-prices',86400);
