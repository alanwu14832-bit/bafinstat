-- BAFIN Stats — Supabase schema
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run).
-- Tables mirror the workbook logs one-to-one; every statistic is computed by the website.
-- Access model: anyone (even without login) can READ; only signed-in users can WRITE.

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
-- In-progress live-scoring sessions (紀錄比賽), so a game can be continued from another device.
create table if not exists record_drafts (
  game_id    text primary key,
  state      jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table record_drafts enable row level security;
drop policy if exists "editors only" on record_drafts;
create policy "editors only" on record_drafts for all to authenticated using (true) with check (true);

alter table players        enable row level security;
alter table games          enable row level security;
alter table batting_pa     enable row level security;
alter table pitching_pa    enable row level security;
alter table fielding_lines enable row level security;

do $$
declare t text;
begin
  foreach t in array array['players','games','batting_pa','pitching_pa','fielding_lines'] loop
    execute format('drop policy if exists "public read" on %I', t);
    execute format('create policy "public read" on %I for select using (true)', t);
    execute format('drop policy if exists "authenticated write" on %I', t);
    execute format('create policy "authenticated write" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- Realtime (live refresh on every device)
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
alter publication supabase_realtime add table games, batting_pa, pitching_pa, fielding_lines, players;
