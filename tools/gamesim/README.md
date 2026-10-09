# 模擬比賽（端到端檢查）

照劇本把一整場比賽在「紀錄比賽」頁一球一球按完（本機模式，不會寫進雲端），再把比賽頁顯示的
Box Score、局分表拿去和手算的正確答案逐項比對——就像賽後對著比賽影片檢查數據。

- `game1.mjs`：5 局，我隊先攻。盜壘、暴投、對方失誤上壘、雙殺、全壘打、犧觸／犧飛、觸身、故四、盜壘失敗、
  代打、代跑、換投、牽制出局、我隊失誤後的非自責分。第一位打者之後在「對方投手是？」點「右投」（存下的我隊打席都要是
  對方右投，逐球・打擊有「對方先發・右投」），結束比賽勾一位中繼（比賽頁要顯示「中繼 某某」；勝投因此給先發）。
- `game2.mjs`：4 局，我隊主場。安打＋失誤、趁傳進壘、場地二安、捕手妨礙、三振暴投上壘、捕逸後犧飛回來的分、
  代守、半局在打席中結束（跑者被牽制）、再見二安。對方投手點「不記」（存下的打席都不能有對方投手）。
- `game3.mjs`：2 局制、我隊客場，0：0 打進延長：3 上照卡片「放上跑者」（突破僵局，一、二壘）→ 跑者面板「投手犯規・全部進壘」→
  二安帶回兩分；3 下先換投（放上去的跑者跟著算新投手的）→ 放上跑者 → 我隊投手犯規 → 犧飛回來 1 分（非自責）→ 兩個三振，2：1。
  `check3.mjs` 核對：突破僵局跑者不算打席、那位投手 BF 3／R 1／ER 0、「投球」頁進階 BK 1、逐球有「突破僵局」「投手犯規」。
  先跑 game3 再跑 excel 的話，X7 也會拿這場的總表和網站比對。
- `practice.mjs`：練習紀錄（`/record?practice=1`）記 3 個打席再「結束練習」：這台裝置的正式進度、資料集都不能變，比賽頁不能出現 PRACTICE- 的比賽。
- `check1.mjs`／`check2.mjs`：正確答案（打者 PA AB R H 2B HR RBI BB SO SB；投手 IP BF PC 好球 K BB HBP H R ER ERA；局分表）。
- `edit1.mjs`：接在 game1 後面，在比賽頁「修改資料」改 5 個地方（失誤上壘改內安、表格補一顆壞球、投球逐球重按、
  我隊失誤改成安打、場地），存檔後和改過的正確答案比對（含用球數、自責分、守備失誤）。
- `excel.mjs`：接在 edit1（或 game1）後面，走一遍所有 Excel 的路：匯出備份 → 另一台電腦匯入、經過 LibreOffice 存檔再匯入、
  在檔案裡改兩格再匯入、合併（重複的比賽要略過）、照單場模板填一場（範例守備列沒刪要提醒），最後把 LibreOffice
  重算的「總表」和網站的打擊／投球／守備、比賽清單逐格比對（`sitestats.ts` 用網站的程式算網站的數字）。

```bash
cd web && SKIP_ARCHIVE=1 npm run build && npx vite preview --port 4173 &   # 本機模式（不要設 VITE_SUPABASE_URL）
# 在裝得到 playwright 的地方執行（例如暫存資料夾：npm i --no-save playwright）
node tools/gamesim/game1.mjs /tmp/out && node tools/gamesim/check1.mjs /tmp/out/game1-shown.json
node tools/gamesim/game2.mjs /tmp/out && node tools/gamesim/check2.mjs /tmp/out/game2-shown.json
node tools/gamesim/game3.mjs /tmp/out && node tools/gamesim/check3.mjs /tmp/out/game3-shown.json
node tools/gamesim/edit1.mjs /tmp/out && LANG=C.UTF-8 node tools/gamesim/excel.mjs /tmp/out   # excel 的 X3、X7 要有 soffice
node tools/gamesim/practice.mjs
```
`CHROMIUM=/path/to/chromium` 指定瀏覽器，`GAMESIM_URL` 指定網址。2026-10-08 第一次跑時找到：雙殺把 2 個出局算成 3 個、
換投後的出局算給前一任投手、代守時同一次失誤算給兩個人、捕手妨礙沒算成失誤（都已修正）。
2026-10-09 跑修改資料與 Excel 時找到：匯出的總表局數用舊公式（雙殺多算 1 個出局、換投後的出局算給前一任投手）、
守備 G 同場兩個守位算 2 場、代跑沒算出賽、球隊合計 G 是大家加總、捕手妨礙沒算對手失誤；範本若被另一版 openpyxl
重建，匯出會變成沒有資料的備份；合併重複的比賽時訊息寫錯；單場模板的範例守備列沒刪會被當成這場的失誤（都已修正）。
