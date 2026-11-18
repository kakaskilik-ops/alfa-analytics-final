-- Additive provenance only; no historical price values or owner identities are seeded.
alter table public.private_market_references
  add column series_key text not null default 'owner-note' check(length(trim(series_key)) between 1 and 150),
  add column assessment_kind text not null default 'unknown' check(assessment_kind in ('unknown','assessment','single_trade')),
  add column vat_rate numeric check(vat_rate between 0 and 1),
  add column tax_status_verified boolean not null default false,
  add column original_currency text not null default 'USD' check(original_currency='USD'),
  add column original_unit text not null default 'kg' check(original_unit='kg'),
  add column publisher_currency text check(publisher_currency ~ '^[A-Z]{3}$'),
  add column publisher_unit text check(publisher_unit in ('kg','ton','lb')),
  add column series_context text,
  add constraint owner_vat_unknown check(tax_status<>'unknown' or vat_rate is null);
alter table public.private_market_references drop constraint private_market_references_owner_id_metal_id_snapshot_id_key;
alter table public.private_market_references add unique(owner_id,metal_id,snapshot_id,series_key);
-- Tax views belong to ONE observation and are never independent market samples.
create table public.private_reference_tax_views (
 id bigint generated always as identity primary key,
 reference_id bigint not null references public.private_market_references(id),
 assessed_on date not null check(assessed_on<=current_date),
 tax_status text not null check(tax_status in ('included','excluded')),
 vat_rate numeric check(vat_rate between 0 and 1),
 minimum_usd_kg numeric check(minimum_usd_kg>0 and minimum_usd_kg<'Infinity'::numeric),
 maximum_usd_kg numeric check(maximum_usd_kg>0 and maximum_usd_kg<'Infinity'::numeric),
 point_usd_kg numeric check(point_usd_kg>0 and point_usd_kg<'Infinity'::numeric),
 evidence_url text not null check(evidence_url ~ '^https://[^/ ]+/'),
 source_published_on date not null check(source_published_on<=current_date),
 usage_permission_confirmed boolean not null check(usage_permission_confirmed),
 check((minimum_usd_kg is null and maximum_usd_kg is null and point_usd_kg is not null) or (minimum_usd_kg is not null and maximum_usd_kg is not null and minimum_usd_kg<=maximum_usd_kg and point_usd_kg is null)),
 unique(reference_id,tax_status)
);
alter table public.private_reference_tax_views enable row level security;
revoke all on public.private_reference_tax_views from public,anon,authenticated;
grant select on public.private_reference_tax_views to authenticated;
grant all on public.private_reference_tax_views to service_role;
grant usage,select on sequence public.private_reference_tax_views_id_seq to service_role;
create policy owner_tax_view_read on public.private_reference_tax_views for select to authenticated
using(exists(select 1 from public.private_market_references r where r.id=reference_id and r.owner_id=(select auth.uid()) and (select public.has_smm_owner_access())));

create function public.check_owner_tax_observation() returns trigger
language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.private_market_references r where r.id=new.reference_id and r.observed_on=new.assessed_on) then
  raise exception 'Tax representations must match a dated parent observation';
 end if;
 return new;
end $$;
revoke all on function public.check_owner_tax_observation() from public,anon,authenticated;
create trigger owner_tax_same_observation before insert or update on public.private_reference_tax_views for each row execute function public.check_owner_tax_observation();
create function public.check_owner_reference_date() returns trigger
language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.private_reference_tax_views v where v.reference_id=new.id and v.assessed_on is distinct from new.observed_on) then
  raise exception 'Parent date cannot diverge from its tax representations';
 end if;
 return new;
end $$;
revoke all on function public.check_owner_reference_date() from public,anon,authenticated;
create trigger owner_reference_date_guard before update of observed_on on public.private_market_references for each row execute function public.check_owner_reference_date();
