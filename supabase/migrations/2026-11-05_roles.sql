-- 身分分層（2026-11-05）：一般人（不用登入）→ 球員（登入看全部數據，不能改）→ 紀錄員（紀錄、修改比賽）→ 管理者（帳號管理）。
-- 帳號名單還是 editors 這張表，多一欄 role：'player' 球員、'recorder' 紀錄員（原本名單上的人都是）、'admin' 管理者。
-- 第一位管理者：備註「管理員」的那一列（第一次架設時 schema.sql 加的）；沒有的話，最早啟用的帳號。
-- 寫入權限照舊由 is_editor() 決定，只是球員不算；帳號名單、新增帳號、重發邀請碼、改身分只有管理者可以。
-- 重複執行也安全。執行完最下面會列出每個帳號的身分。
-- Supabase → SQL Editor → New query → 貼上整個檔案 → Run。

alter table editors add column if not exists role text not null default 'recorder';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'editors_role_check') then
    alter table editors add constraint editors_role_check check (role in ('player', 'recorder', 'admin'));
  end if;
end $$;
grant select (role) on editors to authenticated;

-- the first admin (only while there is none)
do $$ begin
  if not exists (select 1 from editors where role = 'admin') then
    update editors set role = 'admin' where note = '管理員';
    if not exists (select 1 from editors where role = 'admin') then
      update editors set role = 'admin'
       where email = (select email from editors where user_id is not null order by bound_at nulls last, created_at limit 1);
    end if;
  end if;
end $$;

-- 紀錄員 = an account bound to the list as recorder or admin (players are listed and bound, but only read)
create or replace function is_bound_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from editors where user_id = auth.uid() and role in ('recorder', 'admin'))
$$;
-- 管理者: the account list, new accounts, 邀請碼, roles
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from editors where user_id = auth.uid() and role = 'admin')
$$;
-- 球員以上: any account bound to the list (for data only the team may read)
create or replace function is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from editors where user_id = auth.uid())
$$;
-- what the signed-in account is: 'admin' | 'recorder' | 'player', 'recorder' for a live 快速登入, null otherwise
create or replace function my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from editors where user_id = auth.uid()), case when is_quick_editor() then 'recorder' end)
$$;
revoke all on function is_admin() from public, anon;
revoke all on function is_member() from public, anon;
revoke all on function my_role() from public, anon;
grant execute on function is_admin() to authenticated;
grant execute on function is_member() to authenticated;
grant execute on function my_role() to authenticated;

-- the account list: admins see and remove (never themselves); everyone still sees their own row ("self read")
drop policy if exists "editors read" on editors;
create policy "editors read" on editors for select to authenticated using (is_admin());
drop policy if exists "editors remove" on editors;
create policy "editors remove" on editors for delete to authenticated using (is_admin() and user_id is distinct from auth.uid() and lower(email) <> lower(auth.jwt() ->> 'email'));

-- 新增帳號 with a role; returns the one-time 邀請碼
create or replace function add_member(p_email text, p_role text, p_note text default null) returns text
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '只有管理者可以新增帳號' using errcode = '42501'; end if;
  if p_role is null or p_role not in ('player', 'recorder', 'admin') then raise exception '身分只能是球員、紀錄員或管理者' using errcode = '22023'; end if;
  if p_email is null or lower(trim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'email 格式不對' using errcode = '22023'; end if;
  insert into editors (email, note, role) values (lower(trim(p_email)), nullif(left(trim(coalesce(p_note, '')), 60), ''), p_role);
  return _set_invite(p_email);
end $$;
-- 改身分 (never your own: an admin cannot lock the list out by demoting themselves)
create or replace function set_member_role(p_email text, p_role text) returns text
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '只有管理者可以改身分' using errcode = '42501'; end if;
  if p_role is null or p_role not in ('player', 'recorder', 'admin') then raise exception '身分只能是球員、紀錄員或管理者' using errcode = '22023'; end if;
  if lower(trim(p_email)) = lower(auth.jwt() ->> 'email') then raise exception '不能改自己的身分' using errcode = '42501'; end if;
  update editors set role = p_role where lower(email) = lower(trim(p_email));
  if not found then raise exception '名單上沒有這個 email' using errcode = 'P0002'; end if;
  return p_role;
end $$;
-- the older ones: a recorder, added by an admin; 重發邀請碼 by an admin
create or replace function add_editor(p_email text, p_note text default null) returns text
language plpgsql volatile security definer set search_path = public as $$
begin
  return add_member(p_email, 'recorder', p_note);
end $$;
create or replace function reset_editor(p_email text) returns text
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '只有管理者可以重發邀請碼' using errcode = '42501'; end if;
  if lower(trim(p_email)) = lower(auth.jwt() ->> 'email') then raise exception '不能重設自己' using errcode = '42501'; end if;
  return _set_invite(p_email);
end $$;
revoke all on function add_member(text, text, text) from public, anon;
revoke all on function set_member_role(text, text) from public, anon;
grant execute on function add_member(text, text, text) to authenticated;
grant execute on function set_member_role(text, text) to authenticated;

notify pgrst, 'reload schema';

-- 每個帳號的身分（admin 管理者、recorder 紀錄員、player 球員）
select email as 帳號, role as 身分, case when user_id is null then '還沒啟用' else '已啟用' end as 狀態 from editors order by role, email;
