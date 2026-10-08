# 模擬比賽（端到端檢查）

照劇本把一整場比賽在「紀錄比賽」頁一球一球按完（本機模式，不會寫進雲端），再把比賽頁顯示的
Box Score、局分表拿去和手算的正確答案逐項比對——就像賽後對著比賽影片檢查數據。

- `game1.mjs`：5 局，我隊先攻。盜壘、暴投、對方失誤上壘、雙殺、全壘打、犧觸／犧飛、觸身、故四、盜壘失敗、
  代打、代跑、換投、牽制出局、我隊失誤後的非自責分。
- `game2.mjs`：4 局，我隊主場。安打＋失誤、趁傳進壘、場地二安、捕手妨礙、三振暴投上壘、捕逸後犧飛回來的分、
  代守、半局在打席中結束（跑者被牽制）、再見二安。
- `check1.mjs`／`check2.mjs`：正確答案（打者 PA AB R H 2B HR RBI BB SO SB；投手 IP BF PC 好球 K BB HBP H R ER ERA；局分表）。

```bash
cd web && SKIP_ARCHIVE=1 npm run build && npx vite preview --port 4173 &   # 本機模式（不要設 VITE_SUPABASE_URL）
# 在裝得到 playwright 的地方執行（例如暫存資料夾：npm i --no-save playwright）
node tools/gamesim/game1.mjs /tmp/out && node tools/gamesim/check1.mjs /tmp/out/game1-shown.json
node tools/gamesim/game2.mjs /tmp/out && node tools/gamesim/check2.mjs /tmp/out/game2-shown.json
```
`CHROMIUM=/path/to/chromium` 指定瀏覽器，`GAMESIM_URL` 指定網址。2026-10-08 第一次跑時找到：雙殺把 2 個出局算成 3 個、
換投後的出局算給前一任投手、代守時同一次失誤算給兩個人、捕手妨礙沒算成失誤（都已修正）。
