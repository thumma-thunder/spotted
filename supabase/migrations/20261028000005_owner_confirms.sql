-- Spot owners confirm each booking after Spotted confirms the payment.
-- Flow: awaiting_payment -> payment_sent -> (team confirms payment) owner_review
--       -> (owner confirms) confirmed, which releases the address.
-- If an owner declines a paid booking, Spotted owes the commuter a refund.

alter table public.bookings drop constraint bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('awaiting_payment', 'payment_sent', 'owner_review', 'confirmed', 'cancelled'));

alter table public.bookings
  add column refund_status text not null default 'none' check (refund_status in ('none', 'owed', 'refunded')),
  add column refunded_at timestamptz;

-- Paid bookings waiting on the owner still hold the spot.
create or replace function public.spot_bookings_between(p_from date, p_to date)
returns table (spot_id uuid, start_date date, end_date date)
language sql stable security definer set search_path = '' as $$
  select b.spot_id, b.start_date, b.end_date
  from public.bookings b
  where b.start_date < p_to and b.end_date > p_from
    and (b.status in ('payment_sent', 'owner_review', 'confirmed')
         or (b.status = 'awaiting_payment' and b.created_at > now() - interval '30 minutes'));
$$;

create or replace function public.create_booking(p_spot_id uuid, p_period text, p_start date, p_quantity integer)
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
    and (b.status in ('payment_sent', 'owner_review', 'confirmed')
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

-- The Spotted team confirms the payment arrived; the owner decides next.
create or replace function public.confirm_payment(p_booking_id uuid)
returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare v_row public.bookings;
begin
  if not public.is_admin() then raise exception 'Only the Spotted team can confirm payments.'; end if;
  update public.bookings set status = 'owner_review', updated_at = now()
  where id = p_booking_id and status in ('awaiting_payment', 'payment_sent')
  returning * into v_row;
  if not found then raise exception 'This booking can''t be confirmed.'; end if;
  return v_row;
end;
$$;

-- The owner accepts a paid booking. This releases the address and makes the payout due.
create function public.owner_confirm_booking(p_booking_id uuid)
returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare v_row public.bookings;
begin
  update public.bookings set status = 'confirmed', payout_status = 'owed', updated_at = now()
  where id = p_booking_id and owner_id = auth.uid() and status = 'owner_review'
  returning * into v_row;
  if not found then raise exception 'This booking can''t be confirmed. Spotted has to confirm the payment first.'; end if;
  return v_row;
end;
$$;
revoke all on function public.owner_confirm_booking(uuid) from public, anon;
grant execute on function public.owner_confirm_booking(uuid) to authenticated;

-- Cancelling a booking Spotted already has money for marks a refund as owed.
create or replace function public.cancel_booking(p_booking_id uuid)
returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare v_row public.bookings;
begin
  update public.bookings set status = 'cancelled', payout_status = 'not_due',
    refund_status = case when status in ('owner_review', 'confirmed') then 'owed' else 'none' end,
    updated_at = now()
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

create function public.mark_refunded(p_booking_id uuid)
returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare v_row public.bookings;
begin
  if not public.is_admin() then raise exception 'Only the Spotted team can record refunds.'; end if;
  update public.bookings set refund_status = 'refunded', refunded_at = now(), updated_at = now()
  where id = p_booking_id and refund_status = 'owed'
  returning * into v_row;
  if not found then raise exception 'This refund can''t be marked as sent.'; end if;
  return v_row;
end;
$$;
revoke all on function public.mark_refunded(uuid) from public, anon;
grant execute on function public.mark_refunded(uuid) to authenticated;
