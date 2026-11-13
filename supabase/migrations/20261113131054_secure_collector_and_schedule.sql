CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'collector_token') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'collector_token', 'Token for scheduled market data collection');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.verify_collector_token(p_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_token IS NOT NULL AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'collector_token' AND decrypted_secret = p_token
  );
$$;

REVOKE EXECUTE ON FUNCTION public.verify_collector_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_collector_token(text) TO service_role;

REVOKE ALL ON metal_categories, metals, data_sources, metal_source_coverage, price_quotations, price_history, exchange_rates, update_logs, data_quality_records, favorites FROM anon, authenticated;
GRANT SELECT ON metal_categories, metals, data_sources, metal_source_coverage, price_quotations, price_history, exchange_rates, update_logs, data_quality_records TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON favorites TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'collect-market-data') THEN
    PERFORM cron.unschedule('collect-market-data');
  END IF;
END $$;

-- Scheduling is an explicit infrastructure step. See ops/schedule.sql.
