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
  runner        text,           -- 代跑: who ran for the batter (gets run / sb / cs)
  pitches       text[] not null default '{}',
  result        text not null default '',
  loc           int,
  traj          text,
  quality       text,
  sb            int not null default 0,
  cs            int not null default 0,
  adv_on_error  int not null default 0,
  out_on_base   int not null default 0,
  baserunning_outs smallint not null default 0,  -- 壘死：自己跑壘失誤出局（out_on_base 的一部分）
  run           int not null default 0,
  rbi           int not null default 0,
  code          text,
  note          text,
  events        jsonb,          -- 逐球跑壘: [{at, kind, from, to}] runner plays between pitches of this PA
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
  errors       text[],        -- 守備失誤: positions of our fielders who erred during this plate appearance
  code         text,
  note         text,
  events       jsonb,         -- 逐球跑壘: [{at, kind, from, to}] runner plays between pitches of this PA
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
alter table games add column if not exists day_roster jsonb;   -- 當日登錄名單: starters, bench, substitutions, re-entry rule

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

-- ---------------------------------------------------------------- Tournament registration lists (報名名單)
-- one row per year + tournament (e.g. 2026 大專盃); a game finds its list by year(date) + tournament
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

-- ---------------------------------------------------------------- Realtime (live refresh on every device)
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
do $$
declare t text;
begin
  foreach t in array array['games', 'batting_pa', 'pitching_pa', 'fielding_lines', 'players', 'registrations'] loop
    -- already published (re-running this file): skip
    begin execute format('alter publication supabase_realtime add table %I', t); exception when duplicate_object then null; end;
  end loop;
end $$;

-- ================================================================ 資料安全（與 migrations/2026-10-08_security.sql 相同）
--
-- 1) 紀錄員綁定帳號: write access belongs to one login account, not to whoever can sign up with the email.
--    A recorder's account is bound on first use by an email code (proves they own the inbox) or by the one-time
--    邀請碼 an existing recorder (or the admin, from here) hands them. Accounts that already exist are bound now.
-- 2) 不公開紀錄員 email: updated_by / created_by on public tables hold a name, never an email.
-- 3) 操作紀錄 (audit_log): every change to games, players, registrations, albums and editors, readable by recorders only.
-- 4) 資料上限: album links must be http(s); notes and in-progress data have size caps (new writes only).
-- 5) 匿名角色不能寫入 (on top of row level security).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- 1) editors bound to an account
alter table editors add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table editors add column if not exists bound_at timestamptz;
alter table editors add column if not exists bound_via text;          -- 'email' | 'code' | 'existing'
alter table editors add column if not exists invite_hash text;        -- sha256 of the 邀請碼 (the code itself is never stored)
alter table editors add column if not exists invite_expires timestamptz;
alter table editors add column if not exists invite_attempts int not null default 0;
create unique index if not exists editors_user_idx on editors (user_id) where user_id is not null;

-- accounts that already exist for a listed email were set up before this change: bind them (check the list afterwards)
update editors e set user_id = u.id, bound_at = now(), bound_via = 'existing'
  from auth.users u where e.user_id is null and lower(u.email) = lower(e.email);

-- write access: the signed-in account itself must be the bound one
create or replace function is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from editors where user_id = auth.uid())
$$;

-- recorders see the list (and their own row) without the code hashes
revoke select on editors from anon, authenticated;
grant select (email, note, created_at, user_id, bound_at, bound_via, invite_expires) on editors to authenticated;
drop policy if exists "self read" on editors;
create policy "self read" on editors for select to authenticated using (user_id = auth.uid() or lower(email) = lower(auth.jwt() ->> 'email'));
drop policy if exists "editors read" on editors;
create policy "editors read" on editors for select to authenticated using (is_editor());
-- adding goes through add_editor() (it makes the 邀請碼); removing stays a plain delete (never yourself)
drop policy if exists "editors add" on editors;
revoke insert, update on editors from anon, authenticated;
drop policy if exists "editors remove" on editors;
create policy "editors remove" on editors for delete to authenticated using (is_editor() and user_id is distinct from auth.uid() and lower(email) <> lower(auth.jwt() ->> 'email'));

-- a 10-character code without look-alike letters (no 0/O, 1/I/L)
create or replace function _new_invite_code() returns text
language plpgsql volatile set search_path = public, extensions as $$
declare alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea := gen_random_bytes(10); code text := ''; i int;
begin
  for i in 0..9 loop code := code || substr(alphabet, (get_byte(b, i) % 31) + 1, 1); end loop;
  return code;
end $$;

-- new code for a listed email: unbinds it (the next account to use the code takes it over), valid 7 days
create or replace function _set_invite(p_email text) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare code text := _new_invite_code();
begin
  update editors set invite_hash = encode(digest(code, 'sha256'), 'hex'), invite_expires = now() + interval '7 days',
         invite_attempts = 0, user_id = null, bound_at = null, bound_via = null
   where lower(email) = lower(trim(p_email));
  if not found then raise exception '這個 email 不在紀錄員名單' using errcode = 'P0002'; end if;
  return code;
end $$;

-- 新增紀錄員 (a recorder adds someone): returns the 邀請碼 to hand over
create or replace function add_editor(p_email text, p_note text default null) returns text
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_editor() then raise exception '只有紀錄員可以新增紀錄員' using errcode = '42501'; end if;
  if p_email is null or lower(trim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'email 格式不對' using errcode = '22023'; end if;
  insert into editors (email, note) values (lower(trim(p_email)), nullif(left(trim(coalesce(p_note, '')), 60), ''));
  return _set_invite(p_email);
end $$;

-- 重發邀請碼 (forgot password, new phone…): the old account loses access until the code is used
create or replace function reset_editor(p_email text) returns text
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_editor() then raise exception '只有紀錄員可以重發邀請碼' using errcode = '42501'; end if;
  if lower(trim(p_email)) = lower(auth.jwt() ->> 'email') then raise exception '不能重設自己' using errcode = '42501'; end if;
  return _set_invite(p_email);
end $$;

-- for the admin in this SQL Editor only: select admin_issue_editor_code('someone@gmail.com');
create or replace function admin_issue_editor_code(p_email text) returns text
language plpgsql volatile security definer set search_path = public as $$
begin
  insert into editors (email) values (lower(trim(p_email))) on conflict (email) do nothing;
  return _set_invite(p_email);
end $$;

-- 啟用紀錄員權限 for the signed-in account: 'ok' | 'need_code' | 'bad_code' | 'expired' | 'locked' | 'not_listed' | 'taken' | 'not_signed_in'
create or replace function claim_editor(code text default null) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  me uuid := auth.uid();
  mail text := lower(auth.jwt() ->> 'email');
  r editors%rowtype;
  emailed boolean;
  has_password boolean;
begin
  if me is null or mail is null then return 'not_signed_in'; end if;
  select * into r from editors where lower(email) = mail;
  if not found then return 'not_listed'; end if;
  if r.user_id = me then return 'ok'; end if;
  if r.user_id is not null then return 'taken'; end if;
  -- signed in with a code sent to this email, on an account nobody set a password on beforehand
  emailed := exists (select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
                     where a ->> 'method' in ('otp', 'magiclink', 'email/signup', 'recovery', 'invite', 'email_change'));
  select coalesce(encrypted_password, '') <> '' into has_password from auth.users where id = me;
  if emailed and not coalesce(has_password, false) then
    update editors set user_id = me, bound_at = now(), bound_via = 'email', invite_hash = null, invite_expires = null, invite_attempts = 0 where email = r.email;
    return 'ok';
  end if;
  if code is null or trim(code) = '' then return 'need_code'; end if;
  if r.invite_hash is null then return 'need_code'; end if;
  if r.invite_attempts >= 10 then return 'locked'; end if;
  if r.invite_expires < now() then return 'expired'; end if;
  if r.invite_hash <> encode(digest(upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex') then
    update editors set invite_attempts = invite_attempts + 1 where email = r.email;
    return 'bad_code';
  end if;
  update editors set user_id = me, bound_at = now(), bound_via = 'code', invite_hash = null, invite_expires = null, invite_attempts = 0 where email = r.email;
  return 'ok';
end $$;

revoke all on function _new_invite_code() from public, anon, authenticated;
revoke all on function _set_invite(text) from public, anon, authenticated;
revoke all on function admin_issue_editor_code(text) from public, anon, authenticated;
revoke all on function add_editor(text, text) from public, anon;
revoke all on function reset_editor(text) from public, anon;
revoke all on function claim_editor(text) from public, anon;
grant execute on function add_editor(text, text) to authenticated;
grant execute on function reset_editor(text) to authenticated;
grant execute on function claim_editor(text) to authenticated;

-- ---------------------------------------------------------------- 2) names, not emails, on public rows
create or replace function editor_label() returns text
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null
              else coalesce((select nullif(trim(note), '') from editors where user_id = auth.uid() limit 1), '紀錄員') end
$$;
revoke all on function editor_label() from public, anon;

create or replace function stamp_editor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- the dashboard / SQL Editor writes as is
  if TG_TABLE_NAME = 'albums' then new.created_by := editor_label(); else new.updated_by := editor_label(); end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['games', 'registrations', 'record_drafts', 'albums'] loop
    if to_regclass(t) is not null then
      execute format('drop trigger if exists stamp_editor on %I', t);
      execute format('create trigger stamp_editor before insert or update on %I for each row execute function stamp_editor()', t);
    end if;
  end loop;
end $$;

-- emails already written: replaced by the recorder's note, or 紀錄員
update games set updated_by = coalesce((select nullif(trim(note), '') from editors e where lower(e.email) = lower(games.updated_by)), '紀錄員') where updated_by like '%@%';
update registrations set updated_by = coalesce((select nullif(trim(note), '') from editors e where lower(e.email) = lower(registrations.updated_by)), '紀錄員') where updated_by like '%@%';
update record_drafts set updated_by = coalesce((select nullif(trim(note), '') from editors e where lower(e.email) = lower(record_drafts.updated_by)), '紀錄員') where updated_by like '%@%';
update albums set created_by = coalesce((select nullif(trim(note), '') from editors e where lower(e.email) = lower(albums.created_by)), '紀錄員') where created_by like '%@%';

-- ---------------------------------------------------------------- 3) audit log (recorders read, nobody writes but the trigger)
create table if not exists audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor       uuid,
  actor_email text,
  tbl         text not null,
  op          text not null,
  row_key     text,
  old_row     jsonb
);
create index if not exists audit_log_at_idx on audit_log (at desc);
alter table audit_log enable row level security;
revoke all on audit_log from anon;
revoke insert, update, delete, truncate on audit_log from authenticated;
drop policy if exists "editors read" on audit_log;
create policy "editors read" on audit_log for select to authenticated using (is_editor());

create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare rec jsonb := to_jsonb(coalesce(new, old));
begin
  insert into audit_log (actor, actor_email, tbl, op, row_key, old_row)
  values (auth.uid(), auth.jwt() ->> 'email', TG_TABLE_NAME, TG_OP, rec ->> TG_ARGV[0],
          case when TG_OP = 'DELETE' then to_jsonb(old) - 'invite_hash' else null end);
  -- keep a year of history
  if random() < 0.01 then delete from audit_log where at < now() - interval '365 days'; end if;
  return coalesce(new, old);
end $$;

do $$
declare spec text[];
begin
  foreach spec slice 1 in array array[['games', 'id'], ['players', 'name'], ['registrations', 'tournament'], ['albums', 'id'], ['editors', 'email']] loop
    if to_regclass(spec[1]) is not null then
      execute format('drop trigger if exists audit_row on %I', spec[1]);
      execute format('create trigger audit_row after insert or update or delete on %I for each row execute function audit_row(%L)', spec[1], spec[2]);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- 4) limits on what can be written (checked on new writes)
do $$
begin
  begin alter table albums add constraint albums_url_http check (url ~* '^https?://') not valid; exception when duplicate_object then null; end;
  begin alter table record_drafts add constraint record_drafts_size check (pg_column_size(state) < 2000000) not valid; exception when duplicate_object then null; end;
  begin alter table games add constraint games_sizes check (pg_column_size(day_roster) < 200000 and char_length(coalesce(note, '')) <= 2000) not valid; exception when duplicate_object then null; end;
  begin alter table batting_pa add constraint batting_pa_sizes check (char_length(coalesce(note, '')) <= 1000 and coalesce(array_length(pitches, 1), 0) <= 40 and pg_column_size(events) < 20000) not valid; exception when duplicate_object then null; end;
  begin alter table pitching_pa add constraint pitching_pa_sizes check (char_length(coalesce(note, '')) <= 1000 and coalesce(array_length(pitches, 1), 0) <= 40 and pg_column_size(events) < 20000) not valid; exception when duplicate_object then null; end;
  begin alter table players add constraint players_sizes check (char_length(name) <= 40 and char_length(coalesce(note, '')) <= 1000) not valid; exception when duplicate_object then null; end;
end $$;

-- ---------------------------------------------------------------- 5) the public (anon) role only reads
revoke insert, update, delete, truncate on all tables in schema public from anon;
revoke truncate on all tables in schema public from authenticated;

notify pgrst, 'reload schema';

-- for the admin in this SQL Editor only, after creating the account under Authentication → Users → Add user:
--   select admin_bind_editor('someone@gmail.com', '大一紀錄員');
-- lists the email (if needed) and binds it to that account right away (you created it, so no 邀請碼 is needed)
create or replace function admin_bind_editor(p_email text, p_note text default null) returns text
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception '找不到這個 email 的帳號：先到 Authentication → Users → Add user 建立' using errcode = 'P0002'; end if;
  insert into editors (email, note) values (lower(trim(p_email)), nullif(trim(coalesce(p_note, '')), ''))
    on conflict (email) do update set note = coalesce(excluded.note, editors.note);
  update editors set user_id = uid, bound_at = now(), bound_via = 'admin', invite_hash = null, invite_expires = null, invite_attempts = 0
   where lower(email) = lower(trim(p_email));
  return '已綁定 ' || lower(trim(p_email));
end $$;
revoke all on function admin_bind_editor(text, text) from public, anon, authenticated;

-- 2026-10-09 壘死（舊資料庫補欄位；新建的已在上面）
alter table batting_pa add column if not exists baserunning_outs smallint not null default 0;

-- ---------------------------------------------------------------- 2026-10-10 快速登入
-- 一組共用的快速登入密碼：網站先匿名登入，再用 quick_login(密碼) 變成紀錄員（有效天數到期或改密碼就失效）。
-- 也要在 Authentication → Sign In / Providers 打開 Allow anonymous sign-ins。說明見 migrations/2026-10-10_quick_login.sql。
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- the password (one row) and the quick sessions
create table if not exists quick_login (
  id           int primary key default 1 check (id = 1),
  code_hash    text,                                        -- bcrypt; null = quick login off
  days         int not null default 30 check (days = 0 or days between 1 and 365),   -- 0 = 永久 (never expires)
  failures     int not null default 0,
  window_start timestamptz,
  locked_until timestamptz,
  updated_at   timestamptz,
  updated_by   text
);
alter table quick_login enable row level security;     -- no policies: only the functions below touch it
-- (2026-10-11: 0 = 永久; a table made before then gets the wider check here too)
alter table quick_login drop constraint if exists quick_login_days_check;
alter table quick_login add constraint quick_login_days_check check (days = 0 or days between 1 and 365);
revoke all on quick_login from anon, authenticated;

create table if not exists quick_sessions (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table quick_sessions enable row level security;
revoke all on quick_sessions from anon, authenticated;

-- ---------------------------------------------------------------- who may do what
-- a recorder signed in with their own account, bound to a listed email
create or replace function is_bound_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from editors where user_id = auth.uid())
$$;
-- an anonymous account that entered the 快速登入密碼 and has not expired
create or replace function is_quick_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from quick_sessions where user_id = auth.uid() and expires_at > now())
$$;
-- write access (every "editors write" policy): either of them
create or replace function is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select is_bound_editor() or is_quick_editor()
$$;

-- the 紀錄員名單 and the 操作紀錄 (they hold emails): own-account recorders only
drop policy if exists "editors read" on editors;
create policy "editors read" on editors for select to authenticated using (is_bound_editor());
drop policy if exists "editors remove" on editors;
create policy "editors remove" on editors for delete to authenticated using (is_bound_editor() and user_id is distinct from auth.uid() and lower(email) <> lower(auth.jwt() ->> 'email'));
do $$
begin
  if to_regclass('audit_log') is not null then
    execute 'drop policy if exists "editors read" on audit_log';
    execute 'create policy "editors read" on audit_log for select to authenticated using (is_bound_editor())';
  end if;
end $$;

create or replace function add_editor(p_email text, p_note text default null) returns text
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_bound_editor() then raise exception '只有用自己帳號登入的紀錄員可以新增紀錄員' using errcode = '42501'; end if;
  if p_email is null or lower(trim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'email 格式不對' using errcode = '22023'; end if;
  insert into editors (email, note) values (lower(trim(p_email)), nullif(left(trim(coalesce(p_note, '')), 60), ''));
  return _set_invite(p_email);
end $$;

create or replace function reset_editor(p_email text) returns text
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_bound_editor() then raise exception '只有用自己帳號登入的紀錄員可以重發邀請碼' using errcode = '42501'; end if;
  if lower(trim(p_email)) = lower(auth.jwt() ->> 'email') then raise exception '不能重設自己' using errcode = '42501'; end if;
  return _set_invite(p_email);
end $$;

-- 啟用紀錄員權限: as in 2026-10-08_security.sql, and 'ok' for a live quick session
create or replace function claim_editor(code text default null) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  me uuid := auth.uid();
  mail text := lower(auth.jwt() ->> 'email');
  r editors%rowtype;
  emailed boolean;
  has_password boolean;
begin
  if me is not null and is_quick_editor() then return 'ok'; end if;
  if me is null or mail is null then return 'not_signed_in'; end if;
  select * into r from editors where lower(email) = mail;
  if not found then return 'not_listed'; end if;
  if r.user_id = me then return 'ok'; end if;
  if r.user_id is not null then return 'taken'; end if;
  -- signed in with a code sent to this email, on an account nobody set a password on beforehand
  emailed := exists (select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
                     where a ->> 'method' in ('otp', 'magiclink', 'email/signup', 'recovery', 'invite', 'email_change'));
  select coalesce(encrypted_password, '') <> '' into has_password from auth.users where id = me;
  if emailed and not coalesce(has_password, false) then
    update editors set user_id = me, bound_at = now(), bound_via = 'email', invite_hash = null, invite_expires = null, invite_attempts = 0 where email = r.email;
    return 'ok';
  end if;
  if code is null or trim(code) = '' then return 'need_code'; end if;
  if r.invite_hash is null then return 'need_code'; end if;
  if r.invite_attempts >= 10 then return 'locked'; end if;
  if r.invite_expires < now() then return 'expired'; end if;
  if r.invite_hash <> encode(digest(upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex') then
    update editors set invite_attempts = invite_attempts + 1 where email = r.email;
    return 'bad_code';
  end if;
  update editors set user_id = me, bound_at = now(), bound_via = 'code', invite_hash = null, invite_expires = null, invite_attempts = 0 where email = r.email;
  return 'ok';
end $$;

-- the name stamped on rows a quick session writes (updated_by / created_by)
create or replace function editor_label() returns text
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null
              when not is_bound_editor() and is_quick_editor() then '快速登入'
              else coalesce((select nullif(trim(note), '') from editors where user_id = auth.uid() limit 1), '紀錄員') end
$$;

-- ---------------------------------------------------------------- 快速登入
-- 'ok' | 'bad' | 'locked' | 'off' | 'not_signed_in' | 'not_anonymous'
create or replace function quick_login(p_code text) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  me uuid := auth.uid();
  q quick_login%rowtype;
  n int;
begin
  if me is null then return 'not_signed_in'; end if;
  -- only for the throwaway anonymous account the site signs in with (a real account signs in with its own password)
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then return 'not_anonymous'; end if;
  select * into q from quick_login where id = 1 for update;
  if not found or q.code_hash is null then return 'off'; end if;
  if q.locked_until is not null and q.locked_until > now() then return 'locked'; end if;
  if p_code is null or crypt(trim(p_code), q.code_hash) <> q.code_hash then
    n := case when q.window_start is null or q.window_start < now() - interval '1 hour' then 1 else q.failures + 1 end;
    update quick_login set failures = n,
           window_start = case when n = 1 then now() else window_start end,
           locked_until = case when n >= 10 then now() + interval '1 hour' else null end
     where id = 1;
    return case when n >= 10 then 'locked' else 'bad' end;
  end if;
  update quick_login set failures = 0, window_start = null, locked_until = null where id = 1;
  -- 永久 (days 0): until the password is changed or quick login is turned off
  insert into quick_sessions (user_id, expires_at) values (me, case when q.days = 0 then 'infinity'::timestamptz else now() + make_interval(days => q.days) end)
    on conflict (user_id) do update set expires_at = excluded.expires_at;
  -- tidy up: expired quick sessions, and throwaway accounts older than a day that are not a live quick session
  delete from quick_sessions where expires_at < now();
  begin
    delete from auth.users u where u.is_anonymous and u.created_at < now() - interval '1 day'
       and not exists (select 1 from quick_sessions s where s.user_id = u.id);
  exception when others then null;   -- never let the tidy-up stand in the way of signing in
  end;
  return 'ok';
end $$;

-- signing out of a quick session ends it
create or replace function quick_logout() returns void
language sql volatile security definer set search_path = public as $$
  delete from quick_sessions where user_id = auth.uid()
$$;

-- set (or, with null / '', turn off) the 快速登入密碼: own-account recorders on the site, or the admin here;
-- p_days = how long a quick sign-in lasts, 0 = 永久
create or replace function set_quick_login(p_code text, p_days int default 30) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare clean text := trim(coalesce(p_code, ''));
begin
  if auth.uid() is not null and not is_bound_editor() then raise exception '只有用自己帳號登入的紀錄員可以設定快速登入' using errcode = '42501'; end if;
  if p_days is null or p_days < 0 or p_days > 365 then raise exception '有效天數要在 1 到 365 天之間（0 = 永久）' using errcode = '22023'; end if;
  if clean <> '' and char_length(clean) < 6 then raise exception '快速登入密碼至少要 6 個字' using errcode = '22023'; end if;
  insert into quick_login (id) values (1) on conflict (id) do nothing;
  update quick_login set code_hash = case when clean = '' then null else crypt(clean, gen_salt('bf', 10)) end,
         days = p_days, failures = 0, window_start = null, locked_until = null,
         updated_at = now(), updated_by = coalesce(editor_label(), '管理員')
   where id = 1;
  -- everyone who signed in with the old password signs in again
  delete from quick_sessions;
  return case when clean = '' then 'off' else 'on' end;
end $$;

-- for the recorders' settings card
create or replace function quick_login_status() returns json
language plpgsql stable security definer set search_path = public as $$
declare q quick_login%rowtype;
begin
  if not is_bound_editor() then raise exception '只有用自己帳號登入的紀錄員可以看快速登入設定' using errcode = '42501'; end if;
  select * into q from quick_login where id = 1;
  return json_build_object(
    'enabled', coalesce(q.code_hash is not null, false),
    'days', coalesce(q.days, 30),
    'active', (select count(*) from quick_sessions where expires_at > now()),
    'locked_until', case when q.locked_until > now() then q.locked_until end,
    'updated_at', q.updated_at,
    'updated_by', q.updated_by);
end $$;

revoke all on function quick_login(text) from public, anon;
revoke all on function quick_logout() from public, anon;
revoke all on function set_quick_login(text, int) from public, anon;
revoke all on function quick_login_status() from public, anon;
grant execute on function quick_login(text) to authenticated;
grant execute on function quick_logout() to authenticated;
grant execute on function set_quick_login(text, int) to authenticated;
grant execute on function quick_login_status() to authenticated;
