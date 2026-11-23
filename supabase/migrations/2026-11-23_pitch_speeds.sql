-- 2026-11-23 球速。到 Supabase → SQL Editor 貼上執行一次（重複執行也安全；系隊、校隊、霸龍的 Supabase 專案各執行一次）。
--
-- 新增 batting_pa.pitch_speeds 和 pitching_pa.pitch_speeds（整數陣列，單位公里／小時），跟 pitches 一顆一顆對齊；
-- 沒測到的那一球是 NULL，整個打席都沒測就整欄 NULL。pitching_pa 是我隊投手的球速，batting_pa 是對方投手的。
-- save_games() 本來就整列照存，不用改。
-- 沒執行前網站照常運作：紀錄比賽照常記球速，只是存進雲端時球速會被略過（儲存時會提醒）。

alter table batting_pa add column if not exists pitch_speeds integer[];
alter table pitching_pa add column if not exists pitch_speeds integer[];

-- as long as the pitches at most, each one a believable speed
do $$
begin
  begin alter table batting_pa add constraint batting_pa_pitch_speeds check (pitch_speeds is null or (coalesce(array_length(pitch_speeds, 1), 0) <= 40 and 0 < all (array_replace(pitch_speeds, null, 100)) and 250 > all (array_replace(pitch_speeds, null, 100)))) not valid; exception when duplicate_object then null; end;
  begin alter table pitching_pa add constraint pitching_pa_pitch_speeds check (pitch_speeds is null or (coalesce(array_length(pitch_speeds, 1), 0) <= 40 and 0 < all (array_replace(pitch_speeds, null, 100)) and 250 > all (array_replace(pitch_speeds, null, 100)))) not valid; exception when duplicate_object then null; end;
end $$;

notify pgrst, 'reload schema';
