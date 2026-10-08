-- 2026-10-11 快速登入可以設成「永久」. Run once in Supabase → SQL Editor (safe to re-run), after 2026-10-10_quick_login.sql.
--
-- 有效天數 0 = 永久: a device signed in with the 快速登入密碼 stays a recorder until the password is changed or quick
-- login is turned off (資料匯入 → 快速登入). Nothing else changes.

alter table quick_login drop constraint if exists quick_login_days_check;
alter table quick_login add constraint quick_login_days_check check (days = 0 or days between 1 and 365);

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

revoke all on function quick_login(text) from public, anon;
revoke all on function set_quick_login(text, int) from public, anon;
grant execute on function quick_login(text) to authenticated;
grant execute on function set_quick_login(text, int) to authenticated;
