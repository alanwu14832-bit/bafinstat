-- 身分多一種「教練」（2026-11-12）：權限和球員一樣（登入看全部數據，不能改），只是名單上標成教練。
-- 重複執行也安全。Supabase → SQL Editor → New query → 貼上整個檔案 → Run。

alter table editors drop constraint if exists editors_role_check;
alter table editors add constraint editors_role_check check (role in ('player', 'coach', 'recorder', 'admin'));

create or replace function add_member(p_email text, p_role text, p_note text default null) returns text
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '只有管理者可以新增帳號' using errcode = '42501'; end if;
  if p_role is null or p_role not in ('player', 'coach', 'recorder', 'admin') then raise exception '身分只能是球員、教練、紀錄員或管理者' using errcode = '22023'; end if;
  if p_email is null or lower(trim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'email 格式不對' using errcode = '22023'; end if;
  insert into editors (email, note, role) values (lower(trim(p_email)), nullif(left(trim(coalesce(p_note, '')), 60), ''), p_role);
  return _set_invite(p_email);
end $$;
create or replace function set_member_role(p_email text, p_role text) returns text
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '只有管理者可以改身分' using errcode = '42501'; end if;
  if p_role is null or p_role not in ('player', 'coach', 'recorder', 'admin') then raise exception '身分只能是球員、教練、紀錄員或管理者' using errcode = '22023'; end if;
  if lower(trim(p_email)) = lower(auth.jwt() ->> 'email') then raise exception '不能改自己的身分' using errcode = '42501'; end if;
  update editors set role = p_role where lower(email) = lower(trim(p_email));
  if not found then raise exception '名單上沒有這個 email' using errcode = 'P0002'; end if;
  return p_role;
end $$;
revoke all on function add_member(text, text, text) from public, anon;
revoke all on function set_member_role(text, text) from public, anon;
grant execute on function add_member(text, text, text) to authenticated;
grant execute on function set_member_role(text, text) to authenticated;

notify pgrst, 'reload schema';
