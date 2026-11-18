-- A series is one product/grade/form/region/price type. Tax views are NOT independent sources.
create table public.market_price_series (
  id text primary key,
  metal_id text not null references public.metals(id),
  source_id text not null references public.data_sources(id),
  specification text not null check (length(trim(specification)) > 0),
  purity text,
  delivery_form text not null,
  region text not null check (region in ('Europe','USA','Asia','global')),
  price_type text not null check (price_type in ('physical_spot','assessment','futures','premium','concentrate')),
  source_url text not null check (source_url like 'https://%'),
  redistribution_authorized boolean not null default false
);
create table public.market_price_observations (
  id bigint generated always as identity primary key,
  series_id text not null references public.market_price_series(id),
  assessed_at timestamptz not null,
  date_precision text not null check (date_precision in ('day','timestamp','month')),
  original_currency text not null check (original_currency ~ '^[A-Z]{3}$'),
  original_unit text not null check (original_unit in ('kg','ton')),
  tax_status text not null check (tax_status in ('included','excluded','unknown')),
  vat_rate numeric check (vat_rate between 0 and 1),
  minimum numeric check (minimum > 0 and minimum < 'Infinity'::numeric),
  maximum numeric check (maximum > 0 and maximum < 'Infinity'::numeric),
  mean numeric check (mean > 0 and mean < 'Infinity'::numeric),
  retrieved_at timestamptz not null default now(),
  check (tax_status <> 'unknown' or vat_rate is null),
  check ((minimum is null and maximum is null and mean is not null) or
    (minimum is not null and maximum is not null and minimum <= maximum and
      (mean is null or mean between minimum and maximum))),
  unique (series_id, assessed_at, original_currency, original_unit, tax_status)
);
alter table public.market_price_series enable row level security;
alter table public.market_price_observations enable row level security;
revoke all on public.market_price_series, public.market_price_observations from public, anon, authenticated;
grant select on public.market_price_series, public.market_price_observations to anon, authenticated;
grant all on public.market_price_series, public.market_price_observations to service_role;
grant usage, select on sequence public.market_price_observations_id_seq to service_role;
create policy authorized_series_read on public.market_price_series for select to anon, authenticated using (redistribution_authorized);
create policy authorized_observations_read on public.market_price_observations for select to anon, authenticated using (
  exists (select 1 from public.market_price_series s where s.id = series_id and s.redistribution_authorized)
);
-- No SMM/DMP/LME rows are seeded: no verified redistribution permission is available.
-- Persist the explicit supplier tax statement without guessing a rate.
alter table public.supplier_price_observations
  add column tax_status text not null default 'unknown' check (tax_status in ('included','excluded','unknown')),
  add column vat_rate numeric check (vat_rate between 0 and 1),
  add constraint supplier_tax_known check (tax_status <> 'unknown' or vat_rate is null);
update public.supplier_price_observations set tax_status='excluded' where source_id='rare-metals-bid';
grant select(tax_status,vat_rate) on public.supplier_price_observations to anon, authenticated;
