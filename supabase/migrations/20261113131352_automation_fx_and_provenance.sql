-- Additive automation structures. No existing observation is deleted or rewritten.
CREATE SCHEMA IF NOT EXISTS analytics_internal;
REVOKE ALL ON SCHEMA analytics_internal FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA analytics_internal TO service_role;
CREATE TABLE public.ingestion_payloads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_id text NOT NULL REFERENCES public.data_sources(id),
 source_url text NOT NULL CHECK(source_url LIKE 'https://%'),fetched_at timestamptz NOT NULL DEFAULT now(),
 content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[a-f0-9]{64}$'),raw_text text NOT NULL CHECK(octet_length(raw_text)<=1048576),
 UNIQUE(source_id,content_sha256)
);
ALTER TABLE public.ingestion_payloads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ingestion_payloads FROM anon,authenticated;
GRANT ALL ON public.ingestion_payloads TO service_role;
CREATE TABLE public.fx_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_id text NOT NULL REFERENCES public.data_sources(id),
 base_currency text NOT NULL CHECK(base_currency IN('USD','EUR','RUB','CNY')),
 quote_currency text NOT NULL CHECK(quote_currency IN('USD','EUR','RUB','CNY')),
 rate numeric NOT NULL CHECK(rate>0 AND rate<'Infinity'::numeric),rate_date timestamptz NOT NULL,
 retrieved_at timestamptz NOT NULL DEFAULT now(),source_url text NOT NULL CHECK(source_url LIKE 'https://%'),origin text NOT NULL,
 provider_details jsonb NOT NULL DEFAULT '[]',payload_id uuid REFERENCES public.ingestion_payloads(id),
 data_status text NOT NULL CHECK(data_status IN('live','cached')),UNIQUE(source_id,base_currency,quote_currency,rate_date),CHECK(base_currency<>quote_currency)
);
CREATE INDEX fx_pair_date_idx ON public.fx_observations(base_currency,quote_currency,rate_date DESC);
CREATE INDEX fx_payload_idx ON public.fx_observations(payload_id);
ALTER TABLE public.fx_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fx_observations FROM anon,authenticated;
GRANT SELECT ON public.fx_observations TO anon,authenticated;
GRANT ALL ON public.fx_observations TO service_role;
CREATE POLICY read_verified_fx ON public.fx_observations FOR SELECT TO anon,authenticated USING(data_status IN('live','cached'));
CREATE VIEW public.app_exchange_rates WITH(security_invoker=true) AS
 SELECT base_currency,quote_currency,rate,rate_date,origin,data_status,0::integer AS provider_priority FROM public.fx_observations
 UNION ALL SELECT base_currency,quote_currency,rate,rate_date,origin,data_status,20::integer AS provider_priority FROM public.exchange_rates;
GRANT SELECT ON public.app_exchange_rates TO anon,authenticated,service_role;
CREATE TABLE analytics_internal.automation_state (
 job text PRIMARY KEY CHECK(job IN('collect-fx','collect-quotes','compute-orientations')),
 enabled boolean NOT NULL DEFAULT true,min_interval_seconds integer NOT NULL CHECK(min_interval_seconds>=60),
 last_started_at timestamptz,lease_until timestamptz,lease_token uuid
);
ALTER TABLE analytics_internal.automation_state ENABLE ROW LEVEL SECURITY;
GRANT ALL ON analytics_internal.automation_state TO service_role;
CREATE POLICY server_automation_state ON analytics_internal.automation_state FOR ALL TO service_role USING(true) WITH CHECK(true);
INSERT INTO analytics_internal.automation_state(job,min_interval_seconds) VALUES('collect-fx',3600),('collect-quotes',1800),('compute-orientations',1800);
CREATE TABLE public.automation_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job text NOT NULL,started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
 status text NOT NULL CHECK(status IN('started','success','partial','error')),rows_written integer NOT NULL DEFAULT 0 CHECK(rows_written>=0),
 error_code text CHECK(length(error_code)<=100)
);
CREATE INDEX automation_runs_job_time ON public.automation_runs(job,started_at DESC);
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_runs FROM anon,authenticated;
GRANT SELECT ON public.automation_runs TO anon,authenticated;
GRANT ALL ON public.automation_runs TO service_role;
CREATE POLICY public_automation_status ON public.automation_runs FOR SELECT TO anon,authenticated USING(true);
-- These RPCs intentionally use INVOKER: only service_role receives EXECUTE and access to the private state.
CREATE FUNCTION public.claim_automation_job(p_job text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE token uuid;
BEGIN
 UPDATE analytics_internal.automation_state SET last_started_at=now(),lease_until=now()+interval '5 minutes',lease_token=gen_random_uuid()
 WHERE job=p_job AND enabled AND (last_started_at IS NULL OR last_started_at<now()-make_interval(secs=>min_interval_seconds))
 AND (lease_until IS NULL OR lease_until<now()) RETURNING lease_token INTO token;
 RETURN token;
END $$;
CREATE FUNCTION public.finish_automation_job(p_job text,p_token uuid) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 UPDATE analytics_internal.automation_state SET lease_until=NULL,lease_token=NULL WHERE job=p_job AND lease_token=p_token;
$$;
REVOKE ALL ON FUNCTION public.claim_automation_job(text),public.finish_automation_job(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_automation_job(text),public.finish_automation_job(text,uuid) TO service_role;
CREATE TABLE analytics_internal.quote_adapters (
 source_id text PRIMARY KEY REFERENCES public.data_sources(id),endpoint text NOT NULL CHECK(endpoint LIKE 'https://%'),allowed_hosts text[] NOT NULL,
 enabled boolean NOT NULL DEFAULT false,approved_at timestamptz,license_reference text NOT NULL,
 billing_mode text NOT NULL DEFAULT 'licensed' CHECK(billing_mode IN('free','licensed')),
 api_key_env text CHECK(api_key_env IS NULL OR api_key_env ~ '^QUOTE_[A-Z0-9_]+_API_KEY$')
);
ALTER TABLE analytics_internal.quote_adapters ENABLE ROW LEVEL SECURITY;
GRANT ALL ON analytics_internal.quote_adapters TO service_role;
CREATE POLICY server_quote_adapters ON analytics_internal.quote_adapters FOR ALL TO service_role USING(true) WITH CHECK(true);
-- Fetching configuration is a service-only API. No credentials are stored in this table.
CREATE FUNCTION public.get_quote_adapters() RETURNS SETOF analytics_internal.quote_adapters LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM analytics_internal.quote_adapters WHERE enabled AND approved_at IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.get_quote_adapters() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_quote_adapters() TO service_role;
CREATE TABLE analytics_internal.reference_benchmarks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),provider text NOT NULL,metal_id text NOT NULL REFERENCES public.active_metals(metal_id),
 commercial_key text NOT NULL,region text NOT NULL REFERENCES public.regional_markets(code),currency text NOT NULL,unit text NOT NULL,
 price numeric NOT NULL CHECK(price>0 AND price<'Infinity'::numeric),published_at timestamptz NOT NULL,
 license_reference text NOT NULL CHECK(length(license_reference)>0),redistribution_allowed boolean NOT NULL DEFAULT false,
 UNIQUE(provider,metal_id,commercial_key,region,published_at)
);
ALTER TABLE analytics_internal.reference_benchmarks ENABLE ROW LEVEL SECURITY;
GRANT ALL ON analytics_internal.reference_benchmarks TO service_role;
CREATE POLICY server_reference_benchmarks ON analytics_internal.reference_benchmarks FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE INDEX reference_benchmarks_metal_time ON analytics_internal.reference_benchmarks(metal_id,published_at DESC);
CREATE INDEX reference_benchmarks_region_idx ON analytics_internal.reference_benchmarks(region);
-- Readable registry entry; no API keys. Other configured sources remain untouched.
INSERT INTO public.data_sources(id,name,url,api_endpoint,market_type,region,quality_score,status,attribution,license,free_tier_limit,independence_id)
 VALUES('frankfurter-v2','Frankfurter v2','https://frankfurter.dev/','https://api.frankfurter.dev/v2/rates','spot','Глобальный',0.9,'pending',
 'Frankfurter — расчётные справочные курсы; первичные провайдеры сохранены отдельно',
 'https://frankfurter.dev/license/ — blended reference rates, commercial use and caching documented; not an official bank quote','Без API-ключа; приложение опрашивает не чаще раза в час','frankfurter-v2')
 ON CONFLICT(id) DO NOTHING;
-- New policies are scoped to the application tables. Existing CRM objects/functions are not touched.
