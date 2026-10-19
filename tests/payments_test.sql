\set ON_ERROR_STOP 1
-- Run after supabase_stub + migrations 1-4 + schema_test.sql setup users and the sample seed.
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','spottedparking@outlook.com','{"full_name":"Spotted Team"}'),
 ('00000000-0000-0000-0000-00000000000b','rider@colorado.edu','{"full_name":"Kendra Nelson"}'),
 ('00000000-0000-0000-0000-00000000000c','host@gmail.com','{"full_name":"Alex Rivera"}');
insert into public.admins (user_id) values ('00000000-0000-0000-0000-00000000000a');
update public.profiles set venmo_username='Alex-Rivera-42' where id='00000000-0000-0000-0000-00000000000c';
insert into public.spots (id, owner_id,title,city,spot_type,rent_options,price_day_cents,avail_days)
  values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000c','Alex Driveway','Boulder','driveway','{day}',1000,'{0,1,2,3,4,5,6}');

set role authenticated; set test.uid = '00000000-0000-0000-0000-00000000000b';
create temp table t as select * from public.create_booking('11111111-1111-1111-1111-111111111111','day',current_date+1,2);
select total_cents, fee_cents, payout_cents, payout_status from t;
select status from public.mark_payment_sent((select id from t));

-- host can no longer confirm
set test.uid = '00000000-0000-0000-0000-00000000000c';
do $$ begin perform public.confirm_payment((select id from t)); raise exception 'host confirmed!'; exception when raise_exception then raise notice 'ok: %', sqlerrm; end $$;
-- renter can't cancel after paying
set test.uid = '00000000-0000-0000-0000-00000000000b';
do $$ begin perform public.cancel_booking((select id from t)); raise exception 'renter cancelled after paying!'; exception when raise_exception then raise notice 'ok: %', sqlerrm; end $$;
select count(*) as renter_sees_settings from public.platform_settings;

-- admin confirms, then pays out
set test.uid = '00000000-0000-0000-0000-00000000000a';
select count(*) as admin_sees_bookings from public.bookings;
select status, payout_status from public.confirm_payment((select id from t));
select payout_status, paid_out_at is not null as stamped from public.mark_paid_out((select id from t));
do $$ begin perform public.mark_paid_out((select id from t)); raise exception 'double payout!'; exception when raise_exception then raise notice 'ok: %', sqlerrm; end $$;
do $$ begin perform public.cancel_booking((select id from t)); raise exception 'cancel after payout!'; exception when raise_exception then raise notice 'ok: %', sqlerrm; end $$;

-- host sees payout; non-admin can't read admins table or call mark_paid_out
set test.uid = '00000000-0000-0000-0000-00000000000c';
select payout_cents, payout_status from public.bookings;
select public.is_admin() as host_is_admin;
do $$ begin perform * from public.admins; raise exception 'admins readable!'; exception when insufficient_privilege then raise notice 'ok: admins hidden'; end $$;
reset role;
