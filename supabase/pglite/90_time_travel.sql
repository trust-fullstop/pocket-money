-- PGlite-only, loaded AFTER the migrations: lets tests and the demo time-travel.
create or replace function app.now() returns timestamptz language sql stable as $$
  select coalesce(nullif(current_setting('app.fake_now', true), '')::timestamptz, now()) $$;
