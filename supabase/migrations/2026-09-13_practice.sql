-- 練球點名：排程、停練期間、場次、投票（會到／小遲／下次一定）、點名、推播訂閱。Run once in the SQL Editor (safe to re-run).

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
