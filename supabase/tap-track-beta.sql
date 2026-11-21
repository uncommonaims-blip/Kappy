-- Apply in Supabase SQL Editor before enabling Tap & Track in beta.
-- Team membership is checked on every read/write. No public or anonymous access.
create table if not exists public.kappy_activity_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  author_id uuid not null references auth.users(id),
  activity_key text not null check (activity_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  activity_label text not null check (char_length(activity_label) between 1 and 70),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists kappy_activity_events_team_time_idx
  on public.kappy_activity_events(team_id,occurred_at desc);
alter table public.kappy_activity_events enable row level security;
create policy kappy_activity_events_read on public.kappy_activity_events
  for select to authenticated
  using (exists (select 1 from public.kappy_members m where m.team_id=kappy_activity_events.team_id and m.user_id=(select auth.uid())));
create policy kappy_activity_events_insert on public.kappy_activity_events
  for insert to authenticated
  with check (author_id=(select auth.uid()) and occurred_at <= now() + interval '1 minute'
    and exists (select 1 from public.kappy_members m where m.team_id=kappy_activity_events.team_id and m.user_id=(select auth.uid())));
grant select, insert on public.kappy_activity_events to authenticated;
-- Beta customization is per user/device; team-wide custom buttons need a separate approval and permissions design.
