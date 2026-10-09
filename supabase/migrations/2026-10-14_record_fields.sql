-- 2026-10-14 紀錄比賽的新欄位。到 Supabase → SQL Editor 貼上執行一次（重複執行也安全；系隊、校隊兩個 Supabase 專案各執行一次）。
--
-- 1) 比賽時間：games.end_time（結束時間 'HH:MM'）。開賽時間沿用 games.time；比賽時間＝兩者相減，不另外存。
-- 2) 對方投手：batting_pa.opp_pitcher（姓名，選填）、batting_pa.opp_hand（'L' 左投、'R' 右投）。紀錄比賽時對方換投點一下，
--    之後我隊每個打席自動帶入，用來看「對左投／對右投」。
-- 3) save_games() 也存 end_time（打擊／投球紀錄的新欄位它本來就整列照存）。2026-10-13_save_games.sql 裡的 save_games() 已改成
--    同一版，兩個檔案不論先後執行，結果都一樣。
-- 這一輪其他功能（突破僵局、投手犯規、對方打者姓名、中繼、比賽影片）都用現有欄位，不需要別的 SQL。
-- 沒執行前網站照常運作：結束時間和對方投手只是不會存進雲端（紀錄頁不會問對方投手，存檔時會提醒）。
-- 需要先執行過 2026-10-08_security.sql（is_editor()）。

alter table games add column if not exists end_time text;
alter table batting_pa add column if not exists opp_pitcher text;
alter table batting_pa add column if not exists opp_hand text;
-- the columns save_games() writes that earlier migrations added (repeated so this file works on its own)
alter table games add column if not exists status text;
alter table games add column if not exists day_roster jsonb;
alter table batting_pa add column if not exists runner text;
alter table batting_pa add column if not exists events jsonb;
alter table batting_pa add column if not exists baserunning_outs smallint not null default 0;
alter table pitching_pa add column if not exists errors text[];
alter table pitching_pa add column if not exists events jsonb;

-- limits on what can be written (the site writes only L / R, a short name and HH:MM); NULL always passes
do $$
begin
  begin alter table batting_pa add constraint batting_pa_opp_hand check (opp_hand in ('L', 'R')) not valid; exception when duplicate_object then null; end;
  begin alter table batting_pa add constraint batting_pa_opp_pitcher_size check (char_length(coalesce(opp_pitcher, '')) <= 40) not valid; exception when duplicate_object then null; end;
  begin alter table games add constraint games_end_time_size check (char_length(coalesce(end_time, '')) <= 8) not valid; exception when duplicate_object then null; end;
end $$;

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

revoke all on function _no_nulls(jsonb) from public, anon;
revoke all on function save_games(jsonb, jsonb, jsonb, jsonb, boolean) from public, anon;
grant execute on function _no_nulls(jsonb) to authenticated;
grant execute on function save_games(jsonb, jsonb, jsonb, jsonb, boolean) to authenticated;

notify pgrst, 'reload schema';
