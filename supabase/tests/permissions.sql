-- 資料庫權限測試: who can read and write what, after schema.sql and the latest migrations (run.sh runs it).
-- Every check raises an error when it does not hold, so psql stops (ON_ERROR_STOP) and the run fails.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

-- like Supabase: an UPDATE or DELETE without WHERE is refused (when pg-safeupdate is installed)
do $$ begin execute 'load ''safeupdate'''; perform set_config('test.safeupdate', 'on', false);
exception when others then raise warning 'safeupdate not installed: DELETE-without-WHERE is not checked'; end $$;

create function pg_temp.ok(cond boolean, what text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAILED: %', what; end if; raise notice 'ok - %', what; end $$;
-- run a statement as the current role; it must be refused
create function pg_temp.refused(stmt text, what text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'ok - % (refused: %)', what, sqlerrm; return; end;
  raise exception 'FAILED: % — it was allowed: %', what, stmt;
end $$;
-- run a query returning one value as the current role
create function pg_temp.val(q text) returns text language plpgsql as $$ declare v text; begin execute q into v; return v; end $$;
-- act as someone: a user id and the JWT claims PostgREST would set (null = the anon role, not signed in)
create function pg_temp.act(uid text, email text default null, anonymous boolean default false) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid, ''), false);
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid, 'email', email, 'role', 'authenticated', 'is_anonymous', anonymous, 'amr', json_build_array(json_build_object('method', 'password')))::text end, false);
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;
do $$ begin if current_setting('test.safeupdate', true) = 'on' then perform pg_temp.refused('delete from quick_sessions', 'safeupdate is on (a DELETE without WHERE is refused, as on Supabase)'); end if; end $$;

-- people: A = recorder bound to the account, B = signed up but not listed, C = listed but never activated (no 邀請碼 used),
-- D = recorder who will be reset, Q = a throwaway anonymous account (快速登入)
insert into auth.users (id, email, encrypted_password) values
  ('00000000-0000-0000-0000-00000000000a', 'a@x.com', 'x'), ('00000000-0000-0000-0000-00000000000b', 'b@x.com', 'x'),
  ('00000000-0000-0000-0000-00000000000c', 'c@x.com', 'x'), ('00000000-0000-0000-0000-00000000000d', 'd@x.com', 'x');
insert into auth.users (id, is_anonymous) values ('00000000-0000-0000-0000-0000000000a1', true);
select admin_bind_editor('a@x.com', '小明');
select admin_bind_editor('d@x.com', '小華');
insert into editors (email) values ('c@x.com') on conflict do nothing;
insert into games (id, date, tournament, opponent, home_away) values ('G0', '2026-10-01', '聯賽', '政大', '主');
insert into batting_pa (game_id, seq, inning, batter) values ('G0', 1, 1, '甲');

\echo '--- 沒登入（anon）'
select pg_temp.act(null);
set role anon;
select pg_temp.ok(pg_temp.val('select count(*) from games')::int = 1, 'anon reads games');
select pg_temp.ok(pg_temp.val('select count(*) from batting_pa')::int = 1, 'anon reads batting_pa');
select pg_temp.refused($q$insert into games (id, date) values ('X', '2026-10-01')$q$, 'anon cannot add a game');
select pg_temp.refused($q$delete from batting_pa where game_id = 'G0'$q$, 'anon cannot delete records');
select pg_temp.refused($q$select save_games('[{"id":"X","date":"2026-10-01"}]')$q$, 'anon cannot call save_games');
select pg_temp.refused('select count(*) from editors', 'anon cannot read the 紀錄員名單');
select pg_temp.refused('select count(*) from audit_log', 'anon cannot read the 操作紀錄');
select pg_temp.refused('select count(*) from quick_login', 'anon cannot read the 快速登入 row');
select pg_temp.refused($q$select set_quick_login('123456')$q$, 'anon cannot set the 快速登入密碼');
reset role;

\echo '--- 註冊了但不在名單（B）'
select pg_temp.act('00000000-0000-0000-0000-00000000000b', 'b@x.com');
set role authenticated;
select pg_temp.ok(not is_editor(), 'B is not a recorder');
select pg_temp.ok(claim_editor() = 'not_listed', 'B: claim_editor says not_listed');
select pg_temp.refused($q$insert into games (id, date) values ('X', '2026-10-01')$q$, 'B cannot add a game');
select pg_temp.refused($q$select save_games('[{"id":"X","date":"2026-10-01"}]')$q$, 'B cannot save games');
select pg_temp.refused($q$insert into record_drafts (game_id, state) values ('X', '{}')$q$, 'B cannot write progress');
select pg_temp.ok(pg_temp.val('select count(*) from editors')::int = 0, 'B sees no one on the 紀錄員名單');
select pg_temp.refused($q$select add_editor('b@x.com')$q$, 'B cannot add himself');
reset role;

\echo '--- 在名單但還沒用邀請碼（C）'
select pg_temp.act('00000000-0000-0000-0000-00000000000c', 'c@x.com');
set role authenticated;
select pg_temp.ok(not is_editor(), 'C (same email, own password, no 邀請碼) is not a recorder');
select pg_temp.ok(claim_editor() = 'need_code', 'C: claim_editor asks for the 邀請碼');
select pg_temp.refused($q$select save_games('[{"id":"X","date":"2026-10-01"}]')$q$, 'C cannot save games');
reset role;

\echo '--- 紀錄員（A）'
select pg_temp.act('00000000-0000-0000-0000-00000000000a', 'a@x.com');
set role authenticated;
select pg_temp.ok(is_editor() and is_bound_editor(), 'A is a bound recorder');
select pg_temp.ok(save_games('[{"id":"G1","date":"2026-10-02","opponent":"台大"}]', '[{"game_id":"G1","seq":1,"inning":1,"batter":"甲","pitches":["B","IP"],"result":"一安"}]') = 1, 'A saves a game with save_games');
select pg_temp.ok(pg_temp.val($q$select updated_by from games where id = 'G1'$q$) = '小明', 'the game is stamped with the recorder''s name');
select pg_temp.ok(not exists (select 1 from games where updated_by like '%@%'), 'no email on the public games table');
select pg_temp.refused($q$select save_games('[{"id":"G1","date":"2026-10-02","opponent":"改過"}]', ('[{"game_id":"G1","seq":1,"inning":1,"batter":"甲","note":"' || repeat('x', 1200) || '"}]')::jsonb)$q$, 'a save that breaks a limit is refused');
select pg_temp.ok(pg_temp.val($q$select opponent from games where id = 'G1'$q$) = '台大' and pg_temp.val($q$select count(*) from batting_pa where game_id = 'G1'$q$)::int = 1, 'and leaves the game and its records as they were');
-- 2026-10-14: 結束時間 and 對方投手 (opp_pitcher / opp_hand) go through save_games too
select pg_temp.ok(save_games('[{"id":"G3","date":"2026-10-04","time":"13:07","end_time":"15:22"}]', '[{"game_id":"G3","seq":1,"inning":1,"batter":"甲","pitches":["IP"],"result":"一安","opp_pitcher":"王","opp_hand":"L"}]') = 1, 'A saves a game with an end time and the opponent pitcher');
select pg_temp.ok(pg_temp.val($q$select end_time from games where id = 'G3'$q$) = '15:22', 'end_time reads back');
select pg_temp.ok(pg_temp.val($q$select opp_hand || opp_pitcher from batting_pa where game_id = 'G3'$q$) = 'L王', 'opp_hand and opp_pitcher read back');
select pg_temp.refused($q$select save_games('[{"id":"G3","date":"2026-10-04","time":"13:07","end_time":"16:00"}]', '[{"game_id":"G3","seq":1,"inning":1,"batter":"甲","result":"一安","opp_hand":"左"}]')$q$, 'an opp_hand other than L / R is refused');
select pg_temp.ok(pg_temp.val($q$select end_time from games where id = 'G3'$q$) = '15:22', 'and the game keeps its end time');
select pg_temp.ok(pg_temp.val('select count(*) from editors')::int >= 3, 'A sees the 紀錄員名單');
select pg_temp.ok(pg_temp.val('select count(*) from audit_log')::int > 0, 'A sees the 操作紀錄');
select pg_temp.ok(length(add_editor('e@x.com', '新人')) = 10, 'A adds a recorder and gets a 10-character 邀請碼');
select pg_temp.ok(length(reset_editor('d@x.com')) = 10, 'A resets D (new 邀請碼)');
select pg_temp.ok(set_quick_login('248163', 30) = 'on', 'A sets the 快速登入密碼 (its DELETE has a WHERE)');
delete from editors where email = 'a@x.com';   -- row level security leaves his own row alone
select pg_temp.ok(pg_temp.val($q$select count(*) from editors where email = 'a@x.com'$q$)::int = 1, 'A cannot remove himself');
reset role;
select pg_temp.ok(not exists (select 1 from audit_log where old_row::text like '%invite_hash%'), 'the 操作紀錄 never keeps a 邀請碼 hash');

\echo '--- 被重設的紀錄員（D）'
select pg_temp.act('00000000-0000-0000-0000-00000000000d', 'd@x.com');
set role authenticated;
select pg_temp.ok(not is_editor(), 'D lost write access after the reset');
select pg_temp.refused($q$select save_games('[{"id":"X","date":"2026-10-01"}]')$q$, 'D cannot save games');
reset role;

\echo '--- 快速登入（Q）'
select pg_temp.act('00000000-0000-0000-0000-0000000000a1', null, true);
set role authenticated;
select pg_temp.ok(not is_editor(), 'Q before the password is not a recorder');
select pg_temp.refused($q$select save_games('[{"id":"X","date":"2026-10-01"}]')$q$, 'Q cannot save before the password');
select pg_temp.ok(quick_login('000000') = 'bad', 'a wrong password is refused');
select pg_temp.ok(quick_login(' 248163 ') = 'ok', 'the right password signs Q in');
select pg_temp.ok(is_editor() and not is_bound_editor(), 'Q can write but is not a bound recorder');
select pg_temp.ok(save_games('[{"id":"G2","date":"2026-10-03"}]') = 1, 'Q saves a game');
select pg_temp.ok(pg_temp.val($q$select updated_by from games where id = 'G2'$q$) = '快速登入', 'stamped 快速登入');
select pg_temp.ok(pg_temp.val('select count(*) from editors')::int = 0, 'Q sees no one on the 紀錄員名單');
select pg_temp.ok(pg_temp.val('select count(*) from audit_log')::int = 0, 'Q sees no 操作紀錄');
select pg_temp.refused($q$select set_quick_login('999999')$q$, 'Q cannot change the 快速登入密碼');
select pg_temp.refused('select quick_login_status()', 'Q cannot read the 快速登入 settings');
select pg_temp.refused('select unlock_quick_login()', 'Q cannot lift a pause');
select pg_temp.refused($q$select add_editor('q@x.com')$q$, 'Q cannot add recorders');
select quick_logout();
select pg_temp.ok(not is_editor(), 'after signing out Q cannot write');
reset role;

\echo '--- 錯 10 次暫停，紀錄員解除'
insert into auth.users (id, is_anonymous) values ('00000000-0000-0000-0000-0000000000a2', true);
select pg_temp.act('00000000-0000-0000-0000-0000000000a2', null, true);
set role authenticated;
select quick_login('wrong') from generate_series(1, 10);
select pg_temp.ok(quick_login('248163') = 'locked', 'after 10 wrong passwords even the right one waits');
reset role;
select pg_temp.act('00000000-0000-0000-0000-00000000000a', 'a@x.com');
set role authenticated;
select unlock_quick_login();
select pg_temp.ok((quick_login_status() ->> 'locked_until') is null, 'A lifts the pause');
reset role;
select pg_temp.act('00000000-0000-0000-0000-0000000000a2', null, true);
set role authenticated;
select pg_temp.ok(quick_login('248163') = 'ok', 'the right password works again, unchanged');
reset role;
select pg_temp.act('00000000-0000-0000-0000-00000000000a', 'a@x.com');
set role authenticated;
select pg_temp.ok(set_quick_login(null) = 'off', 'A turns 快速登入 off');
reset role;
select pg_temp.act('00000000-0000-0000-0000-0000000000a2', null, true);
set role authenticated;
select pg_temp.ok(not is_editor(), 'turning it off signs every quick session out');
reset role;

\echo 'all permission checks passed'
