-- 2026-10-16 對方打者左打／右打。到 Supabase → SQL Editor 貼上執行一次（重複執行也安全；系隊、校隊兩個 Supabase 專案各執行一次）。
--
-- 新增 pitching_pa.opp_bats（對方打者這個打席站左打 'L'、右打 'R'；左右開弓的打者記他這次站的那邊；不知道就空白）：
-- 紀錄比賽時對方打擊會問一次（同一棒這場之後自動帶入），用來算我隊投手「對左打／對右打」。
-- save_games() 本來就整列照存，不用改。
-- 沒執行前網站照常運作：紀錄比賽頁只是不會問對方打者左右打（其他紀錄照常儲存）；匯入的 Excel 有這一欄時存檔會提醒。

alter table pitching_pa add column if not exists opp_bats text;

-- the site writes only L / R; NULL (不知道) always passes
do $$
begin
  begin alter table pitching_pa add constraint pitching_pa_opp_bats check (opp_bats in ('L', 'R')) not valid; exception when duplicate_object then null; end;
end $$;

notify pgrst, 'reload schema';
