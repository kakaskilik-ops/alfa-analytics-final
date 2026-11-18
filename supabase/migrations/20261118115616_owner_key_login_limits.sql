create table analytics_internal.owner_login_attempts (
  scope text not null,
  window_start bigint not null,
  attempts integer not null check(attempts > 0),
  primary key(scope,window_start)
);
revoke all on analytics_internal.owner_login_attempts from public,anon,authenticated;
create function public.claim_owner_login_attempt(p_network_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
declare bucket bigint := floor(extract(epoch from now())/900)::bigint; network_n integer; global_n integer;
begin
  if p_network_hash is null or p_network_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(6767001);
  insert into analytics_internal.owner_login_attempts(scope,window_start,attempts) values ('network:'||p_network_hash,bucket,1)
    on conflict(scope,window_start) do update set attempts=owner_login_attempts.attempts+1 returning attempts into network_n;
  insert into analytics_internal.owner_login_attempts(scope,window_start,attempts) values ('global',bucket,1)
    on conflict(scope,window_start) do update set attempts=owner_login_attempts.attempts+1 returning attempts into global_n;
  delete from analytics_internal.owner_login_attempts where window_start < bucket-96;
  return network_n <= 8 and global_n <= 200;
end;
$$;
create function public.site_owner_id() returns uuid
language sql stable security definer set search_path='' as $$
  select case when count(*)=1 then (array_agg(user_id))[1] else null end
  from analytics_internal.smm_owner_access;
$$;
revoke all on function public.claim_owner_login_attempt(text),public.site_owner_id() from public,anon,authenticated;
grant execute on function public.claim_owner_login_attempt(text),public.site_owner_id() to service_role;
