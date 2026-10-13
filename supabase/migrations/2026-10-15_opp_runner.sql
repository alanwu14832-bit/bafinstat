-- 2026-10-15 對方代跑。到 Supabase → SQL Editor 貼上執行一次（重複執行也安全；系隊、校隊兩個 Supabase 專案各執行一次）。
--
-- 新增 pitching_pa.runner（對方代跑的姓名或背號，選填，最多 40 字）：紀錄對方打擊時，點壘上的對方跑者可以換上代跑，
-- 記在那位跑者上壘的那一列（和我隊的 batting_pa.runner 一樣）。只是換名字，我隊投手的失分、自責分都不變。
-- save_games() 本來就整列照存，不用改。
-- 沒執行前網站照常運作：對方代跑只是不會存進雲端（其他紀錄照常儲存），存檔時會提醒。

alter table pitching_pa add column if not exists runner text;

-- a short name or jersey number; NULL always passes
do $$
begin
  begin alter table pitching_pa add constraint pitching_pa_runner_size check (char_length(coalesce(runner, '')) <= 40) not valid; exception when duplicate_object then null; end;
end $$;

notify pgrst, 'reload schema';
