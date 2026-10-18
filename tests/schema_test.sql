\set ON_ERROR_STOP 1
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','spottedparking@outlook.com','{"full_name":"Spotted Team"}'),
 ('00000000-0000-0000-0000-00000000000b','rider@colorado.edu','{"full_name":"Kendra Nelson"}'),
 ('00000000-0000-0000-0000-00000000000c','other@colorado.edu','{}');
\i supabase/seed_sample_spots.sql
select count(*) as sample_spots from public.spots;

-- anonymous visitor
set role anon;
select count(*) as anon_sees_spots from public.spots;
do $$ begin perform * from public.spot_addresses; raise exception 'anon read addresses!'; exception when insufficient_privilege then raise notice 'ok: anon cannot read addresses'; end $$;
reset role;

-- renter books a day
set role authenticated; set test.uid = '00000000-0000-0000-0000-00000000000b';
select count(*) as renter_sees_addresses from public.spot_addresses;
create temp table t as select * from public.create_booking(
  (select id from public.spots where title='North Campus Driveway'), 'day',
  (select d::date from generate_series(current_date+1, current_date+7, '1 day') d where extract(dow from d) between 1 and 5 limit 1), 2);
select period, quantity, total_cents, status, end_date - start_date as days from t;
-- second renter can't take the same single spot
set test.uid = '00000000-0000-0000-0000-00000000000c';
do $$ begin perform public.create_booking((select id from public.spots where title='North Campus Driveway'),'day',(select start_date from t),1);
  raise exception 'double booking allowed!'; exception when raise_exception then raise notice 'ok: %', sqlerrm; end $$;
-- weekend day rejected
do $$ begin perform public.create_booking((select id from public.spots where title='University Hill Spot'),'day',
  (select d::date from generate_series(current_date+1, current_date+7, '1 day') d where extract(dow from d)=0 limit 1),1);
  raise exception 'weekend allowed!'; exception when raise_exception then raise notice 'ok: %', sqlerrm; end $$;
-- event booking on a listed date, multi-capacity
select period, total_cents from public.create_booking((select id from public.spots where title='CU Football Game Parking'),'event',
  (select event_dates[1] from public.spots where title='CU Football Game Parking'), 5);
-- other user cannot see renter's booking
select count(*) as other_sees_renter_booking from public.bookings where renter_id='00000000-0000-0000-0000-00000000000b';
-- other user can't confirm
do $$ begin perform public.confirm_payment((select id from t)); raise exception 'stranger confirmed!'; exception when raise_exception then raise notice 'ok: %', sqlerrm; end $$;

set test.uid = '00000000-0000-0000-0000-00000000000b';
select status from public.mark_payment_sent((select id from t));
select count(*) as address_before_confirm from public.spot_addresses;
-- renter opens chat and sends
create temp table c as select public.open_conversation((select spot_id from t)) as id;
insert into public.messages (conversation_id, sender_id, body) values ((select id from c), '00000000-0000-0000-0000-00000000000b', 'Hi! Which side of the driveway?');
do $$ begin insert into public.messages (conversation_id, sender_id, body) values ((select id from c), '00000000-0000-0000-0000-00000000000a', 'spoof');
  raise exception 'spoof allowed!'; exception when insufficient_privilege then raise notice 'ok: cannot spoof sender'; end $$;
-- renter can't list without venmo
do $$ begin insert into public.spots (owner_id,title,city,spot_type,rent_options,price_day_cents) values ('00000000-0000-0000-0000-00000000000b','My spot','Boulder','driveway','{day}',500);
  raise exception 'listing without venmo!'; exception when insufficient_privilege then raise notice 'ok: needs venmo to list'; end $$;
update public.profiles set venmo_username='Kendra-Nelson' where id='00000000-0000-0000-0000-00000000000b';
insert into public.spots (owner_id,title,city,spot_type,rent_options,price_day_cents) values ('00000000-0000-0000-0000-00000000000b','My spot','Boulder','driveway','{day}',500);
do $$ begin update public.spots set rating=5 where owner_id='00000000-0000-0000-0000-00000000000b'; raise exception 'rating editable!'; exception when insufficient_privilege then raise notice 'ok: rating not editable'; end $$;

-- host confirms and replies
set test.uid = '00000000-0000-0000-0000-00000000000a';
select status from public.confirm_payment((select id from t));
insert into public.messages (conversation_id, sender_id, body) values ((select id from c), '00000000-0000-0000-0000-00000000000a', 'Left side, thanks!');
select count(*) as host_sees_messages from public.messages;
set test.uid = '00000000-0000-0000-0000-00000000000b';
select street_address as address_after_confirm from public.spot_addresses;
select count(*) as booked_rows_public from public.spot_bookings_between(current_date, current_date + 60);
reset role;
