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

-- ---------------------------------------------------------------- Album links and schedule

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

-- ---------------------------------------------------------------- Practice attendance

-- 1) players get an email so a signed-in player is matched to a roster row (login alone grants nothing)
alter table players add column if not exists email text;
create unique index if not exists players_email_idx on players (lower(email)) where email is not null;
create or replace function my_player_name() returns text
language sql stable security definer set search_path = public as $$
  select name from players where email is not null and lower(email) = lower(auth.jwt() ->> 'email') limit 1
$$;

-- 2) schedule
create table if not exists practice_series (
  id         uuid primary key default gen_random_uuid(),
  weekday    int  not null check (weekday between 0 and 6),   -- 0 = Sunday
  time       text not null,                                    -- "18:00"
  place      text,
  start_date date not null,
  end_date   date not null,
  note       text,
  created_at timestamptz not null default now()
);
create table if not exists practice_breaks (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,                                    -- 期中考週、寒假 …
  start_date date not null,
  end_date   date not null,
  created_at timestamptz not null default now()
);
create table if not exists practices (
  id          uuid primary key default gen_random_uuid(),
  series_id   uuid references practice_series(id) on delete cascade,
  date        date not null,
  time        text not null,
  place       text,
  status      text not null default 'scheduled',              -- scheduled | cancelled
  note        text,
  notified_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (series_id, date)
);
create index if not exists practices_date_idx on practices (date);

-- 3) votes and roll call
create table if not exists practice_votes (
  practice_id uuid not null references practices(id) on delete cascade,
  player_name text not null,
  status      text not null check (status in ('yes', 'late', 'no')),   -- 出席 / 小遲 / 請假
  reason      text,
  late_reply  boolean not null default false,                          -- after 09:00 on the day
  by_proxy    text,                                                    -- editor who voted for the player
  user_id     uuid,
  updated_at  timestamptz not null default now(),
  primary key (practice_id, player_name)
);
create table if not exists practice_rollcall (
  practice_id uuid not null references practices(id) on delete cascade,
  player_name text not null,
  present     boolean not null,
  updated_at  timestamptz not null default now(),
  primary key (practice_id, player_name)
);
create table if not exists push_subscriptions (
  endpoint     text primary key,
  user_id      uuid not null,
  player_name  text,
  subscription jsonb not null,
  created_at   timestamptz not null default now()
);
create table if not exists notification_log (
  id          bigserial primary key,
  practice_id uuid,
  kind        text,
  sent        int not null default 0,
  failed      int not null default 0,
  sent_at     timestamptz not null default now()
);

-- 4) expand the series into dated rows (skipping breaks); editors and the nightly job both call this
create or replace function generate_practices(until date) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into practices (series_id, date, time, place)
  select s.id, d::date, s.time, s.place
  from practice_series s, generate_series(greatest(s.start_date, current_date), least(s.end_date, until), interval '1 day') d
  where extract(dow from d) = s.weekday
    and not exists (select 1 from practice_breaks b where d::date between b.start_date and b.end_date)
  on conflict (series_id, date) do nothing;
  get diagnostics n = row_count;
  -- a break added later cancels the scheduled practices inside it (roll-called ones are kept)
  update practices p set status = 'cancelled', note = coalesce(nullif(p.note, ''), '') || case when p.note is null or p.note = '' then '' else '；' end || '停練：' || b.label
  from practice_breaks b
  where p.status = 'scheduled' and p.date between b.start_date and b.end_date and p.date >= current_date
    and not exists (select 1 from practice_rollcall r where r.practice_id = p.id);
  return n;
end $$;
grant execute on function generate_practices(date) to authenticated;

-- 5) access: everyone reads, editors manage, players write only their own vote; reasons are editors-only
alter table practice_series enable row level security;
alter table practice_breaks enable row level security;
alter table practices enable row level security;
alter table practice_votes enable row level security;
alter table practice_rollcall enable row level security;
alter table push_subscriptions enable row level security;
alter table notification_log enable row level security;
do $$
declare t text;
begin
  foreach t in array array['practice_series','practice_breaks','practices','practice_rollcall'] loop
    execute format('drop policy if exists "public read" on %I', t);
    execute format('create policy "public read" on %I for select using (true)', t);
    execute format('drop policy if exists "editors write" on %I', t);
    execute format('create policy "editors write" on %I for all to authenticated using (is_editor()) with check (is_editor())', t);
  end loop;
end $$;
drop policy if exists "own or editor read" on practice_votes;
create policy "own or editor read" on practice_votes for select to authenticated using (is_editor() or player_name = my_player_name());
drop policy if exists "own or editor write" on practice_votes;
create policy "own or editor write" on practice_votes for all to authenticated using (is_editor() or player_name = my_player_name()) with check (is_editor() or player_name = my_player_name());
-- the public sees who is coming, never the reason
create or replace view practice_votes_public with (security_invoker = false) as
  select practice_id, player_name, status, late_reply, by_proxy is not null as by_proxy, updated_at from practice_votes;
grant select on practice_votes_public to anon, authenticated;
drop policy if exists "own subscriptions" on push_subscriptions;
create policy "own subscriptions" on push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "editors read log" on notification_log;
create policy "editors read log" on notification_log for select to authenticated using (is_editor());

-- ---------------------------------------------------------------- Realtime (live refresh on every device)
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
alter publication supabase_realtime add table games, batting_pa, pitching_pa, fielding_lines, players;
