-- 2026-10-18 換投時這個打席已投的球算給誰。到 Supabase → SQL Editor 貼上執行一次（重複執行也安全；系隊、校隊兩個 Supabase 專案各執行一次）。
--
-- 新增 pitching_pa.prior_pitchers（jsonb，例如 [{"name":"林昱丞","pitches":3}]）：
-- 一個打席投到一半換投時，換下的投手在這個打席已經投的球數（照順序）。這一列的 pitcher 是接手、投完這個打席的人；
-- 換下的投手那幾球算他自己的用球數（PC、好壞球、揮空…），不再全部算給接手的投手。沒有換投的打席這欄是空的。
-- save_games() 本來就整列照存，不用改。
-- 沒執行前網站照常運作：紀錄比賽照常記，只是這幾球存進雲端時算給接手的投手（儲存時會提醒）；本機和已經在雲端的資料不受影響。

alter table pitching_pa add column if not exists prior_pitchers jsonb;

-- small and well formed: a list of {name, pitches}
do $$
begin
  begin alter table pitching_pa add constraint pitching_pa_prior_pitchers check (prior_pitchers is null or (jsonb_typeof(prior_pitchers) = 'array' and pg_column_size(prior_pitchers) < 2000)) not valid; exception when duplicate_object then null; end;
end $$;

notify pgrst, 'reload schema';
