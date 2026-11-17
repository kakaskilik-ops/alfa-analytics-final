-- Authorised release only. Existing schedules and Groq are untouched.
DO $$ BEGIN
 IF current_setting('alfa_analytics.project_url',true) IS DISTINCT FROM 'https://vlfzjvwgrvyllvshwmzr.supabase.co' OR NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='alfa_analytics_project_url' AND decrypted_secret='https://vlfzjvwgrvyllvshwmzr.supabase.co') THEN RAISE EXCEPTION 'Wrong project';END IF;
 IF NOT EXISTS(SELECT 1 FROM vault.secrets WHERE name='collector_token') THEN RAISE EXCEPTION 'Missing collector token';END IF;
END $$;
UPDATE analytics_internal.automation_state SET enabled=true WHERE job='collect-price-evidence';
SELECT cron.schedule('alfa-price-evidence-daily','40 6 * * *',$job$
 SELECT net.http_post(url:=(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='alfa_analytics_project_url')||'/functions/v1/collect-price-evidence',headers:=jsonb_build_object('Content-Type','application/json','x-collector-token',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='collector_token')),body:='{}'::jsonb,timeout_milliseconds:=120000);
$job$);
-- Rollback: unschedule only alfa-price-evidence-daily and disable collect-price-evidence; retain data.
