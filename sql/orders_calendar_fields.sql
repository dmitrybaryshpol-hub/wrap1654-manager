-- Wrap 1654 Manager: Google Calendar fields for orders
alter table if exists public.orders
  add column if not exists add_to_calendar boolean not null default false,
  add column if not exists google_event_id text null,
  add column if not exists calendar_synced_at timestamptz null;
