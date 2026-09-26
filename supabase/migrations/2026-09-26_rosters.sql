-- 當日登錄名單 (game-day roster) and 報名名單 (tournament registration lists). Run once in the SQL Editor (safe to re-run).

-- 1) game-day roster: starters, bench, substitutions and the re-entry rule, stored with the game
alter table games add column if not exists day_roster jsonb;   -- 當日登錄名單

-- 2) registration lists: one row per year + tournament (e.g. 2026 大專盃)
create table if not exists registrations (
  season     int  not null,
  tournament text not null,
  players    text[] not null default '{}',
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (season, tournament)
);
alter table registrations enable row level security;
drop policy if exists "public read" on registrations;
create policy "public read" on registrations for select using (true);
drop policy if exists "editors write" on registrations;
create policy "editors write" on registrations for all to authenticated using (is_editor()) with check (is_editor());

-- realtime (ignore if already added)
do $$ begin alter publication supabase_realtime add table registrations; exception when others then null; end $$;

-- let the API see the new column and table right away
notify pgrst, 'reload schema';
