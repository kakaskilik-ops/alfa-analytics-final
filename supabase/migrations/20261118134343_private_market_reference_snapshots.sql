create table public.private_market_references (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id),
  metal_id text not null references public.metals(id),
  snapshot_id text not null check (length(snapshot_id) between 1 and 100),
  minimum_usd_kg numeric check (minimum_usd_kg > 0 and minimum_usd_kg < 'Infinity'::numeric),
  maximum_usd_kg numeric check (maximum_usd_kg > 0 and maximum_usd_kg < 'Infinity'::numeric),
  point_usd_kg numeric check (point_usd_kg > 0 and point_usd_kg < 'Infinity'::numeric),
  mass_basis text not null check (mass_basis in ('metal','alloy','contained_mo')),
  specification text not null check (length(trim(specification)) between 1 and 1000),
  market_region text check (market_region in ('Europe','USA','Asia','global')),
  region_verified boolean not null default false,
  basis_description text not null,
  observed_on date check (observed_on <= current_date),
  source_published_on date check (source_published_on <= current_date),
  claimed_publisher text not null,
  evidence_url text check (evidence_url ~ '^https://[^/ ]+/'),
  tax_status text not null default 'unknown' check (tax_status in ('included','excluded','unknown')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','source_matched','verified')),
  usage_permission_confirmed boolean not null default false,
  verification_note text not null,
  recorded_at timestamptz not null default now(),
  check ((minimum_usd_kg is null and maximum_usd_kg is null and point_usd_kg is not null) or (minimum_usd_kg is not null and maximum_usd_kg is not null and minimum_usd_kg <= maximum_usd_kg and point_usd_kg is null)),
  check (not region_verified or market_region is not null),
  check (verification_status <> 'verified' or (observed_on is not null and evidence_url is not null and usage_permission_confirmed)),
  check ((metal_id='ferromolybdenum' and mass_basis='contained_mo') or (metal_id='ferrotungsten' and mass_basis='alloy') or (metal_id not in ('ferromolybdenum','ferrotungsten') and mass_basis='metal')),
  unique(owner_id,metal_id,snapshot_id)
);
alter table public.private_market_references enable row level security;
revoke all on public.private_market_references from public,anon,authenticated;
grant select on public.private_market_references to authenticated;
grant all on public.private_market_references to service_role;
grant usage,select on sequence public.private_market_references_id_seq to service_role;
create policy owner_reference_read on public.private_market_references for select to authenticated
using (owner_id=(select auth.uid()) and (select public.has_smm_owner_access()));
-- No price values or owner identities in migration/source control. Owner-supplied notes
-- are loaded separately with their explicit unverified status; not an SMM data feed.
