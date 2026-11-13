-- Additive migration. Apply only after reviewing against the target database.
ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS independence_id text;
UPDATE data_sources SET independence_id = id WHERE independence_id IS NULL;
ALTER TABLE price_quotations ADD COLUMN IF NOT EXISTS composition text;
-- Existing invalid values stay for audit; new writes must pass constraints.
ALTER TABLE price_quotations ADD CONSTRAINT quote_positive CHECK (original_price > 0 AND normalized_price > 0) NOT VALID;
ALTER TABLE price_quotations ADD CONSTRAINT quote_units CHECK (original_unit IN ('kg','ton','g','ozt','lb') AND normalized_unit IN ('kg','ton','g','ozt','lb')) NOT VALID;
ALTER TABLE price_history ADD CONSTRAINT history_positive_ohlc CHECK (low > 0 AND high >= greatest(open,close) AND low <= least(open,close) AND high >= low) NOT VALID;
-- Rows from the old collector have native-unit history; they cannot be reliably combined.
UPDATE price_history SET data_status='unavailable' WHERE source_id='yahoo-finance';
UPDATE price_quotations SET validation_status='suspect' WHERE metal_id='hot-rolled' AND source_id='yahoo-finance';
CREATE TABLE IF NOT EXISTS metal_specifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), metal_id text NOT NULL REFERENCES metals(id),
 grade text NOT NULL, form text NOT NULL, composition text, standard_ref text,
 verification_status text NOT NULL DEFAULT 'needs_review' CHECK (verification_status IN ('needs_review','verified')),
 UNIQUE(metal_id,grade,form)
);
CREATE TABLE IF NOT EXISTS market_indices (
 id text PRIMARY KEY, name text NOT NULL, methodology text NOT NULL, version integer NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS index_observations (
 index_id text REFERENCES market_indices(id), observed_at timestamptz NOT NULL, value numeric NOT NULL CHECK(value>0),
 constituents jsonb NOT NULL, PRIMARY KEY(index_id,observed_at)
);
CREATE TABLE IF NOT EXISTS analytical_calculations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), metal_id text REFERENCES metals(id), comparison_key text NOT NULL,
 methodology_version text NOT NULL, input_quote_ids uuid[] NOT NULL, result jsonb NOT NULL, computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calculations_metal_time ON analytical_calculations(metal_id,computed_at DESC);
CREATE INDEX IF NOT EXISTS quotation_validation_time ON price_quotations(validation_status,quoted_at DESC);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['metal_specifications','market_indices','index_observations','analytical_calculations'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY read_approved ON %I FOR SELECT TO anon,authenticated USING (true)',t);
  EXECUTE format('REVOKE ALL ON %I FROM anon,authenticated',t);
  EXECUTE format('GRANT SELECT ON %I TO anon,authenticated',t);
  EXECUTE format('GRANT ALL ON %I TO service_role',t);
 END LOOP;
END $$;
-- Public raw rows are limited to approved data. Internal logs/quality details stay private.
DROP POLICY IF EXISTS public_read_price_quotations ON price_quotations;
CREATE POLICY public_read_price_quotations ON price_quotations FOR SELECT TO anon,authenticated
 USING (data_status IN ('live','cached') AND validation_status='valid' AND normalized_price>0);
DROP POLICY IF EXISTS public_read_price_history ON price_history;
CREATE POLICY public_read_price_history ON price_history FOR SELECT TO anon,authenticated USING (data_status IN ('live','cached') AND close>0);
DROP POLICY IF EXISTS public_read_exchange_rates ON exchange_rates;
CREATE POLICY public_read_exchange_rates ON exchange_rates FOR SELECT TO anon,authenticated USING (data_status IN ('live','cached'));
REVOKE SELECT ON data_quality_records FROM anon,authenticated;
-- Only sanitized status counts, never provider messages, are visible in update_logs.
REVOKE SELECT ON update_logs FROM anon,authenticated;
GRANT SELECT(id,job,source_id,status,started_at,finished_at,rows_written) ON update_logs TO anon,authenticated;
REVOKE SELECT ON data_sources FROM anon,authenticated;
GRANT SELECT(id,name,url,api_endpoint,market_type,region,quality_score,status,api_key_required,api_key_configured,attribution,license,free_tier_limit,last_success_at,updated_at,independence_id) ON data_sources TO anon,authenticated;
CREATE TABLE IF NOT EXISTS ai_request_limits (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, window_start timestamptz NOT NULL, requests integer NOT NULL CHECK(requests>0),
 PRIMARY KEY(user_id,window_start)
);
ALTER TABLE ai_request_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_request_limits FROM anon,authenticated;
CREATE OR REPLACE FUNCTION public.consume_ai_quota(p_user_id uuid) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
 DECLARE n integer; w timestamptz:=date_trunc('hour',now());
 BEGIN
  INSERT INTO public.ai_request_limits(user_id,window_start,requests) VALUES(p_user_id,w,1)
  ON CONFLICT(user_id,window_start) DO UPDATE SET requests=public.ai_request_limits.requests+1
  WHERE public.ai_request_limits.requests<10 RETURNING requests INTO n;
  DELETE FROM public.ai_request_limits WHERE window_start < now()-interval '2 days';
  RETURN n IS NOT NULL;
 END $$;
REVOKE ALL ON FUNCTION public.consume_ai_quota(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(uuid) TO service_role;

ALTER TABLE price_history ADD COLUMN IF NOT EXISTS comparison_key text NOT NULL DEFAULT 'legacy-unverified';
ALTER TABLE price_history DROP CONSTRAINT IF EXISTS price_history_metal_id_source_id_trade_date_key;
ALTER TABLE price_history ADD CONSTRAINT history_specification_unique UNIQUE(metal_id,source_id,trade_date,comparison_key);
UPDATE price_history SET data_status='unavailable' WHERE comparison_key='legacy-unverified';
-- Multiple grades/forms quoted by the same source at the same instant are distinct observations.
ALTER TABLE price_quotations DROP CONSTRAINT IF EXISTS price_quotations_metal_id_source_id_quoted_at_key;
ALTER TABLE price_quotations ADD CONSTRAINT quote_specification_unique UNIQUE NULLS NOT DISTINCT
(metal_id,source_id,quoted_at,region,market_type,grade,product_form,composition,price_type);
