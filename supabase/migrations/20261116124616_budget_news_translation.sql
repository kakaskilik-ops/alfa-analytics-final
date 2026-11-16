-- Optional, bounded free-model news translation. No changes to existing counters or data.
CREATE TABLE analytics_internal.news_ai_daily_budget(day date PRIMARY KEY, requests integer NOT NULL CHECK(requests BETWEEN 1 AND 2));
ALTER TABLE analytics_internal.news_ai_daily_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON analytics_internal.news_ai_daily_budget FROM PUBLIC,anon,authenticated;
GRANT ALL ON analytics_internal.news_ai_daily_budget TO service_role;
CREATE POLICY server_only ON analytics_internal.news_ai_daily_budget FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE FUNCTION public.reserve_news_ai_translation() RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n integer;
BEGIN
 INSERT INTO analytics_internal.news_ai_daily_budget VALUES((now() AT TIME ZONE 'UTC')::date,1)
 ON CONFLICT(day) DO UPDATE SET requests=analytics_internal.news_ai_daily_budget.requests+1
 WHERE analytics_internal.news_ai_daily_budget.requests<2 RETURNING requests INTO n;
 IF n IS NULL THEN RETURN false; END IF;
 -- News shares the existing overall provider and token ceilings; it cannot create another quota.
 IF NOT public.reserve_free_ai_call(20,4) THEN RETURN false; END IF;
 RETURN public.reserve_ai_tokens(16000,160000);
END $$;
REVOKE ALL ON FUNCTION public.reserve_news_ai_translation() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_news_ai_translation() TO service_role;
