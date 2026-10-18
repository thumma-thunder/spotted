-- Spotted: two-sided campus parking marketplace.
-- Runs on the Supabase free plan. Paste into SQL Editor or `supabase db push`.
--
-- Money is stored in cents. Payments happen outside the app over Venmo:
-- renter books -> pays host on Venmo -> marks "payment sent" -> host confirms.
-- The exact street address is only shown to the host and to renters whose
-- booking the host has confirmed.


-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Spotted member' check (length(trim(full_name)) between 1 and 80),
  venmo_username text check (venmo_username is null or venmo_username ~ '^[A-Za-z0-9][A-Za-z0-9_-]{4,29}$'),
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1), 'Spotted member'), 80)
  );
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------- spots
create table public.spots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(trim(title)) between 3 and 80),
  description text not null default '' check (length(description) <= 1000),
  city text not null check (length(trim(city)) between 2 and 60),
  area text not null default '' check (length(area) <= 60),
  distance_mi numeric(3,1) check (distance_mi is null or distance_mi between 0 and 30),
  spot_type text not null check (spot_type in ('driveway', 'garage', 'lot', 'other')),
  covered boolean not null default false,
  spot_count integer not null default 1 check (spot_count between 1 and 20),
  rent_options text[] not null check (cardinality(rent_options) >= 1 and rent_options <@ array['day', 'week', 'month', 'event']),
  price_day_cents integer check (price_day_cents between 100 and 100000),
  price_week_cents integer check (price_week_cents between 100 and 100000),
  price_month_cents integer check (price_month_cents between 100 and 100000),
  price_event_cents integer check (price_event_cents between 100 and 100000),
  avail_days smallint[] not null default '{1,2,3,4,5}' check (avail_days <@ array[0,1,2,3,4,5,6]::smallint[]),
  start_time time not null default '07:00',
  end_time time not null default '18:00',
  event_label text not null default '' check (length(event_label) <= 80),
  event_dates date[] not null default '{}',
  photos text[] not null default '{}' check (cardinality(photos) <= 5),
  rating numeric(2,1),
  review_count integer not null default 0,
  is_sample boolean not null default false,
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  check (not ('day' = any(rent_options)) or price_day_cents is not null),
  check (not ('week' = any(rent_options)) or price_week_cents is not null),
  check (not ('month' = any(rent_options)) or price_month_cents is not null),
  check (not ('event' = any(rent_options)) or (price_event_cents is not null and cardinality(event_dates) >= 1))
);
create index spots_city_idx on public.spots (lower(city)) where status = 'active';
create index spots_owner_idx on public.spots (owner_id);

-- Street addresses live apart from the public listing.
create table public.spot_addresses (
  spot_id uuid primary key references public.spots(id) on delete cascade,
  street_address text not null check (length(trim(street_address)) between 5 and 200)
);

-- ---------------------------------------------------------------- bookings
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  renter_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  period text not null check (period in ('day', 'week', 'month', 'event')),
  start_date date not null,
  end_date date not null,
  quantity integer not null check (quantity between 1 and 31),
  total_cents integer not null check (total_cents > 0),
  ref_code text not null,
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment', 'payment_sent', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date > start_date)
);
create index bookings_renter_idx on public.bookings (renter_id, created_at desc);
create index bookings_owner_idx on public.bookings (owner_id, created_at desc);
create index bookings_spot_dates_idx on public.bookings (spot_id, start_date, end_date);

-- ------------------------------------------------------------------- chat
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  renter_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (spot_id, renter_id),
  check (renter_id <> owner_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

create function public.touch_conversation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;
revoke all on function public.touch_conversation() from public, anon, authenticated;
create trigger messages_touch_conversation after insert on public.messages
  for each row execute function public.touch_conversation();

-- ---------------------------------------------------------- access control
alter table public.profiles enable row level security;
alter table public.spots enable row level security;
alter table public.spot_addresses enable row level security;
alter table public.bookings enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

revoke all on public.profiles, public.spots, public.spot_addresses, public.bookings,
  public.conversations, public.messages from anon, authenticated;
grant usage on schema public to anon, authenticated;

-- Profiles: name and Venmo handle are public (renters need the host's handle to pay).
grant select on public.profiles to anon, authenticated;
grant update (full_name, venmo_username) on public.profiles to authenticated;
create policy "Profiles are public" on public.profiles for select using (true);
create policy "Members edit their own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Spots: everyone sees active spots; owners also see and manage their paused ones.
grant select on public.spots to anon, authenticated;
grant insert (owner_id, title, description, city, area, distance_mi, spot_type, covered, spot_count,
  rent_options, price_day_cents, price_week_cents, price_month_cents, price_event_cents,
  avail_days, start_time, end_time, event_label, event_dates, photos, status)
  on public.spots to authenticated;
grant update (title, description, city, area, distance_mi, spot_type, covered, spot_count,
  rent_options, price_day_cents, price_week_cents, price_month_cents, price_event_cents,
  avail_days, start_time, end_time, event_label, event_dates, photos, status)
  on public.spots to authenticated;
grant delete on public.spots to authenticated;
create policy "Active spots are public" on public.spots for select
  using (status = 'active' or owner_id = (select auth.uid()));
create policy "Hosts with Venmo can list spots" on public.spots for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.venmo_username is not null)
  );
create policy "Hosts edit their spots" on public.spots for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Hosts delete their spots" on public.spots for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Addresses: host, or a renter whose booking is confirmed.
grant select, insert, update on public.spot_addresses to authenticated;
create policy "Host or confirmed renter reads address" on public.spot_addresses for select to authenticated
  using (
    exists (select 1 from public.spots s where s.id = spot_id and s.owner_id = (select auth.uid()))
    or exists (select 1 from public.bookings b where b.spot_id = spot_addresses.spot_id
               and b.renter_id = (select auth.uid()) and b.status = 'confirmed')
  );
create policy "Host writes address" on public.spot_addresses for insert to authenticated
  with check (exists (select 1 from public.spots s where s.id = spot_id and s.owner_id = (select auth.uid())));
create policy "Host updates address" on public.spot_addresses for update to authenticated
  using (exists (select 1 from public.spots s where s.id = spot_id and s.owner_id = (select auth.uid())));

-- Bookings: read-only to the two parties; every change goes through the functions below.
grant select on public.bookings to authenticated;
create policy "Parties read bookings" on public.bookings for select to authenticated
  using (renter_id = (select auth.uid()) or owner_id = (select auth.uid()));

-- Chat
grant select on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;
create policy "Parties read conversations" on public.conversations for select to authenticated
  using (renter_id = (select auth.uid()) or owner_id = (select auth.uid()));
create policy "Parties read messages" on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id
                 and (select auth.uid()) in (c.renter_id, c.owner_id)));
create policy "Parties send messages" on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (select 1 from public.conversations c where c.id = conversation_id
                and (select auth.uid()) in (c.renter_id, c.owner_id))
  );

-- Spots that are booked out (no personal details), so search can hide full spots.
create function public.spot_bookings_between(p_from date, p_to date)
returns table (spot_id uuid, start_date date, end_date date)
language sql stable security definer set search_path = '' as $$
  select b.spot_id, b.start_date, b.end_date
  from public.bookings b
  where b.start_date < p_to and b.end_date > p_from
    and (b.status in ('payment_sent', 'confirmed')
         or (b.status = 'awaiting_payment' and b.created_at > now() - interval '30 minutes'));
$$;
revoke all on function public.spot_bookings_between(date, date) from public;
grant execute on function public.spot_bookings_between(date, date) to anon, authenticated;

-- ------------------------------------------------------------- functions
create function public.create_booking(p_spot_id uuid, p_period text, p_start date, p_quantity integer)
returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_spot public.spots;
  v_end date;
  v_price integer;
  v_taken integer;
  v_today date := (now() at time zone 'America/Denver')::date;
  v_row public.bookings;
begin
  if v_uid is null then raise exception 'Please sign in to book a spot.'; end if;

  select * into v_spot from public.spots where id = p_spot_id and status = 'active' for update;
  if not found then raise exception 'This spot is no longer available.'; end if;
  if v_spot.owner_id = v_uid then raise exception 'You can''t book your own spot.'; end if;
  if not (p_period = any(v_spot.rent_options)) then raise exception 'This spot isn''t offered by the %.', p_period; end if;
  if p_start is null or p_start < v_today then raise exception 'Pick a start date from today on.'; end if;
  if p_start > v_today + 180 then raise exception 'Bookings open up to 6 months ahead.'; end if;

  case p_period
    when 'day' then
      if p_quantity not between 1 and 14 then raise exception 'Book between 1 and 14 days.'; end if;
      v_end := p_start + p_quantity;
      v_price := v_spot.price_day_cents;
      if exists (select 1 from generate_series(p_start, v_end - 1, interval '1 day') d
                 where not (extract(dow from d)::smallint = any(v_spot.avail_days))) then
        raise exception 'The host doesn''t offer this spot on one of those days.';
      end if;
    when 'week' then
      if p_quantity not between 1 and 8 then raise exception 'Book between 1 and 8 weeks.'; end if;
      v_end := p_start + 7 * p_quantity;
      v_price := v_spot.price_week_cents;
    when 'month' then
      if p_quantity not between 1 and 6 then raise exception 'Book between 1 and 6 months.'; end if;
      v_end := (p_start + make_interval(months => p_quantity))::date;
      v_price := v_spot.price_month_cents;
    when 'event' then
      if not (p_start = any(v_spot.event_dates)) then raise exception 'Pick one of the host''s event dates.'; end if;
      p_quantity := 1;
      v_end := p_start + 1;
      v_price := v_spot.price_event_cents;
    else
      raise exception 'Unknown booking type.';
  end case;

  select count(*) into v_taken from public.bookings b
  where b.spot_id = p_spot_id
    and b.start_date < v_end and b.end_date > p_start
    and (b.status in ('payment_sent', 'confirmed')
         or (b.status = 'awaiting_payment' and b.created_at > now() - interval '30 minutes'));
  if v_taken >= v_spot.spot_count then
    raise exception 'This spot is fully booked for those dates.';
  end if;

  insert into public.bookings (spot_id, renter_id, owner_id, period, start_date, end_date, quantity, total_cents, ref_code)
  values (p_spot_id, v_uid, v_spot.owner_id, p_period, p_start, v_end, p_quantity, v_price * p_quantity,
          'SP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)))
  returning * into v_row;
  return v_row;
end;
$$;

create function public.mark_payment_sent(p_booking_id uuid)
returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare v_row public.bookings;
begin
  update public.bookings set status = 'payment_sent', updated_at = now()
  where id = p_booking_id and renter_id = auth.uid() and status = 'awaiting_payment'
  returning * into v_row;
  if not found then raise exception 'This booking can''t be marked as paid.'; end if;
  return v_row;
end;
$$;

create function public.confirm_payment(p_booking_id uuid)
returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare v_row public.bookings;
begin
  update public.bookings set status = 'confirmed', updated_at = now()
  where id = p_booking_id and owner_id = auth.uid() and status in ('awaiting_payment', 'payment_sent')
  returning * into v_row;
  if not found then raise exception 'This booking can''t be confirmed.'; end if;
  return v_row;
end;
$$;

create function public.cancel_booking(p_booking_id uuid)
returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare v_row public.bookings;
begin
  update public.bookings set status = 'cancelled', updated_at = now()
  where id = p_booking_id and auth.uid() in (renter_id, owner_id) and status <> 'cancelled'
  returning * into v_row;
  if not found then raise exception 'This booking can''t be cancelled.'; end if;
  return v_row;
end;
$$;

-- Renters open a chat about a spot; hosts open one with a renter who booked or messaged.
create function public.open_conversation(p_spot_id uuid, p_renter_id uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_renter uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Please sign in to send a message.'; end if;
  select owner_id into v_owner from public.spots where id = p_spot_id;
  if v_owner is null then raise exception 'Spot not found.'; end if;

  if v_uid = v_owner then
    v_renter := p_renter_id;
    if v_renter is null or not exists (
      select 1 from public.bookings where spot_id = p_spot_id and renter_id = v_renter
      union all
      select 1 from public.conversations where spot_id = p_spot_id and renter_id = v_renter
    ) then raise exception 'You can only message renters of this spot.'; end if;
  else
    v_renter := v_uid;
  end if;

  insert into public.conversations (spot_id, renter_id, owner_id)
  values (p_spot_id, v_renter, v_owner)
  on conflict (spot_id, renter_id) do nothing;
  select id into v_id from public.conversations where spot_id = p_spot_id and renter_id = v_renter;
  return v_id;
end;
$$;

revoke all on function public.create_booking(uuid, text, date, integer) from public, anon;
revoke all on function public.mark_payment_sent(uuid) from public, anon;
revoke all on function public.confirm_payment(uuid) from public, anon;
revoke all on function public.cancel_booking(uuid) from public, anon;
revoke all on function public.open_conversation(uuid, uuid) from public, anon;
grant execute on function public.create_booking(uuid, text, date, integer) to authenticated;
grant execute on function public.mark_payment_sent(uuid) to authenticated;
grant execute on function public.confirm_payment(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.open_conversation(uuid, uuid) to authenticated;
