-- Apply ONLY after approval, migration, deployment and smoke checks.
-- SET alfa_analytics.project_url = 'https://vlfzjvwgrvyllvshwmzr.supabase.co';
DO $$ BEGIN
 IF current_setting('alfa_analytics.project_url',true) IS DISTINCT FROM 'https://vlfzjvwgrvyllvshwmzr.supabase.co' THEN RAISE EXCEPTION 'Wrong project: market monitor activation denied';END IF;
 IF NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='alfa_analytics_project_url' AND decrypted_secret='https://vlfzjvwgrvyllvshwmzr.supabase.co') THEN RAISE EXCEPTION 'Wrong/missing Vault project URL';END IF;
 IF NOT EXISTS(SELECT 1 FROM vault.secrets WHERE name='collector_token') THEN RAISE EXCEPTION 'Missing collector token';END IF;
END $$;
-- Source-specific leases enforce TED/CF >=30 min, USAspending >=60 min.
UPDATE public.monitor_sources SET enabled=true WHERE id IN('ted','usaspending','contracts-finder');
SELECT cron.schedule('alfa-market-monitor-15m','3,18,33,48 * * * *',$job$
 SELECT net.http_post(url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='alfa_analytics_project_url')||'/functions/v1/collect-market-monitor',headers:=jsonb_build_object('Content-Type','application/json','x-collector-token',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='collector_token')),body:='{}'::jsonb,timeout_milliseconds:=120000);
$job$);
-- Stop only this module: SELECT cron.unschedule('alfa-market-monitor-15m');
-- UPDATE public.monitor_sources SET enabled=false; -- preserves events/documents/history.
