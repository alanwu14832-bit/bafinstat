-- 球員自己註冊：帳號與名單的對應搬到 player_accounts，players 不再存 email。
-- 名單是公開資料，信箱跟著公開並不妥；這張表只有本人和紀錄員讀得到。
-- Run once in the SQL Editor (safe to re-run). 需要先跑過 2026-09-13_practice.sql。

create table if not exists player_accounts (
  player_name text primary key,
  user_id     uuid unique references auth.users(id) on delete cascade,
  email       text,
  claimed_at  timestamptz not null default now()
);
create unique index if not exists player_accounts_email_idx on player_accounts (lower(email)) where email is not null;

-- 把管理員先前填在名單上的信箱搬過來，然後移除公開的欄位
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'players' and column_name = 'email') then
    insert into player_accounts (player_name, email)
      select name, lower(email) from players where email is not null
      on conflict (player_name) do nothing;
    drop index if exists players_email_idx;
    alter table players drop column email;
  end if;
end $$;

-- 登入者對應到的球員：先看綁定的帳號，再看管理員先前填的信箱
create or replace function my_player_name() returns text
language sql stable security definer set search_path = public as $$
  select player_name from player_accounts
   where user_id = auth.uid()
      or (user_id is null and email is not null and lower(email) = lower(auth.jwt() ->> 'email'))
   order by (user_id = auth.uid()) desc
   limit 1
$$;

/**
 * 註冊後認領名單上的名字。名字必須在名單上、還沒被別人認領，而且一個帳號只能對到一個球員。
 * 認領只讓人回覆練球，不會給任何寫入比賽資料的權限（那仍然只看 editors 表）。
 */
create or replace function claim_player_name(name text) returns text
language plpgsql security definer set search_path = public as $$
declare target text;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  select p.name into target from players p where p.name = btrim(claim_player_name.name) limit 1;
  if target is null then raise exception '名單上沒有「%」，請先請管理員把你加進球員名單', btrim(claim_player_name.name); end if;
  if exists (select 1 from player_accounts a where a.player_name = target and a.user_id = auth.uid()) then return target; end if;
  if exists (select 1 from player_accounts a where a.user_id = auth.uid() and a.player_name <> target) then
    raise exception '這個帳號已經是其他球員的帳號了，請找管理員處理';
  end if;
  insert into player_accounts as a (player_name, user_id, email)
  values (target, auth.uid(), lower(auth.jwt() ->> 'email'))
  on conflict (player_name) do update
    set user_id = auth.uid(), email = lower(auth.jwt() ->> 'email'), claimed_at = now()
    where a.user_id is null;
  if not exists (select 1 from player_accounts a where a.player_name = target and a.user_id = auth.uid()) then
    raise exception '「%」已經有人註冊過了，請找管理員確認', target;
  end if;
  return target;
end $$;
grant execute on function claim_player_name(text) to authenticated;

alter table player_accounts enable row level security;
drop policy if exists "own or editor read" on player_accounts;
create policy "own or editor read" on player_accounts for select to authenticated using (is_editor() or user_id = auth.uid());
drop policy if exists "editors manage" on player_accounts;
create policy "editors manage" on player_accounts for all to authenticated using (is_editor()) with check (is_editor());
