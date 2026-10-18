-- Map location of each spot, so commuters can sort by distance to a CU building.
alter table public.spots
  add column if not exists lat double precision check (lat is null or lat between -90 and 90),
  add column if not exists lng double precision check (lng is null or lng between -180 and 180);

grant insert (lat, lng), update (lat, lng) on public.spots to authenticated;
