# 維運手冊：把網站開放給全隊（約 80 人）之後

這份是給「管網站的人」看的，一頁就夠。資安細節在 `docs/SECURITY.md`，Supabase 設定在 `docs/SUPABASE_SETUP.md`。

## 0. 先搞清楚：這個站由三個免費服務組成

| 服務 | 負責什麼 | 誰登入 | 帳號建議 |
|---|---|---|---|
| **GitHub**（`alanwu14832-bit/bafinstat`） | 程式碼與 Excel 總表；合併 PR 就等於「發布新版」 | 管理員 | 隊上共用 Gmail 當 owner，個人帳號當 collaborator |
| **Vercel** | 把網頁放上網（`bafinstat.vercel.app`）；GitHub `main` 一有變動就自動重新部署 | 管理員 | 同一個共用 Gmail |
| **Supabase** | 資料庫（比賽、打席、名單）與紀錄員登入 | 管理員（後台）、紀錄員（網站登入） | 同一個共用 Gmail |

三個服務都用**隊上共用的 Gmail**（例如 `baseball.ntuba@gmail.com`）註冊，不要綁在某個人的個人帳號上。交接時只要交出這個信箱和密碼（放在隊長才看得到的密碼管理器），不用搬家。

## 1. 三種角色

| 角色 | 人數 | 能做什麼 | 要做什麼 |
|---|---|---|---|
| **看數據的隊員** | 約 80 | 開網址就能看所有頁面，不用帳號 | 什麼都不用做 |
| **紀錄員** | 2–4 | 登入後：紀錄比賽、先發陣容、賽程（在「比賽」頁）、資料匯入、修改比賽、編輯名單、相簿連結 | 賽後把當場記完、看一眼「可疑打席」；把攝影師給的相簿連結貼上 |
| **攝影師** | 1–3 | 不用網站帳號：把照片放進自己的 Google Drive，開連結分享 | 賽後把資料夾連結丟給紀錄員 |
| **管理員** | 1（＋1 備援） | 上面全部，加上 Supabase／Vercel／GitHub 後台 | 加減紀錄員、每月備份、每學期交接 |

紀錄員不需要懂程式；管理員也不需要，只要會照這份手冊點後台。

## 2. 加一個紀錄員（約 2 分鐘）

1. Supabase → **Authentication → Users → Add user → Create new user**，填對方的 Email 和一組密碼，勾 **Auto Confirm User**，把密碼私訊給對方。（不要用 Invite user：Supabase 內建的寄信服務只寄給 Supabase 專案團隊的成員，每小時最多 2 封，紀錄員收不到邀請信。）
2. Supabase → **Table Editor → `editors`** → Insert row，`email` 填同一個信箱。
3. 請對方到網站左下角登入。登入後側欄會多出「先發陣容／紀錄比賽／資料匯入」。

移除：`editors` 刪掉那一列即可（他的帳號留著也寫不了資料）；離隊就順便在 Authentication → Users 刪掉。

攝影師不需要帳號。做法：攝影師用自己的 Google 帳號在 Drive 建「2026-03-01 vs 群風」這類資料夾，右鍵 → 共用 → 一般存取權改成「知道連結的使用者：檢視者」，把連結傳給紀錄員；紀錄員到「相簿」頁「新增相簿連結」選那場比賽貼上。想集中管理的話，系隊 Gmail 建一個「球隊照片」資料夾，把攝影師的個人帳號加為「編輯者」，他們就能直接往裡面傳；上傳的檔案佔攝影師自己的 Drive 空間。

## 3. 賽季中的固定節奏

**每場比賽**（紀錄員）
- 賽前 5 分鐘：「先發陣容」排好 → 帶到紀錄比賽。
- 賽中：逐球記，手機關掉也沒關係，重開網頁會接續；換手機在「紀錄比賽」頁按「接續」。
- 賽後：按「結束比賽」填勝敗投。到「比賽」頁點這場，「可疑打席」要是 0；不是就按「修改資料」改掉。

**每週**（管理員，1 分鐘）
- 開網站首頁看得到最新一場就好。開不了 → 看第 6 節。

**每月**（管理員，3 分鐘）
- 「資料匯入 → 匯出備份 (.xlsx)」下載一份，丟到隊上 Google Drive 的 `數據備份/` 資料夾，檔名已含日期。這是唯一的備份，免費方案沒有自動備份。

**每學期**（管理員，10 分鐘）
- 檢查 `editors` 名單：畢業的移除，新紀錄員加上。
- 「球員 → 編輯名單」：離隊的改狀態、新人用「匯入 Excel」一次加。
- Supabase → Settings → Usage 看一眼 Database size 與 Egress（正常各在 5% 以下）。照片不經過網站，所以相簿不佔任何流量。
- GitHub 若有 Dependabot 的安全更新 PR，合併它，Vercel 會自動重新部署。

## 4. 每年交接（新任隊長／管理員）

1. 交出共用 Gmail 的帳密與 Supabase 後台的 2FA 備援碼。
2. 新管理員用該 Gmail 登入 GitHub、Vercel、Supabase 各一次確認都進得去。
3. 把上一任的個人帳號從 GitHub collaborators 與 Supabase 組織移除。
4. 用「加一個紀錄員」流程換掉紀錄員名單。
5. 把這份手冊的連結貼在隊上群組公告。

## 5. 改網站怎麼改

- 所有改動都走 GitHub：在 Claude Code 描述需求 → 它在開發分支上改好並推上去 → GitHub Actions（`.github/workflows/auto-deploy.yml`）自動跑測試與建置 → 通過就合併進 `main` → Vercel 約 1 分鐘後上線。**不用手動開 PR**。
- 測試沒過就不會合併，網站維持原樣；到 GitHub → Actions 看那次紅色的紀錄就知道卡在哪。
- 想改回「先看過再上線」：GitHub → Actions → 左邊選「測試通過就自動上線」→ 右上 ⋯ → Disable workflow。
- 出問題想退回：Vercel → Deployments → 找上一個正常的版本 → **Promote to Production**，10 秒退回，不用改程式。
- 資料庫結構有變動時（很少見），Claude 會附一個 `supabase/migrations/*.sql`，到 Supabase → SQL Editor 貼上執行一次。

### 公版 Excel 跟著網站更新

- 公版是 `data/BAFIN_棒球數據總表.xlsx`，由 `tools/build_workbook.py` 產生；網站每次建置會自動把它放到「下載總表範本」的連結。
- 網站的「匯出備份」多了哪個欄位或工作表，公版也要有。自動測試（`web/src/data/template.test.ts`）會比對兩邊，少了就測試失敗、網站不會上線，並寫出缺哪一欄。
- 修正方式：在 `tools/build_workbook.py` 加上那一欄，執行 `python3 tools/build_workbook.py`（Windows 用 `py tools\build_workbook.py`），一起推上去。請 Claude 改功能時，它會一併處理。

### Windows

- 每次推送，`.github/workflows/windows-check.yml` 會在真的 Windows 電腦上安裝、跑測試、建置、產生公版，並用 Edge 打開每一頁檢查錯誤與畫面溢出；GitHub → Actions → 「Windows 相容性檢查」看結果，截圖在該次執行的 Artifacts。這個檢查不影響上線。
- 公版只用 Excel 2007 以後都有的函數（SUMIFS、COUNTIFS、IFERROR、INDEX/MATCH），Windows 的 Excel 2010 以後都能開。

## 6. 壞了怎麼辦

| 症狀 | 原因 | 處理 |
|---|---|---|
| 網站打得開但數據是「示範」或空的、右上角「雲端失敗」 | Supabase 免費專案 **7 天沒人用會自動暫停**（休賽期最常見） | Supabase 後台 → 該專案 → **Restore project**，約 1 分鐘。這個 repo 有 `.github/workflows/keepalive.yml` 每 3 天自動戳一次資料庫防止暫停；只要 GitHub 的 Actions 沒被關掉就不會發生。注意：公開 repo **60 天沒有任何 commit**，GitHub 會自動停用排程 workflow（暑假最容易碰到）；到 GitHub → Actions → Keep Supabase awake 按 **Enable workflow** 即可 |
| 紀錄員登入後看不到「紀錄比賽」 | 信箱不在 `editors` 表，或大小寫不同 | 到 `editors` 表核對，信箱一律小寫 |
| 匯錯資料、一場記了兩次 | — | 「比賽」頁點那場 → 右上角垃圾桶刪除；或「資料匯入」選「以此檔取代雲端全部資料」用上個月的備份整份還原 |
| 某個人的名字有兩種寫法、數據被拆開 | 打字不一致 | 「球員 → 編輯名單」把其中一個改名成另一個，所有紀錄會自動合併 |
| 網站整個打不開（404 或空白） | Vercel 部署失敗 | Vercel → Deployments 看最新一筆是否 Error；Promote 上一版；把錯誤訊息貼給 Claude |
| 出現「Rate limit」或 Supabase 顯示流量超過 | 極不可能（見 SECURITY.md 第 6 節） | 升級 Supabase Pro（每月 25 美元）即解決，順便得到每日自動備份 |

## 7. 花費

全部免費方案就夠 80 人用：Vercel Hobby、Supabase Free、GitHub Free。唯一值得考慮花的錢是 Supabase Pro（每月 25 美元）換自動備份與不會暫停；如果隊費允許，賽季中開、休賽期關。

## 8. 告訴隊員的話（可直接貼群組）

> 系棒數據網站：https://bafinstat.vercel.app
> 手機直接開就能看，不用登入。每場比賽結束當天更新。左上角可以切換淺色／深色，數據名稱滑過去會有解釋。有發現數字怪怪的，直接在群組說一聲，紀錄員會改。
