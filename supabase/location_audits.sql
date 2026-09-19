create extension if not exists postgis with schema extensions;

create table if not exists public.location_audits (
  id uuid primary key default gen_random_uuid(),
  location extensions.geography(point, 4326) not null,
  place_name text,
  soil_nutrients jsonb,
  disaster_history jsonb,
  carbon_credit_data jsonb,
  real_estate_data jsonb,
  air_quality_data jsonb,
  weather_data jsonb,
  raw_environmental_data jsonb,
  ai_summary jsonb,
  source text not null default 'spatial-check',
  cache_hits integer not null default 0,
  created_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now()
);

alter table public.location_audits
  drop column if exists updated_at;

alter table public.location_audits
  add column if not exists soil_nutrients jsonb,
  add column if not exists disaster_history jsonb,
  add column if not exists carbon_credit_data jsonb,
  add column if not exists real_estate_data jsonb,
  add column if not exists air_quality_data jsonb,
  add column if not exists weather_data jsonb,
  add column if not exists raw_environmental_data jsonb,
  add column if not exists ai_summary jsonb,
  add column if not exists source text not null default 'spatial-check',
  add column if not exists cache_hits integer not null default 0,
  add column if not exists last_checked_at timestamptz not null default now();

create index if not exists location_audits_location_gix
  on public.location_audits
  using gist (location);

create or replace function public.find_location_audit(
  query_lat double precision,
  query_lng double precision,
  radius_meters double precision default 500
)
returns table (
  id uuid,
  lat double precision,
  lng double precision,
  distance_meters double precision,
  place_name text,
  soil_nutrients jsonb,
  disaster_history jsonb,
  carbon_credit_data jsonb,
  real_estate_data jsonb,
  air_quality_data jsonb,
  weather_data jsonb,
  raw_environmental_data jsonb,
  ai_summary jsonb,
  source text,
  cache_hits integer,
  created_at timestamptz,
  last_checked_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    audits.id,
    extensions.st_y(audits.location::extensions.geometry) as lat,
    extensions.st_x(audits.location::extensions.geometry) as lng,
    extensions.st_distance(
      audits.location,
      extensions.st_setsrid(extensions.st_makepoint(query_lng, query_lat), 4326)::extensions.geography
    ) as distance_meters,
    audits.place_name,
    audits.soil_nutrients,
    audits.disaster_history,
    audits.carbon_credit_data,
    audits.real_estate_data,
    audits.air_quality_data,
    audits.weather_data,
    audits.raw_environmental_data,
    audits.ai_summary,
    audits.source,
    audits.cache_hits,
    audits.created_at,
    audits.last_checked_at
  from public.location_audits audits
  where extensions.st_dwithin(
    audits.location,
    extensions.st_setsrid(extensions.st_makepoint(query_lng, query_lat), 4326)::extensions.geography,
    radius_meters
  )
  order by audits.location operator(extensions.<->) extensions.st_setsrid(extensions.st_makepoint(query_lng, query_lat), 4326)::extensions.geography
  limit 1;
$$;

alter table public.location_audits enable row level security;

revoke all on public.location_audits from anon, authenticated;
revoke execute on function public.find_location_audit(double precision, double precision, double precision) from public, anon, authenticated;
grant select, insert, update on public.location_audits to service_role;
grant execute on function public.find_location_audit(double precision, double precision, double precision) to service_role;
