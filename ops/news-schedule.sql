-- Apply manually only after deployment and explicit approval.
-- Set Vault news_collector_url=https://YOUR_PROJECT.supabase.co/functions/v1/collect-news.
-- collector_token already exists. Default every 30 minutes; adjust the cron expression here.
DO $$ BEGIN IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='collect-metal-news') THEN PERFORM cron.unschedule('collect-metal-news');END IF;END $$;
SELECT cron.schedule('collect-metal-news','*/30 * * * *',$cron$
 SELECT net.http_post(url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='news_collector_url'),
 headers := jsonb_build_object('Content-Type','application/json','x-collector-token',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='collector_token')),
 body := '{}'::jsonb,timeout_milliseconds := 150000);
$cron$);
