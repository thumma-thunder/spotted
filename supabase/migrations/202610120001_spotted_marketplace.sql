create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Spotted member',
  stripe_account_id text unique,
  payouts_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(new.email, '@', 1),
      'Spotted member'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();
revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;

create table public.spots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (length(trim(title)) between 4 and 100),
  description text not null default '' check (length(description) <= 1000),
  street_address text not null check (length(trim(street_address)) between 5 and 200),
  city text not null check (length(trim(city)) between 2 and 100),
  neighborhood text not null default '' check (length(neighborhood) <= 100),
  nearby_building text not null default '' check (length(nearby_building) <= 150),
  available_from date not null default current_date,
  available_until date,
  spot_type text not null check (spot_type in ('driveway', 'garage', 'private lot', 'covered space')),
  covered boolean not null default false,
  price_cents integer not null check (price_cents between 100 and 100000),
  price_period text not null check (price_period in ('day', 'week', 'game', 'month')),
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now(),
  check (available_until is null or available_until >= available_from)
);

create index spots_active_city_period_idx on public.spots (city, price_period, created_at desc) where status = 'active';
create index spots_owner_id_idx on public.spots (owner_id);

create view public.public_spots with (security_barrier = true) as
select
  spots.id,
  spots.owner_id,
  profiles.display_name as host_name,
  spots.title,
  spots.description,
  spots.city,
  spots.neighborhood,
  spots.nearby_building,
  spots.available_from,
  spots.available_until,
  spots.spot_type,
  spots.covered,
  spots.price_cents,
  spots.price_period,
  spots.created_at
from public.spots
join public.profiles on profiles.id = spots.owner_id
where spots.status = 'active';

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete restrict,
  renter_id uuid not null references public.profiles(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  quantity integer not null check (quantity between 1 and 30),
  total_cents integer not null check (total_cents between 100 and 1000000),
  status text not null check (status in ('payment_pending', 'confirmed', 'cancelled')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  created_at timestamptz not null default now(),
  check (end_date > start_date),
  exclude using gist (
    spot_id with =,
    daterange(start_date, end_date, '[)') with &&
  ) where (status in ('payment_pending', 'confirmed'))
);

create index bookings_renter_id_created_idx on public.bookings (renter_id, created_at desc);
create index bookings_spot_id_created_idx on public.bookings (spot_id, created_at desc);

create view public.my_bookings with (security_barrier = true) as
select
  bookings.id,
  bookings.spot_id,
  bookings.renter_id,
  spots.owner_id,
  bookings.start_date,
  bookings.end_date,
  bookings.quantity,
  bookings.total_cents,
  bookings.status,
  bookings.created_at,
  spots.title as spot_title,
  spots.city,
  spots.neighborhood,
  case
    when bookings.status = 'confirmed' and bookings.renter_id = (select auth.uid()) then spots.street_address
    else null
  end as street_address
from public.bookings
join public.spots on spots.id = bookings.spot_id
where bookings.renter_id = (select auth.uid())
   or spots.owner_id = (select auth.uid());

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete restrict,
  renter_id uuid not null references public.profiles(id) on delete restrict,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (spot_id, renter_id),
  check (renter_id <> owner_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index messages_conversation_created_idx on public.messages (conversation_id, created_at);

create view public.my_conversations with (security_barrier = true) as
select
  conversations.id,
  conversations.spot_id,
  conversations.renter_id,
  conversations.owner_id,
  conversations.created_at,
  spots.title as spot_title,
  coalesce(owner.display_name, 'Spotted host') as host_name,
  coalesce(renter.display_name, 'Spotted member') as renter_name
from public.conversations
join public.spots on spots.id = conversations.spot_id
left join public.profiles as owner on owner.id = conversations.owner_id
left join public.profiles as renter on renter.id = conversations.renter_id
where conversations.renter_id = (select auth.uid())
   or conversations.owner_id = (select auth.uid());

create table public.stripe_events (
  event_id text primary key,
  received_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.spots enable row level security;
alter table public.bookings enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.stripe_events enable row level security;

revoke all on public.profiles, public.spots, public.bookings, public.conversations, public.messages, public.stripe_events from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.public_spots to anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.my_bookings to authenticated;
grant select on public.my_conversations to authenticated;
grant select, insert, update, delete on public.spots to authenticated;
grant select on public.bookings to authenticated;
grant select, insert on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;
grant all on public.profiles, public.spots, public.bookings, public.conversations, public.messages, public.stripe_events to service_role;

create policy "Owners can read their profiles"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "Owners can read and manage their spots"
  on public.spots for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "Payout-ready hosts can create spots"
  on public.spots for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.payouts_enabled
    )
  );

create policy "Hosts can update and remove their own spots"
  on public.spots for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Hosts can delete their own spots"
  on public.spots for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "Booking participants can view their bookings"
  on public.bookings for select to authenticated
  using (
    renter_id = (select auth.uid())
    or exists (
      select 1 from public.spots
      where spots.id = bookings.spot_id
        and spots.owner_id = (select auth.uid())
    )
  );

create policy "Conversation participants can read their conversations"
  on public.conversations for select to authenticated
  using (renter_id = (select auth.uid()) or owner_id = (select auth.uid()));

create function public.can_start_conversation(p_spot_id uuid, p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.spots
    where spots.id = p_spot_id
      and spots.owner_id = p_owner_id
      and spots.status = 'active'
  );
$$;

revoke all on function public.can_start_conversation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_start_conversation(uuid, uuid) to authenticated;

create policy "Drivers can start a conversation with an active spot owner"
  on public.conversations for insert to authenticated
  with check (
    renter_id = (select auth.uid())
    and renter_id <> owner_id
    and (select public.can_start_conversation(spot_id, owner_id))
  );

create policy "Conversation participants can read messages"
  on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
        and (conversations.renter_id = (select auth.uid()) or conversations.owner_id = (select auth.uid()))
    )
  );

create policy "Conversation participants can send messages as themselves"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
        and (conversations.renter_id = (select auth.uid()) or conversations.owner_id = (select auth.uid()))
    )
  );

create function public.apply_stripe_event(
  p_event_id text,
  p_booking_id uuid,
  p_status text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_amount_total integer,
  p_currency text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('confirmed', 'cancelled') then
    raise exception 'Invalid booking status';
  end if;

  insert into public.stripe_events (event_id)
  values (p_event_id)
  on conflict do nothing;
  if not found then return; end if;

  if p_status = 'confirmed' then
    update public.bookings
    set status = 'confirmed',
        stripe_payment_intent_id = p_payment_intent_id
    where id = p_booking_id
      and status = 'payment_pending'
      and stripe_checkout_session_id = p_checkout_session_id
      and total_cents = p_amount_total
      and p_currency = 'usd';
    if not found and not exists (
      select 1 from public.bookings
      where id = p_booking_id
        and status = 'confirmed'
        and stripe_checkout_session_id = p_checkout_session_id
        and stripe_payment_intent_id = p_payment_intent_id
        and total_cents = p_amount_total
        and p_currency = 'usd'
    ) then
      raise exception 'Paid Stripe session does not match its booking';
    end if;
  else
    update public.bookings
    set status = 'cancelled'
    where id = p_booking_id
      and status = 'payment_pending'
      and stripe_checkout_session_id = p_checkout_session_id;
  end if;
end;
$$;

revoke all on function public.apply_stripe_event(text, uuid, text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.apply_stripe_event(text, uuid, text, text, text, integer, text) to service_role;
