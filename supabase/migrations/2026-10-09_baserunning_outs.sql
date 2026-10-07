-- 壘死：跑者自己跑壘失誤出局（衝過頭、飛球被雙殺回不去、離壘被觸殺…）的次數，算在這位跑者的打席列上。
-- 原本的 out_on_base（壘上出局）不變，仍是「上壘後在壘上出局」的所有次數；壘死是其中的一部分。
-- 沒有執行前網站照常運作，只是「壘死」不會存進雲端（存檔時會提醒）。重複執行也安全。
alter table batting_pa add column if not exists baserunning_outs smallint not null default 0;
notify pgrst, 'reload schema';
