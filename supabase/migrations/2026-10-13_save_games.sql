-- 2026-10-13 存檔保護. Run once in Supabase → SQL Editor (safe to re-run).
--
-- 1) 一場比賽一次存完: the site saves games (the game row and its 打擊／投球／守備紀錄) through save_games(), which runs
--    as one transaction — if anything fails halfway (connection lost, a size limit), nothing changes and the records
--    already in the cloud stay as they were. Before this the site deleted the old records and wrote the new ones in
--    separate requests, so a failure in between could leave a game without its records.
-- 2) 快速登入「解除暫停」: a recorder signed in with their own account can lift the pause that 10 wrong passwords
--    cause, without changing the password (unlock_quick_login, needs 2026-10-10_quick_login.sql first).
-- Until this runs the site keeps saving the old way.

-- the columns the site writes (added by earlier migrations; repeated so this file works on its own)
-- (end_time: 2026-10-14_record_fields.sql; added here too, so re-running this file after that one keeps the same save_games())
alter table games add column if not exists end_time text;
alter table games add column if not exists status text;
alter table games add column if not exists day_roster jsonb;
alter table batting_pa add column if not exists runner text;
alter table batting_pa add column if not exists events jsonb;
alter table batting_pa add column if not exists baserunning_outs smallint not null default 0;
alter table pitching_pa add column if not exists errors text[];
alter table pitching_pa add column if not exists events jsonb;

-- a JSON object without its null fields (so the column defaults apply)
create or replace function _no_nulls(j jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select j - coalesce((select array_agg(key) from jsonb_each(j) where jsonb_typeof(value) = 'null'), '{}'::text[])
$$;

-- Save games and replace their records, all or nothing. Rows are the site's (snake_case, like the tables).
-- p_only_new: 合併匯入 — games already in the cloud are left untouched. Returns how many games were written.
-- Runs with the caller's rights: the row level security policies (紀錄員 only) apply to every write.
create or replace function save_games(p_games jsonb, p_batting jsonb default '[]', p_pitching jsonb default '[]',
                                      p_fielding jsonb default '[]', p_only_new boolean default false) returns int
language plpgsql volatile security invoker set search_path = public as $$
declare ids text[];
begin
  if not is_editor() then raise exception '你的帳號不在紀錄員名單，無法寫入' using errcode = '42501'; end if;
  if jsonb_typeof(p_games) is distinct from 'array' then raise exception 'save_games: p_games 要是陣列' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct g ->> 'id'), '{}') into ids from jsonb_array_elements(p_games) g where coalesce(g ->> 'id', '') <> '';
  if p_only_new then
    select coalesce(array_agg(i), '{}') into ids from unnest(ids) i where not exists (select 1 from games where id = i);
  end if;
  if cardinality(ids) = 0 then return 0; end if;

  insert into games as t (id, date, time, end_time, tournament, opponent, home_away, venue, weather, recorder, innings,
                          winning_pitcher, losing_pitcher, save_pitcher, holds, note, status, day_roster)
  select r.id, r.date, r.time, r.end_time, coalesce(r.tournament, '未分類'), coalesce(r.opponent, '未知'), coalesce(r.home_away, '主'),
         r.venue, r.weather, r.recorder, r.innings, r.winning_pitcher, r.losing_pitcher, r.save_pitcher, r.holds, r.note,
         r.status, r.day_roster
    from jsonb_populate_recordset(null::games, p_games) r
   where r.id = any(ids)
  on conflict (id) do update set
    date = excluded.date, time = excluded.time, end_time = excluded.end_time, tournament = excluded.tournament, opponent = excluded.opponent,
    home_away = excluded.home_away, venue = excluded.venue, weather = excluded.weather, recorder = excluded.recorder,
    innings = excluded.innings, winning_pitcher = excluded.winning_pitcher, losing_pitcher = excluded.losing_pitcher,
    save_pitcher = excluded.save_pitcher, holds = excluded.holds, note = excluded.note, status = excluded.status,
    day_roster = coalesce(excluded.day_roster, t.day_roster),   -- saved without a 當日登錄名單: keep the one it has
    updated_at = now();

  delete from batting_pa where game_id = any(ids);
  delete from pitching_pa where game_id = any(ids);
  delete from fielding_lines where game_id = any(ids);
  insert into batting_pa
  select r.* from jsonb_array_elements(coalesce(p_batting, '[]')) j,
         jsonb_populate_record(null::batting_pa, '{"pitches": [], "result": "", "sb": 0, "cs": 0, "adv_on_error": 0, "out_on_base": 0, "baserunning_outs": 0, "run": 0, "rbi": 0}'::jsonb || _no_nulls(j)) r
   where j ->> 'game_id' = any(ids);
  insert into pitching_pa
  select r.* from jsonb_array_elements(coalesce(p_pitching, '[]')) j,
         jsonb_populate_record(null::pitching_pa, '{"pitches": [], "result": "", "sba": 0, "cs": 0, "wp": 0, "pb": 0, "pk": 0}'::jsonb || _no_nulls(j)) r
   where j ->> 'game_id' = any(ids);
  insert into fielding_lines
  select r.* from jsonb_array_elements(coalesce(p_fielding, '[]')) j,
         jsonb_populate_record(null::fielding_lines, '{"po": 0, "a": 0, "e": 0, "dp": 0, "pb": 0, "sb": 0, "cs": 0}'::jsonb || _no_nulls(j)) r
   where j ->> 'game_id' = any(ids);
  return cardinality(ids);
end $$;

-- 解除快速登入的暫停 (10 wrong passwords within an hour), keeping the password
create or replace function unlock_quick_login() returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_bound_editor() then raise exception '只有用自己帳號登入的紀錄員可以解除暫停' using errcode = '42501'; end if;
  update quick_login set failures = 0, window_start = null, locked_until = null where id = 1;
end $$;

revoke all on function _no_nulls(jsonb) from public, anon;
revoke all on function save_games(jsonb, jsonb, jsonb, jsonb, boolean) from public, anon;
revoke all on function unlock_quick_login() from public, anon;
grant execute on function _no_nulls(jsonb) to authenticated;
grant execute on function save_games(jsonb, jsonb, jsonb, jsonb, boolean) to authenticated;
grant execute on function unlock_quick_login() to authenticated;

notify pgrst, 'reload schema';
