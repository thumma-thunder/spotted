-- Central payments: commuters pay Spotted's Venmo, Spotted keeps a fee and pays
-- spot owners the rest. Only Spotted team members (public.admins) can confirm
-- payments and record payouts.

-- ------------------------------------------------------------- settings
create table public.platform_settings (
  id boolean primary key default true check (id),
  venmo_username text not null check (venmo_username ~ '^[A-Za-z0-9][A-Za-z0-9_-]{4,29}$'),
  fee_bps integer not null default 800 check (fee_bps between 0 and 5000)  -- 800 = 8%
);
insert into public.platform_settings (venmo_username, fee_bps) values ('david-thumma', 800)
  on conflict (id) do nothing;

alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;
grant select on public.platform_settings to anon, authenticated;
create policy "Settings are public" on public.platform_settings for select using (true);

-- ---------------------------------------------------------------- admins
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- The team account is a Spotted admin if it has signed up already.
insert into public.admins (user_id)
  select id from auth.users where lower(email) = 'spottedparking@outlook.com'
  on conflict do nothing;

-- -------------------------------------------------------------- bookings
alter table public.bookings
  add column fee_cents integer not null default 0 check (fee_cents >= 0),
  add column payout_cents integer not null default 0 check (payout_cents >= 0),
  add column payout_status text not null default 'not_due' check (payout_status in ('not_due', 'owed', 'paid')),
  add column paid_out_at timestamptz;

-- Every new booking records Spotted's fee and the owner's share at today's rate.
create function public.set_booking_split()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_bps integer;
begin
  select fee_bps into v_bps from public.platform_settings;
  new.fee_cents := round(new.total_cents * coalesce(v_bps, 800) / 10000.0);
  new.payout_cents := new.total_cents - new.fee_cents;
  return new;
end;
$$;
revoke all on function public.set_booking_split() from public, anon, authenticated;
create trigger bookings_set_split before insert on public.bookings
  for each row execute function public.set_booking_split();

update public.bookings
  set fee_cents = round(total_cents * 0.08), payout_cents = total_cents - round(total_cents * 0.08),
      payout_status = case when status = 'confirmed' then 'owed' else 'not_due' end;

-- Admins can see every booking.
create policy "Admins read all bookings" on public.bookings for select to authenticated
  using ((select public.is_admin()));
-- Admins can see every spot, including paused ones.
create policy "Admins read all spots" on public.spots for select to authenticated
  using ((select public.is_admin()));

-- Only Spotted confirms payments now, since the money lands in Spotted's Venmo.
create or replace function public.confirm_payment(p_booking_id uuid)
returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare v_row public.bookings;
begin
  if not public.is_admin() then raise exception 'Only the Spotted team can confirm payments.'; end if;
  update public.bookings set status = 'confirmed', payout_status = 'owed', updated_at = now()
  where id = p_booking_id and status in ('awaiting_payment', 'payment_sent')
  returning * into v_row;
  if not found then raise exception 'This booking can''t be confirmed.'; end if;
  return v_row;
end;
$$;

create function public.mark_paid_out(p_booking_id uuid)
returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare v_row public.bookings;
begin
  if not public.is_admin() then raise exception 'Only the Spotted team can record payouts.'; end if;
  update public.bookings set payout_status = 'paid', paid_out_at = now(), updated_at = now()
  where id = p_booking_id and status = 'confirmed' and payout_status = 'owed'
  returning * into v_row;
  if not found then raise exception 'This payout can''t be marked as paid.'; end if;
  return v_row;
end;
$$;

-- Renters can cancel before paying; owners and the Spotted team any time before payout.
create or replace function public.cancel_booking(p_booking_id uuid)
returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare v_row public.bookings;
begin
  update public.bookings set status = 'cancelled', payout_status = 'not_due', updated_at = now()
  where id = p_booking_id and status <> 'cancelled' and payout_status <> 'paid'
    and (
      (renter_id = auth.uid() and status = 'awaiting_payment')
      or owner_id = auth.uid()
      or public.is_admin()
    )
  returning * into v_row;
  if not found then raise exception 'This booking can''t be cancelled here. Message the Spotted team for help.'; end if;
  return v_row;
end;
$$;

revoke all on function public.mark_paid_out(uuid) from public, anon;
grant execute on function public.mark_paid_out(uuid) to authenticated;

-- Admins need the spot address to answer questions; owners and confirmed renters already have it.
create policy "Admins read addresses" on public.spot_addresses for select to authenticated
  using ((select public.is_admin()));
