-- ALFA MARKET MONITOR. No AI dependency. Activation is explicit; existing jobs/data are untouched.
CREATE TABLE public.monitor_sources(
 id text PRIMARY KEY,name text NOT NULL,home_url text NOT NULL,license_url text NOT NULL,
 supported_regions text[] NOT NULL,supported_metals text[] NOT NULL,
 min_interval_seconds integer NOT NULL CHECK(min_interval_seconds>=900),enabled boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'not_started' CHECK(status IN('not_started','connected','delayed','error','partial')),
 last_checked_at timestamptz,last_success_at timestamptz,error_code text,
 CHECK(home_url LIKE 'https://%' AND license_url LIKE 'https://%')
);
INSERT INTO public.monitor_sources(id,name,home_url,license_url,supported_regions,supported_metals,min_interval_seconds)
SELECT v.id,v.name,v.home,v.license,v.regions,ARRAY(SELECT metal_id FROM public.active_metals ORDER BY metal_id),v.interval
FROM(VALUES
 ('ted','TED — официальные извещения ЕС','https://ted.europa.eu/','https://ted.europa.eu/en/legal-notice',ARRAY['Европа'],1800),
 ('usaspending','USAspending — федеральные контракты','https://www.usaspending.gov/','https://www.usaspending.gov/about',ARRAY['США'],3600),
 ('contracts-finder','Contracts Finder — Великобритания','https://www.contractsfinder.service.gov.uk/','https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',ARRAY['Европа'],1800)
)v(id,name,home,license,regions,interval);
CREATE TABLE analytics_internal.monitor_source_state(source_id text PRIMARY KEY REFERENCES public.monitor_sources(id),cursor jsonb NOT NULL DEFAULT '{}',lease_token uuid,lease_until timestamptz,next_allowed_at timestamptz,failures integer NOT NULL DEFAULT 0);
INSERT INTO analytics_internal.monitor_source_state(source_id) SELECT id FROM public.monitor_sources;
CREATE TABLE analytics_internal.monitor_documents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_id text NOT NULL REFERENCES public.monitor_sources(id),content_hash text NOT NULL,
 source_url text NOT NULL,payload jsonb NOT NULL CHECK(octet_length(payload::text)<=131072),received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_id,content_hash)
);
CREATE TABLE public.monitor_events(
 id text PRIMARY KEY,source_id text NOT NULL REFERENCES public.monitor_sources(id),entity_id text NOT NULL,process_id text NOT NULL,
 data jsonb NOT NULL,content_hash text NOT NULL,revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 publication_status text NOT NULL CHECK(publication_status IN('published','pending','withdrawn')),
 published_on date,last_checked_at timestamptz NOT NULL DEFAULT now(),document_id uuid NOT NULL REFERENCES analytics_internal.monitor_documents(id),
 UNIQUE(source_id,entity_id),
 CHECK(jsonb_typeof(data)='object' AND jsonb_typeof(data->'metalIds')='array' AND jsonb_array_length(data->'metalIds')>0),
 CHECK((data->'metalIds') <@ '["tungsten","molybdenum","ferromolybdenum","ferrotungsten","tin","zinc","copper","aluminum","chromium","cobalt","zirconium","niobium","tantalum"]'::jsonb)
);
CREATE INDEX monitor_events_date ON public.monitor_events(published_on DESC,id);
CREATE INDEX monitor_events_process ON public.monitor_events(source_id,process_id);
CREATE INDEX monitor_events_metals ON public.monitor_events USING gin((data->'metalIds'));
CREATE TABLE analytics_internal.monitor_event_revisions(event_id text NOT NULL REFERENCES public.monitor_events(id),revision integer NOT NULL,data jsonb NOT NULL,document_id uuid NOT NULL REFERENCES analytics_internal.monitor_documents(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(event_id,revision));
CREATE TABLE analytics_internal.monitor_review_queue(event_id text PRIMARY KEY REFERENCES public.monitor_events(id),revision integer NOT NULL,reasons jsonb NOT NULL,draft_story jsonb NOT NULL,state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','approved','rejected')),note text,reviewed_at timestamptz);
CREATE TABLE analytics_internal.monitor_storage(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),used_bytes bigint NOT NULL DEFAULT 0 CHECK(used_bytes>=0));
INSERT INTO analytics_internal.monitor_storage DEFAULT VALUES;
CREATE TABLE public.monitor_publications(event_id text PRIMARY KEY REFERENCES public.monitor_events(id),revision integer NOT NULL,title_ru text NOT NULL,body_ru text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.monitor_public_updates(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,event_id text NOT NULL,revision integer NOT NULL,action text NOT NULL CHECK(action IN('published','corrected','withdrawn')),reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX monitor_public_updates_event ON public.monitor_public_updates(event_id,created_at DESC);
CREATE TABLE analytics_internal.monitor_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_id text NOT NULL REFERENCES public.monitor_sources(id),started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,status text NOT NULL CHECK(status IN('started','success','partial','error')),records_seen integer NOT NULL DEFAULT 0,events_changed integer NOT NULL DEFAULT 0,error_code text);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['monitor_sources','monitor_events','monitor_publications','monitor_public_updates'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT SELECT ON public.%I TO anon,authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 EXECUTE format('CREATE POLICY service_all ON public.%I FOR ALL TO service_role USING(true) WITH CHECK(true)',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['monitor_source_state','monitor_documents','monitor_event_revisions','monitor_review_queue','monitor_runs','monitor_storage'] LOOP
 EXECUTE format('ALTER TABLE analytics_internal.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON analytics_internal.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT ALL ON analytics_internal.%I TO service_role',t);
 EXECUTE format('CREATE POLICY server_only ON analytics_internal.%I FOR ALL TO service_role USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;
REVOKE SELECT ON public.monitor_events FROM anon,authenticated;
GRANT SELECT(id,source_id,entity_id,process_id,data,revision,publication_status,published_on,last_checked_at) ON public.monitor_events TO anon,authenticated;
CREATE POLICY public_sources ON public.monitor_sources FOR SELECT TO anon,authenticated USING(true);
CREATE POLICY confirmed_events ON public.monitor_events FOR SELECT TO anon,authenticated USING(publication_status='published');
CREATE POLICY confirmed_publications ON public.monitor_publications FOR SELECT TO anon,authenticated USING(EXISTS(SELECT 1 FROM public.monitor_events e WHERE e.id=event_id AND e.publication_status='published'));
CREATE POLICY public_changes ON public.monitor_public_updates FOR SELECT TO anon,authenticated USING(true);
GRANT USAGE,SELECT ON SEQUENCE public.monitor_public_updates_id_seq TO service_role;

CREATE FUNCTION public.monitor_price(p jsonb) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE f numeric;a numeric;q numeric;
BEGIN
 IF p->'singleMaterialLine' IS DISTINCT FROM 'true'::jsonb OR p->'includesServices' IS DISTINCT FROM 'false'::jsonb OR p->>'amountBasis' IS DISTINCT FROM 'single_material_line' OR coalesce(p->>'priceKind','') NOT IN('initial','bid','award','signed_contract','delivery') THEN RETURN NULL;END IF;
 IF jsonb_array_length(p->'metalIds') IS DISTINCT FROM 1 THEN RETURN NULL;END IF;
 IF coalesce(p->>'amount','')!~'^\d{1,20}(\.\d{1,12})?$' OR coalesce(p->>'quantity','')!~'^\d{1,20}(\.\d{1,12})?$' OR coalesce(p->>'currency','')!~'^[A-Z]{3}$' THEN RETURN NULL;END IF;
 f:=CASE p->>'unit' WHEN 'kg' THEN 1 WHEN 'KGM' THEN 1 WHEN 't' THEN 1000 WHEN 'ton' THEN 1000 WHEN 'tonne' THEN 1000 WHEN 'TNE' THEN 1000 WHEN 'g' THEN 0.001 WHEN 'GRM' THEN 0.001 WHEN 'lb' THEN 0.45359237 WHEN 'LBR' THEN 0.45359237 ELSE NULL END;
 a:=(p->>'amount')::numeric;q:=(p->>'quantity')::numeric;
 IF f IS NULL OR a<=0 OR q<=0 THEN RETURN NULL;END IF;RETURN round(a/(q*f),12);
END $$;
REVOKE ALL ON FUNCTION public.monitor_price(jsonb) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.monitor_price(jsonb) TO service_role;

CREATE FUNCTION public.monitor_claim_source(p_source text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE token uuid;
BEGIN
 UPDATE analytics_internal.monitor_source_state st SET lease_token=gen_random_uuid(),lease_until=now()+interval '4 minutes',next_allowed_at=now()+make_interval(secs=>s.min_interval_seconds)
 FROM public.monitor_sources s WHERE st.source_id=s.id AND s.id=p_source AND s.enabled AND (st.lease_until IS NULL OR st.lease_until<now()) AND (st.next_allowed_at IS NULL OR st.next_allowed_at<=now()) RETURNING st.lease_token INTO token;RETURN token;
END $$;
REVOKE ALL ON FUNCTION public.monitor_claim_source(text) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.monitor_claim_source(text) TO service_role;

CREATE FUNCTION public.monitor_store_event(p_source text,p_event jsonb,p_document jsonb,p_story jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE eid text;did uuid;h text;raw_hash text;old public.monitor_events;rev integer;st text;val numeric;d jsonb;is_new boolean:=false;reserved boolean;other record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.monitor_sources WHERE id=p_source AND enabled) THEN RAISE EXCEPTION 'monitor_source_disabled';END IF;
 IF p_event->>'sourceId' IS DISTINCT FROM p_source OR coalesce(length(p_event->>'entityId'),0) NOT BETWEEN 1 AND 450 OR coalesce(length(p_story->>'text'),0) NOT BETWEEN 1 AND 40000 OR coalesce(length(p_story->>'title'),0) NOT BETWEEN 1 AND 1000 OR jsonb_typeof(p_event->'reviewReasons') IS DISTINCT FROM 'array' OR coalesce(p_event->>'stage','') NOT IN('notice','amendment','result','award','award_record','signed','contract','implementation','fulfilled','cancelled','terminated','price_publication') OR coalesce(jsonb_array_length(p_event->'metalIds'),0)=0 THEN RAISE EXCEPTION 'invalid_monitor_event';END IF;
 IF coalesce(p_event->>'sourceUrl','')!~'^https://' OR (p_event->>'publishedOn' IS NOT NULL AND ((p_event->>'publishedOn')!~'^\d{4}-\d{2}-\d{2}$' OR (p_event->>'publishedOn')::date>current_date+1)) THEN RAISE EXCEPTION 'invalid_monitor_provenance';END IF;
 IF coalesce(p_event->>'sourceUrl','') !~ (CASE p_source WHEN 'ted' THEN '^https://ted\.europa\.eu/' WHEN 'usaspending' THEN '^https://www\.usaspending\.gov/award/' WHEN 'contracts-finder' THEN '^https://www\.contractsfinder\.service\.gov\.uk/Notice/' ELSE '^$' END) THEN RAISE EXCEPTION 'invalid_monitor_source_host';END IF;
 IF octet_length(p_document::text)>131072 THEN RAISE EXCEPTION 'monitor_document_too_large';END IF;
 IF (SELECT count(*) FROM public.monitor_events)>=5000 AND NOT EXISTS(SELECT 1 FROM public.monitor_events WHERE source_id=p_source AND entity_id=p_event->>'entityId') THEN RAISE EXCEPTION 'monitor_storage_cap';END IF;
 val:=CASE WHEN jsonb_array_length(p_event->'reviewReasons')=0 THEN public.monitor_price(p_event) ELSE NULL END;
 IF p_event->>'pricePerKg' IS NOT NULL AND (val IS NULL OR (p_event->>'pricePerKg')::numeric<>val) THEN RAISE EXCEPTION 'monitor_price_mismatch';END IF;
 d:=jsonb_set(p_event,'{pricePerKg}',coalesce(to_jsonb(val::text),'null'::jsonb));
 d:=jsonb_set(d,'{comparable}',to_jsonb(coalesce(val IS NOT NULL AND coalesce(d->>'specification','')<>'' AND coalesce(d->>'deliveryTerms','')<>'' AND jsonb_typeof(d->'taxIncluded')='boolean' AND jsonb_typeof(d->'logisticsIncluded')='boolean' AND coalesce(d->>'additionalCharges','')<>'' AND d->>'stage' IN('award','signed','fulfilled') AND jsonb_array_length(d->'reviewReasons')=0,false)));
 h:=encode(sha256(convert_to(d::text,'UTF8')),'hex');eid:=p_source||':'||(d->>'entityId');
 raw_hash:=encode(sha256(convert_to(p_document::text,'UTF8')),'hex');
 INSERT INTO analytics_internal.monitor_documents(source_id,content_hash,source_url,payload) VALUES(p_source,raw_hash,d->>'sourceUrl',p_document) ON CONFLICT(source_id,content_hash) DO NOTHING RETURNING id INTO did;
 IF did IS NOT NULL THEN
 UPDATE analytics_internal.monitor_storage SET used_bytes=used_bytes+octet_length(p_document::text) WHERE singleton AND used_bytes+octet_length(p_document::text)<=41943040 RETURNING true INTO reserved;
 IF reserved IS DISTINCT FROM true THEN RAISE EXCEPTION 'monitor_document_storage_cap';END IF;
 ELSE SELECT id INTO did FROM analytics_internal.monitor_documents WHERE source_id=p_source AND content_hash=raw_hash;END IF;
 st:=CASE WHEN d->>'stage' IN('cancelled','terminated') THEN 'withdrawn' WHEN jsonb_array_length(d->'reviewReasons')=0 THEN 'published' ELSE 'pending' END;
 IF st='published' AND (d->>'publishedOn' IS NULL OR coalesce(d->>'country','')='' OR coalesce(d->>'region','') NOT IN('Европа','США','Азия') OR coalesce(d->>'title','')='') THEN RAISE EXCEPTION 'unverified_public_event';END IF;
 INSERT INTO public.monitor_events(id,source_id,entity_id,process_id,data,content_hash,publication_status,published_on,document_id) VALUES(eid,p_source,d->>'entityId',d->>'processId',d,h,'pending',(d->>'publishedOn')::date,did) ON CONFLICT(id) DO NOTHING RETURNING true INTO is_new;
 SELECT * INTO old FROM public.monitor_events WHERE id=eid FOR UPDATE;
 IF NOT coalesce(is_new,false) AND old.content_hash=h THEN UPDATE public.monitor_events SET last_checked_at=now() WHERE id=eid;RETURN jsonb_build_object('action','duplicate','id',eid,'revision',old.revision);END IF;
 IF NOT coalesce(is_new,false) AND old.published_on>(d->>'publishedOn')::date THEN RETURN jsonb_build_object('action','older_release_ignored','id',eid);END IF;
 IF NOT coalesce(is_new,false) AND old.published_on=(d->>'publishedOn')::date AND coalesce(old.data->>'sourceVersion','')>coalesce(d->>'sourceVersion','') THEN RETURN jsonb_build_object('action','older_release_ignored','id',eid);END IF;
 rev:=CASE WHEN coalesce(is_new,false) THEN 1 ELSE old.revision+1 END;
 UPDATE public.monitor_events SET data=d,content_hash=h,revision=rev,publication_status=st,published_on=(d->>'publishedOn')::date,document_id=did,last_checked_at=now() WHERE id=eid;
 INSERT INTO analytics_internal.monitor_event_revisions(event_id,revision,data,document_id) VALUES(eid,rev,d,did);
 IF st='published' THEN
 INSERT INTO public.monitor_publications(event_id,revision,title_ru,body_ru) VALUES(eid,rev,p_story->>'title',p_story->>'text') ON CONFLICT(event_id) DO UPDATE SET revision=excluded.revision,title_ru=excluded.title_ru,body_ru=excluded.body_ru,updated_at=now();
 INSERT INTO public.monitor_public_updates(event_id,revision,action,reason) VALUES(eid,rev,CASE WHEN rev=1 THEN 'published' ELSE 'corrected' END,'Обновлены подтверждённые поля первоисточника');
 ELSE
 IF old.publication_status='published' OR st='withdrawn' THEN INSERT INTO public.monitor_public_updates(event_id,revision,action,reason) VALUES(eid,rev,'withdrawn',CASE WHEN st='withdrawn' THEN 'Отмена или расторжение в первоисточнике' ELSE 'Изменённые сведения требуют ручной проверки' END);END IF;
 IF st='pending' THEN INSERT INTO analytics_internal.monitor_review_queue(event_id,revision,reasons,draft_story,state) VALUES(eid,rev,d->'reviewReasons',p_story,'pending') ON CONFLICT(event_id) DO UPDATE SET revision=excluded.revision,reasons=excluded.reasons,draft_story=excluded.draft_story,state='pending',note=NULL,reviewed_at=NULL;END IF;
 END IF;
 IF st='withdrawn' AND d->>'cancellationScope'='procedure' THEN
 FOR other IN SELECT id,revision FROM public.monitor_events WHERE source_id=p_source AND process_id=d->>'processId' AND id<>eid AND publication_status='published' FOR UPDATE LOOP
 UPDATE public.monitor_events SET publication_status='withdrawn',last_checked_at=now() WHERE id=other.id;
 INSERT INTO public.monitor_public_updates(event_id,revision,action,reason) VALUES(other.id,other.revision,'withdrawn','Источник отменил всю процедуру');
 END LOOP;END IF;
 RETURN jsonb_build_object('action',st,'id',eid,'revision',rev);
END $$;
REVOKE ALL ON FUNCTION public.monitor_store_event(text,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.monitor_store_event(text,jsonb,jsonb,jsonb) TO service_role;

CREATE VIEW public.monitor_contract_prices WITH(security_invoker=true) AS
SELECT id,source_id,revision,published_on,data->'metalIds' metal_ids,data->>'region' region,data->>'country' country,data->>'specification' specification,data->>'currency' currency,data->>'priceKind' price_kind,data->>'stage' stage,(data->>'pricePerKg')::numeric price_per_kg,(data->>'comparable')::boolean comparable,data->>'sourceUrl' source_url
FROM public.monitor_events WHERE publication_status='published' AND data->>'pricePerKg' IS NOT NULL;
GRANT SELECT ON public.monitor_contract_prices TO anon,authenticated,service_role;

CREATE FUNCTION public.monitor_begin(p_source text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE token uuid;run_id uuid;cur jsonb;
BEGIN token:=public.monitor_claim_source(p_source);IF token IS NULL THEN RETURN NULL;END IF;
 SELECT cursor INTO cur FROM analytics_internal.monitor_source_state WHERE source_id=p_source;
 INSERT INTO analytics_internal.monitor_runs(source_id,status) VALUES(p_source,'started') RETURNING id INTO run_id;
 UPDATE public.monitor_sources SET last_checked_at=now() WHERE id=p_source;
 RETURN jsonb_build_object('lease',token,'runId',run_id,'cursor',cur);END $$;
CREATE FUNCTION public.monitor_previous_process(p_source text,p_process text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(d.payload->'compiled',d.payload) FROM public.monitor_events e JOIN analytics_internal.monitor_documents d ON d.id=e.document_id WHERE e.source_id=p_source AND e.process_id=p_process ORDER BY e.published_on DESC NULLS LAST,e.data->>'sourceVersion' DESC NULLS LAST,e.revision DESC,e.id LIMIT 1
$$;
CREATE FUNCTION public.monitor_finish(p_source text,p_lease uuid,p_run uuid,p_cursor jsonb,p_status text,p_seen integer,p_changed integer,p_error text DEFAULT NULL,p_retry_after timestamptz DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f integer;
BEGIN
 IF p_status NOT IN('success','partial','error') OR p_seen<0 OR p_changed<0 OR coalesce(p_error,'')!~'^[a-z0-9_]{0,80}$' THEN RAISE EXCEPTION 'invalid_monitor_result';END IF;
 UPDATE analytics_internal.monitor_source_state SET lease_token=NULL,lease_until=NULL,cursor=CASE WHEN p_status='error' THEN cursor ELSE p_cursor END,failures=CASE WHEN p_status='error' THEN failures+1 ELSE 0 END
 WHERE source_id=p_source AND lease_token=p_lease RETURNING failures INTO f;
 IF f IS NULL THEN RETURN false;END IF;
 UPDATE analytics_internal.monitor_source_state st SET next_allowed_at=greatest(st.next_allowed_at,p_retry_after,now()+make_interval(secs=>least(86400,s.min_interval_seconds*(2^least(f,5))::integer))) FROM public.monitor_sources s WHERE st.source_id=s.id AND s.id=p_source;
 UPDATE analytics_internal.monitor_runs SET status=p_status,finished_at=now(),records_seen=p_seen,events_changed=p_changed,error_code=p_error WHERE id=p_run AND source_id=p_source;
 UPDATE public.monitor_sources SET status=CASE p_status WHEN 'success' THEN 'connected' WHEN 'error' THEN 'delayed' ELSE 'partial' END,last_success_at=CASE WHEN p_status IN('success','partial') THEN now() ELSE last_success_at END,error_code=p_error WHERE id=p_source;
 RETURN true;
END $$;
CREATE FUNCTION public.monitor_review(p_event_id text,p_expected_revision integer,p_decision text,p_note text) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e public.monitor_events;q analytics_internal.monitor_review_queue;rev integer;
BEGIN
 IF p_decision NOT IN('approve','reject') OR length(trim(coalesce(p_note,'')))<15 THEN RAISE EXCEPTION 'documented_review_required';END IF;
 SELECT * INTO e FROM public.monitor_events WHERE id=p_event_id FOR UPDATE;
 SELECT * INTO q FROM analytics_internal.monitor_review_queue WHERE event_id=p_event_id FOR UPDATE;
 IF e.id IS NULL OR q.event_id IS NULL OR e.revision<>p_expected_revision OR q.revision<>p_expected_revision OR q.state<>'pending' THEN RETURN false;END IF;
 IF p_decision='approve' AND (coalesce(e.data->>'country','')='' OR coalesce(e.data->>'region','') NOT IN('Европа','США','Азия') OR q.reasons ?| ARRAY['unsafe_source_url','invalid_publication_date','unsupported_material']) THEN RAISE EXCEPTION 'correct_provenance_before_approval';END IF;
 UPDATE analytics_internal.monitor_review_queue SET state=CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END,note=p_note,reviewed_at=now() WHERE event_id=p_event_id;
 rev:=e.revision+1;
 UPDATE public.monitor_events SET publication_status=CASE p_decision WHEN 'approve' THEN 'published' ELSE 'withdrawn' END,revision=rev,data=jsonb_set(jsonb_set(data,'{pricePerKg}','null'::jsonb),'{comparable}','false'::jsonb) WHERE id=p_event_id;
 INSERT INTO analytics_internal.monitor_event_revisions(event_id,revision,data,document_id) SELECT id,revision,data,document_id FROM public.monitor_events WHERE id=p_event_id;
 IF p_decision='approve' THEN INSERT INTO public.monitor_publications(event_id,revision,title_ru,body_ru) VALUES(p_event_id,rev,q.draft_story->>'title',(q.draft_story->>'text')||E'\nПроверено оператором; контрактная цена исключена из сравнения.') ON CONFLICT(event_id) DO UPDATE SET revision=excluded.revision,title_ru=excluded.title_ru,body_ru=excluded.body_ru,updated_at=now();END IF;
 INSERT INTO public.monitor_public_updates(event_id,revision,action,reason) VALUES(p_event_id,rev,CASE p_decision WHEN 'approve' THEN 'published' ELSE 'withdrawn' END,'Решение ручной проверки');RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.monitor_begin(text),public.monitor_previous_process(text,text),public.monitor_finish(text,uuid,uuid,jsonb,text,integer,integer,text,timestamptz),public.monitor_review(text,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.monitor_begin(text),public.monitor_previous_process(text,text),public.monitor_finish(text,uuid,uuid,jsonb,text,integer,integer,text,timestamptz),public.monitor_review(text,integer,text,text) TO service_role;
