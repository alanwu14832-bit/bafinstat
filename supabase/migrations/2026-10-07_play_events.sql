-- 每一球之間的跑壘順序（盜壘、暴投進壘、牽制出局…發生在第幾球之後、哪個壘、跑到哪裡）。
-- 修改資料頁靠它逐球重現；沒有執行前，次數照常儲存，只是順序不會存進雲端。重複執行也安全。
alter table batting_pa  add column if not exists events jsonb;
alter table pitching_pa add column if not exists events jsonb;
