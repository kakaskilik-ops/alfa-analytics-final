-- Guest chat stores neither plain IP addresses nor public conversation histories.
CREATE TABLE analytics_internal.guest_ai_limits (
 visitor_hash text NOT NULL CHECK(visitor_hash~'^[a-f0-9]{64}$'),
 day date NOT NULL, requests integer NOT NULL CHECK(requests BETWEEN 1 AND 5),
 last_request_at timestamptz NOT NULL, PRIMARY KEY(visitor_hash,day)
);
ALTER TABLE analytics_internal.guest_ai_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON analytics_internal.guest_ai_limits FROM PUBLIC,anon,authenticated;
GRANT ALL ON analytics_internal.guest_ai_limits TO service_role;
CREATE POLICY service_guest_limits ON analytics_internal.guest_ai_limits FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE TABLE analytics_internal.guest_ai_nonces(nonce text PRIMARY KEY CHECK(nonce~'^[a-f0-9]{32}$'),created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE analytics_internal.guest_ai_nonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON analytics_internal.guest_ai_nonces FROM PUBLIC,anon,authenticated;
GRANT ALL ON analytics_internal.guest_ai_nonces TO service_role;
CREATE POLICY service_guest_nonces ON analytics_internal.guest_ai_nonces FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE FUNCTION public.consume_guest_ai_quota(p_visitor_hash text,p_nonce text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n integer; claimed text;
BEGIN
 IF p_visitor_hash IS NULL OR p_visitor_hash!~'^[a-f0-9]{64}$' THEN RETURN false;END IF;
 IF p_nonce IS NULL OR p_nonce!~'^[a-f0-9]{32}$' OR EXISTS(SELECT 1 FROM analytics_internal.guest_ai_nonces WHERE nonce=p_nonce) THEN RETURN false;END IF;
 INSERT INTO analytics_internal.guest_ai_limits VALUES(p_visitor_hash,(now() AT TIME ZONE 'UTC')::date,1,now())
 ON CONFLICT(visitor_hash,day) DO UPDATE SET requests=analytics_internal.guest_ai_limits.requests+1,last_request_at=now()
 WHERE analytics_internal.guest_ai_limits.requests<5 AND analytics_internal.guest_ai_limits.last_request_at<=now()-interval '30 seconds'
 RETURNING requests INTO n;
 IF n IS NULL THEN RETURN false;END IF;
 INSERT INTO analytics_internal.guest_ai_nonces(nonce) VALUES(p_nonce) ON CONFLICT DO NOTHING RETURNING nonce INTO claimed;
 RETURN claimed IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.consume_guest_ai_quota(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_guest_ai_quota(text,text) TO service_role;
CREATE TABLE public.guest_ai_cache (
 cache_key text PRIMARY KEY CHECK(cache_key~'^[a-f0-9]{64}$'),report jsonb NOT NULL,
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.guest_ai_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guest_ai_cache FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.guest_ai_cache TO service_role;
CREATE POLICY service_guest_cache ON public.guest_ai_cache FOR ALL TO service_role USING(true) WITH CHECK(true);
