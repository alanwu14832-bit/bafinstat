-- Photo album links (Google Drive folders etc.) and the schedule. Run once in the SQL Editor (safe to re-run).

-- 1) schedule: a game row can exist before it is played
alter table games add column if not exists status text;   -- null = played, 'scheduled', 'cancelled'

-- 2) album links: one row per link, optionally tied to a game
create table if not exists albums (
  id           uuid primary key default gen_random_uuid(),
  game_id      text references games(id) on delete set null,
  title        text,                       -- for albums that are not a game (春訓、迎新賽)
  date         date,
  url          text not null,
  photographer text,
  note         text,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists albums_game_idx on albums (game_id);
alter table albums enable row level security;
drop policy if exists "public read" on albums;
create policy "public read" on albums for select using (true);
drop policy if exists "editors write" on albums;
create policy "editors write" on albums for all to authenticated using (is_editor()) with check (is_editor());
