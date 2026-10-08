# Supabase 設定（全隊共用雲端資料庫）

設定完成後：任何人打開網站都看到同一份最新資料（不用登入）；紀錄員登入後在「資料匯入」上傳總表，即寫入雲端，所有人的畫面即時更新。
沒有設定時網站維持本地模式（資料只在各自瀏覽器）。

## 1. 建立專案（約 3 分鐘）
1. 到 <https://supabase.com> 註冊，New project → 名稱 `bafinstat`，Region 選 **Northeast Asia (Tokyo)**，設定資料庫密碼（記下來但網站不會用到）。
2. 左側 **SQL Editor → New query**，把 `supabase/schema.sql` 全部貼上 → **Run**。會建立 5 張表、讀寫權限（RLS）與即時同步。

## 2. 取得金鑰
Project Settings → **API**：
- `Project URL` → `VITE_SUPABASE_URL`
- `anon public` key → `VITE_SUPABASE_ANON_KEY`

anon key 可以放在前端，因為資料表已開啟 RLS：未登入只能讀，登入才能寫。

## 3. 登入方式（紀錄員）
紀錄員由網站上的「紀錄員名單」管理：現有紀錄員新增對方的 email，拿到一組 10 碼邀請碼；對方在登入框選「第一次使用」，輸入 email、邀請碼並設定密碼。沒有邀請碼的帳號只能瀏覽。為此要設定：
- Authentication → Sign In / Providers → Email：打開 **Allow new users to sign up**、關閉 **Confirm email**、Minimum password length 設 **8**（「第一次使用」要能建立帳號；不用擔心陌生人註冊，沒有邀請碼寫不了任何東西）。
- 要用「快速登入」的話，同一頁再打開 **Allow anonymous sign-ins**（見 docs/SECURITY.md）。
- 還沒有任何紀錄員時（第一位）：Authentication → Users → **Add user → Create new user**（勾 Auto Confirm User），再到 SQL Editor 執行 `select admin_bind_editor('對方email','名字');`。
- Authentication → URL Configuration → Site URL 填網站網址，Redirect URLs 也加同一個網址。

登入流程：右上角登入 → 輸入 email 與密碼 → 就能紀錄與上傳。

## 4. 部署設定
### GitHub Pages
Repo → Settings → Secrets and variables → Actions → **Variables** 新增：
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

之後 push 到 `main`，workflow 會自動帶入並重新建置。

### 本機開發
```bash
cd web
cp .env.example .env.local   # 填入兩個值
npm run dev
```

## 5. 第一次匯入
1. 網站 → 資料匯入 → 右側「雲端資料庫」登入。
2. 拖入 `data/BAFIN_棒球數據總表.xlsx` → 「以此檔取代雲端全部資料」。
3. 之後每場比賽：在總表貼好新一場 → 上傳 → 「合併（略過重複的比賽ID）」，只會新增新的比賽。

## 資料模型
| 表 | 對應工作表 | 主鍵 |
|---|---|---|
| `players` | 球員名單 | `name` |
| `games` | 比賽清單 | `id`（比賽ID） |
| `batting_pa` | 打席紀錄 | `(game_id, seq)` |
| `pitching_pa` | 投球紀錄 | `(game_id, seq)` |
| `fielding_lines` | 守備紀錄 | `(game_id, seq)` |
| `record_drafts` | 網站「紀錄比賽」進行中的狀態：換裝置接續、公開的「即時比分」頁讀取（任何人可讀，登入者可寫） | `game_id` |
| `albums` | 相簿連結（每場比賽或活動的 Google Drive 資料夾） | `id` |
| `registrations` | 報名名單：某年某杯賽報名的球員（球員頁 →「報名名單」） | `(season, tournament)` |

`games.day_roster`（jsonb）是那場的**當日登錄名單**：先發（含棒次、守位）、板凳（到場未先發）、替補紀錄（代打／代跑／守備／換投）與「允許再上場」。由「先發陣容 → 紀錄比賽」自動存入，也可在比賽頁「修改資料 → 登錄名單」補登。

刪除 `games` 的一列會連帶刪掉該場所有打席（on delete cascade）。統計全部由網站計算，資料庫只存原始紀錄。

## 已建好的專案要補的表
後來加的，舊專案到 SQL Editor 各執行一次（重複執行安全）：
- `supabase/migrations/2026-09-10_record_drafts.sql`：換裝置接續逐球紀錄、即時比分頁。沒執行時紀錄頁仍能用，只是不能在另一台裝置接續。
- `supabase/migrations/2026-09-11_editors.sql`：**紀錄員名單**。執行後只有 `editors` 表裡的 email 能寫入；先把裡面的預設 email 改成你們的管理員。沒執行時維持「任何登入者都能寫」。
- `supabase/migrations/2026-09-12_albums_schedule.sql`：**相簿連結與賽程**。建立 `albums` 表（每場比賽或活動的 Google Drive 連結）並在 `games` 加 `status` 欄（預定／取消）。沒執行時相簿頁會提示尚未開通，賽程仍可用但「預定」狀態存不進雲端。
- `supabase/migrations/2026-09-26_rosters.sql`：**當日登錄名單與報名名單**。在 `games` 加 `day_roster` 欄（先發、板凳、替補紀錄、允許再上場），並建立 `registrations` 表（某年某杯賽的報名名單）。沒執行時比賽照常紀錄與儲存，只是登錄名單存不進雲端（存檔時會提醒）、比賽頁的「當日登錄名單」改由打席紀錄推定、球員頁的報名名單會提示尚未開通，先發陣容與紀錄比賽的候選名單則列出全隊。

## 誰能登入、誰能寫
- 帳號：紀錄員在網站「資料匯入 → 紀錄員名單」新增 email，對方用邀請碼在登入框的「第一次使用」設定密碼（第一位紀錄員見上面第 3 節）。
- 寫入權限：要在紀錄員名單上、而且用邀請碼啟用過的帳號才寫得進去；在名單按「移除」即刻失效。
- 網站側欄底部有「紀錄員登入」；登入且在名單內的人才看得到「紀錄比賽」「資料匯入」與比賽頁的「修改資料」。
- 更完整的制度見 `docs/SECURITY.md`。

## 常見問題
- **登入信沒收到**：檢查垃圾郵件；Supabase 免費方案每小時寄信有上限，或到 Authentication → Users 確認帳號存在。
- **點連結後回到網站但沒登入**：Redirect URLs 沒有加網站網址。
- **上傳顯示權限錯誤（row-level security）**：未登入，或 schema.sql 沒有執行成功。
- **想換成需要登入才能看**：把 `schema.sql` 裡的 `"public read"` policy 改成 `to authenticated`。
