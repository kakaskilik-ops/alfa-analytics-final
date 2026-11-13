-- Execute only against the confirmed ALFA ANALYTICS database after deploying the functions.
-- Provide the PUBLIC project URL for this session, e.g.:
-- SET alfa_analytics.project_url = 'https://YOUR_PROJECT.supabase.co';
DO $$
DECLARE url text:=current_setting('alfa_analytics.project_url',true);secret_id uuid;
BEGIN
 IF url IS NULL OR url !~ '^https://[a-z0-9]{20}\.supabase\.co$' THEN RAISE EXCEPTION 'A confirmed Supabase project URL is required';END IF;
 SELECT id INTO secret_id FROM vault.secrets WHERE name='alfa_analytics_project_url';
 IF secret_id IS NULL THEN PERFORM vault.create_secret(url,'alfa_analytics_project_url','Public API base URL for ALFA ANALYTICS');
 ELSE PERFORM vault.update_secret(secret_id,url);END IF;
 IF NOT EXISTS(SELECT 1 FROM vault.secrets WHERE name='collector_token') THEN RAISE EXCEPTION 'collector_token is not configured';END IF;
END $$;
-- These application-prefixed jobs do not alter unrelated schedules.
SELECT cron.schedule('alfa-fx-hourly','7 * * * *',$job$
 SELECT net.http_post(url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='alfa_analytics_project_url')||'/functions/v1/collect-fx',headers:=jsonb_build_object('Content-Type','application/json','x-collector-token',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='collector_token')),body:='{"days":7}'::jsonb,timeout_milliseconds:=120000);
$job$);
SELECT cron.schedule('alfa-quotes-30m','0,30 * * * *',$job$
 SELECT net.http_post(url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='alfa_analytics_project_url')||'/functions/v1/collect-quotes',headers:=jsonb_build_object('Content-Type','application/json','x-collector-token',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='collector_token')),body:='{}'::jsonb,timeout_milliseconds:=120000);
$job$);
SELECT cron.schedule('alfa-news-30m','5,35 * * * *',$job$
 SELECT net.http_post(url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='alfa_analytics_project_url')||'/functions/v1/collect-news',headers:=jsonb_build_object('Content-Type','application/json','x-collector-token',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='collector_token')),body:='{}'::jsonb,timeout_milliseconds:=120000);
$job$);
SELECT cron.schedule('alfa-orientations-30m','10,40 * * * *',$job$
 SELECT net.http_post(url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='alfa_analytics_project_url')||'/functions/v1/compute-orientations',headers:=jsonb_build_object('Content-Type','application/json','x-collector-token',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='collector_token')),body:='{}'::jsonb,timeout_milliseconds:=120000);
$job$);
