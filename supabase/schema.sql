-- BAFIN Stats — Supabase schema
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run).
-- Tables mirror the workbook logs one-to-one; every statistic is computed by the website.
-- Access model: anyone (even without login) can READ; only signed-in users listed in `editors` can WRITE.

create table if not exists players (
  name          text primary key,
  number        text,
  primary_pos   text,
  secondary_pos text,
  bats          text,
  throws        text,
  status        text,
  note          text,
  updated_at    timestamptz not null default now()
);

create table if not exists games (
  id              text primary key,
  date            date not null,
  time            text,
  tournament      text not null default '未分類',
  opponent        text not null default '未知',
  home_away       text not null default '主',
  venue           text,
  weather         text,
  recorder        text,
  innings         int,
  winning_pitcher text,
  losing_pitcher  text,
  save_pitcher    text,
  holds           text[],
  note            text,
  updated_by      text,
  updated_at      timestamptz not null default now()
);

create table if not exists batting_pa (
  game_id       text not null references games(id) on delete cascade,
  seq           int  not null,
  inning        int  not null,
  outs_before   int,
  bases_before  text,
  batting_order int,
  pos           text,
  batter        text not null,
  pitches       text[] not null default '{}',
  result        text not null default '',
  loc           int,
  traj          text,
  quality       text,
  sb            int not null default 0,
  cs            int not null default 0,
  adv_on_error  int not null default 0,
  out_on_base   int not null default 0,
  run           int not null default 0,
  rbi           int not null default 0,
  code          text,
  note          text,
  primary key (game_id, seq)
);

create table if not exists pitching_pa (
  game_id      text not null references games(id) on delete cascade,
  seq          int  not null,
  inning       int  not null,
  outs_before  int,
  bases_before text,
  opp_order    int,
  pitcher      text not null,
  opp_batter   text,
  pitches      text[] not null default '{}',
  result       text not null default '',
  loc          int,
  traj         text,
  quality      text,
  sba          int not null default 0,
  cs           int not null default 0,
  wp           int not null default 0,
  pb           int not null default 0,
  pk           int not null default 0,
  code         text,
  note         text,
  primary key (game_id, seq)
);

create table if not exists fielding_lines (
  game_id text not null references games(id) on delete cascade,
  seq     int  not null,
  player  text not null,
  pos     text not null,
  innings numeric,
  po      int not null default 0,
  a       int not null default 0,
  e       int not null default 0,
  dp      int not null default 0,
  pb      int not null default 0,
  sb      int not null default 0,
  cs      int not null default 0,
  note    text,
  primary key (game_id, seq)
);

create index if not exists batting_pa_batter_idx  on batting_pa (batter);
create index if not exists pitching_pa_pitcher_idx on pitching_pa (pitcher);
create index if not exists games_date_idx on games (date);

-- ---------------------------------------------------------------- Row Level Security
-- In-progress live-scoring sessions (紀錄比賽): continue from another device; the public 即時比分 page reads them.
create table if not exists record_drafts (
  game_id    text primary key,
  state      jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table record_drafts enable row level security;  -- policies: see the loop below

alter table players        enable row level security;
alter table games          enable row level security;
alter table batting_pa     enable row level security;
alter table pitching_pa    enable row level security;
alter table fielding_lines enable row level security;

-- Editors allowlist: only these emails may write. Manage rows from the dashboard (Table Editor → editors).
create table if not exists editors (
  email      text primary key,
  note       text,
  created_at timestamptz not null default now()
);
insert into editors (email, note) values ('baseball.ntuba@gmail.com', '管理員') on conflict (email) do nothing;
alter table editors enable row level security;
drop policy if exists "self read" on editors;
create policy "self read" on editors for select to authenticated using (lower(email) = lower(auth.jwt() ->> 'email'));
create or replace function is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from editors where lower(email) = lower(auth.jwt() ->> 'email'))
$$;

do $$
declare t text;
begin
  foreach t in array array['players','games','batting_pa','pitching_pa','fielding_lines','record_drafts'] loop
    execute format('drop policy if exists "public read" on %I', t);
    execute format('create policy "public read" on %I for select using (true)', t);
    execute format('drop policy if exists "authenticated write" on %I', t);
    execute format('drop policy if exists "editors write" on %I', t);
    execute format('create policy "editors write" on %I for all to authenticated using (is_editor()) with check (is_editor())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- Photo albums

-- 1) who may upload besides editors
create table if not exists photographers (
  email      text primary key,
  note       text,
  created_at timestamptz not null default now()
);
alter table photographers enable row level security;
drop policy if exists "self read" on photographers;
create policy "self read" on photographers for select to authenticated using (lower(email) = lower(auth.jwt() ->> 'email'));

create or replace function is_photographer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from photographers where lower(email) = lower(auth.jwt() ->> 'email'))
$$;

-- 2) one row per photo (the file itself lives in Storage)
create table if not exists photos (
  id          uuid primary key default gen_random_uuid(),
  album       text not null,                                  -- display name, e.g. "2026-03-01 vs 群風"
  album_key   text not null,                                  -- folder in the bucket (game id or slug)
  game_id     text references games(id) on delete set null,
  path        text not null,                                  -- storage path of the 2048px JPEG
  thumb_path  text not null,                                  -- storage path of the 480px JPEG
  width       int,
  height      int,
  size_bytes  int,
  caption     text,
  uploaded_by text,
  created_at  timestamptz not null default now()
);
create index if not exists photos_album_idx on photos (album_key, created_at desc);
alter table photos enable row level security;
drop policy if exists "public read" on photos;
create policy "public read" on photos for select using (true);
drop policy if exists "uploaders write" on photos;
create policy "uploaders write" on photos for all to authenticated using (is_editor() or is_photographer()) with check (is_editor() or is_photographer());

-- 3) the bucket: public read, uploaders write
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "photos public read" on storage.objects;
create policy "photos public read" on storage.objects for select using (bucket_id = 'photos');
drop policy if exists "photos uploaders insert" on storage.objects;
create policy "photos uploaders insert" on storage.objects for insert to authenticated with check (bucket_id = 'photos' and (is_editor() or is_photographer()));
drop policy if exists "photos uploaders update" on storage.objects;
create policy "photos uploaders update" on storage.objects for update to authenticated using (bucket_id = 'photos' and (is_editor() or is_photographer()));
drop policy if exists "photos uploaders delete" on storage.objects;
create policy "photos uploaders delete" on storage.objects for delete to authenticated using (bucket_id = 'photos' and (is_editor() or is_photographer()));

-- ---------------------------------------------------------------- Realtime (live refresh on every device)
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
alter publication supabase_realtime add table games, batting_pa, pitching_pa, fielding_lines, players;
