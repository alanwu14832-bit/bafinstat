-- 2026-10-08 資料安全強化. Run once in Supabase → SQL Editor (safe to re-run).
-- (重跑這個檔之後，也要再跑一次 2026-10-10_quick_login.sql，快速登入才會繼續有效。)
--
-- 1) 紀錄員綁定帳號: write access belongs to one login account, not to whoever can sign up with the email.
--    A recorder's account is bound on first use by an email code (proves they own the inbox) or by the one-time
--    邀請碼 an existing recorder (or the admin, from here) hands them.
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

-- (2026-10-13: this file no longer binds existing accounts by email on its own — with sign-ups open, whoever registered
--  a listed email first would have become a recorder. Accounts are bound by an email code, the 邀請碼 or admin_bind_editor.)

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

-- 檢查：綁定結果（user_id 有值＝已綁定；bound_via existing＝第一次執行這個檔時自動綁定的舊帳號，請確認都是本人）
select email, note, bound_via, bound_at, (select last_sign_in_at from auth.users u where u.id = editors.user_id) as last_sign_in
  from editors order by created_at;

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
