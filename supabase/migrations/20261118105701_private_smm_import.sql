-- Owner access is provisioned separately after verifying the owner's Auth account.
create table analytics_internal.smm_owner_access (
  user_id uuid primary key references auth.users(id),
  granted_at timestamptz not null default now()
);
revoke all on analytics_internal.smm_owner_access from public, anon, authenticated;
create function public.has_smm_owner_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from analytics_internal.smm_owner_access where user_id = (select auth.uid()));
$$;
revoke all on function public.has_smm_owner_access() from public, anon;
grant execute on function public.has_smm_owner_access() to authenticated;
create table public.private_smm_observations (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users(id),
  series_id text not null check (length(trim(series_id)) between 1 and 150),
  metal_id text not null check (metal_id in ('tungsten','molybdenum','ferromolybdenum','ferrotungsten','tin','zinc','copper','aluminum','chromium','cobalt','zirconium','niobium','tantalum')),
  specification text not null check (length(trim(specification)) between 1 and 1000),
  purity text not null check (length(trim(purity)) between 1 and 200),
  delivery_form text not null check (length(trim(delivery_form)) between 1 and 200),
  region text not null check (length(trim(region)) between 1 and 200),
  price_type text not null check (price_type in ('physical_spot','assessment','futures','premium','concentrate')),
  assessed_at timestamptz not null check (assessed_at <= now()),
  date_precision text not null check (date_precision in ('day','timestamp','month')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  unit text not null check (unit in ('kg','ton','lb','mtu')),
  tax_status text not null check (tax_status in ('included','excluded','unknown')),
  vat_rate numeric check (vat_rate between 0 and 1),
  minimum numeric check (minimum > 0 and minimum < 'Infinity'::numeric),
  maximum numeric check (maximum > 0 and maximum < 'Infinity'::numeric),
  mean numeric check (mean > 0 and mean < 'Infinity'::numeric),
  source_url text not null check (source_url ~ '^https://([a-zA-Z0-9-]+\.)?metal\.com/' and source_url not like '%?%' and source_url not like '%#%'),
  rights_attested boolean not null check (rights_attested),
  imported_at timestamptz not null default now(),
  check (tax_status <> 'unknown' or vat_rate is null),
  check ((minimum is null and maximum is null and mean is not null) or
    (minimum is not null and maximum is not null and minimum <= maximum and (mean is null or mean between minimum and maximum))),
  unique(owner_id,series_id,assessed_at,currency,unit,tax_status)
);
alter table public.private_smm_observations enable row level security;
revoke all on public.private_smm_observations from public, anon, authenticated;
grant select,insert,update,delete on public.private_smm_observations to authenticated;
grant usage,select on sequence public.private_smm_observations_id_seq to authenticated;
create policy smm_owner_only on public.private_smm_observations for all to authenticated
using (owner_id = (select auth.uid()) and (select public.has_smm_owner_access()))
with check (owner_id = (select auth.uid()) and (select public.has_smm_owner_access()));
-- No guest policy, public view, feed, AI context or seed prices.
create function public.check_private_smm_series() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists(select 1 from public.private_smm_observations r
    where r.owner_id=new.owner_id and r.series_id=new.series_id and r.id<>new.id
      and (r.metal_id,r.specification,r.purity,r.delivery_form,r.region,r.price_type)
      is distinct from (new.metal_id,new.specification,new.purity,new.delivery_form,new.region,new.price_type)) then
    raise exception 'SMM series specification mismatch';
  end if;
  return new;
end;
$$;
revoke all on function public.check_private_smm_series() from public, anon, authenticated;
create trigger private_smm_series_guard before insert or update on public.private_smm_observations
for each row execute function public.check_private_smm_series();
