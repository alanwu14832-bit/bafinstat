-- 2026-10-10 快速登入. Run once in Supabase → SQL Editor (safe to re-run), after 2026-10-08_security.sql.
-- Also turn on: Authentication → Sign In / Providers → Allow anonymous sign-ins.
--
-- A shared 快速登入密碼 lets whoever knows it record on that device for some days without an account of their own.
-- The site signs in anonymously (a throwaway account with no email) and quick_login(password) records that account as
-- a quick session. The password is checked here (bcrypt hash; the site never sees it), and after 10 wrong tries within
-- an hour quick login pauses for an hour for everyone (signing in with email keeps working).
-- A quick session can record and edit like any recorder, but cannot see or change the 紀錄員名單, the 操作紀錄 or the
-- 快速登入密碼: those stay with recorders signed in with their own account. Changing or turning off the password signs
-- every quick session out.
--
-- The admin can also set it here:  select set_quick_login('一組密碼', 30);   (30 = days a quick sign-in lasts; 0 = 永久)
-- and turn it off:                 select set_quick_login(null);

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
  -- everyone who signed in with the old password signs in again (Supabase refuses a DELETE without WHERE)
  delete from quick_sessions where user_id is not null;
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
