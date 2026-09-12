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
建議用**密碼登入**（不寄信、沒有每小時 2 封的限制）：Authentication → Users → **Add user → Create new user**，填 email 與密碼，勾 Auto Confirm User。網站的「密碼登入」就能用。

Email 連結登入為備用；Authentication → Providers → **Email** 保持開啟；建議：
- Authentication → Settings → 關閉 **Allow new users to sign up**（避免陌生人註冊後取得寫入權）。
- Authentication → Users → **Add user** 手動建立紀錄員帳號（填 email 即可，不用密碼）。
- Authentication → URL Configuration → Site URL 填網站網址（例如 `https://alanwu14832-bit.github.io/bafinstat/`），Redirect URLs 也加同一個網址。
- 可選：Authentication → Email Templates → Magic Link 內容加上 `{{ .Token }}`，網站的「6 位數驗證碼」欄位就能用，不必點信中連結。

登入流程：資料匯入頁 → 輸入 email → 收信點連結（或輸入驗證碼）→ 上傳總表 → 寫入雲端。

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

刪除 `games` 的一列會連帶刪掉該場所有打席（on delete cascade）。統計全部由網站計算，資料庫只存原始紀錄。

## 已建好的專案要補的表
後來加的兩個，舊專案到 SQL Editor 各執行一次（重複執行安全）：
- `supabase/migrations/2026-09-10_record_drafts.sql`：換裝置接續逐球紀錄、即時比分頁。沒執行時紀錄頁仍能用，只是不能在另一台裝置接續。
- `supabase/migrations/2026-09-11_editors.sql`：**紀錄員名單**。執行後只有 `editors` 表裡的 email 能寫入；先把裡面的預設 email 改成你們的管理員。沒執行時維持「任何登入者都能寫」。
- `supabase/migrations/2026-09-12_albums_schedule.sql`：**相簿連結與賽程**。建立 `albums` 表（每場比賽或活動的 Google Drive 連結）並在 `games` 加 `status` 欄（預定／取消）。沒執行時相簿頁會提示尚未開通，賽程仍可用但「預定」狀態存不進雲端。
- `supabase/migrations/2026-09-13_practice.sql`：**練球點名**。在 `players` 加 `email` 欄（球員登入用），建立 `practice_series`（每週固定練球）、`practice_breaks`（停練期間）、`practices`（每一場）、`practice_votes`（出席／小遲／請假）、`practice_rollcall`（點名）、`push_subscriptions`（推播訂閱）與 `generate_practices()` 函式。球員只能讀寫自己的那一票（依登入信箱對到名單），紀錄員能改全部。沒執行時「練球」頁會提示尚未開通。

## 練球通知（推播，選做）
投票與點名執行完上面的 SQL 就能用；要讓手機在練球前一天 18:00 跳通知，再做這四步（約 15 分鐘，只做一次）：

1. **產生 VAPID 金鑰**：在任何有 Node 的電腦執行 `npx web-push generate-vapid-keys`，得到 Public Key 與 Private Key。
2. **部署函式**：安裝 Supabase CLI 後在專案根目錄執行
   ```
   supabase login
   supabase link --project-ref <你的 project ref>
   supabase secrets set CRON_SECRET=<自訂一串長密碼> VAPID_PUBLIC_KEY=<公鑰> VAPID_PRIVATE_KEY=<私鑰> VAPID_SUBJECT=mailto:<系隊信箱>
   supabase functions deploy practice-notify
   ```
3. **網站端**：Vercel → Settings → Environment Variables 加 `VITE_VAPID_PUBLIC_KEY`＝公鑰，重新部署。
4. **排程**：GitHub → Settings → Secrets and variables → Actions → New repository secret，名稱 `PRACTICE_CRON_SECRET`，值同上面的 `CRON_SECRET`。`.github/workflows/practice-notify.yml` 每天 18:00（台北）會呼叫函式；也可到 Actions 頁手動 Run workflow 測試。

之後球員在「練球」頁按「開啟通知」即可。iPhone 必須先用 Safari「加入主畫面」再從主畫面開啟，才會出現「開啟通知」；Android／電腦 Chrome 直接可用。


## 誰能登入、誰能寫
- 帳號：Authentication → Users → Add user（設 email 與密碼）。若不用練球投票，關閉 Providers → Email 的 **Enable email signups** 避免任何人自行註冊；有用練球投票則可開著，因為登入本身拿不到任何寫入權限（只有 `editors` 名單能寫比賽資料，球員只能改自己的一票）。
- 寫入權限：Table Editor → `editors` 新增那個 email；移除那一列即刻失效。
- 網站側欄底部有「紀錄員登入」；登入且在名單內的人才看得到「紀錄比賽」「資料匯入」與比賽頁的「修改資料」。
- 更完整的制度見 `docs/SECURITY.md`。

## 常見問題
- **登入信沒收到**：檢查垃圾郵件；Supabase 免費方案每小時寄信有上限，或到 Authentication → Users 確認帳號存在。
- **點連結後回到網站但沒登入**：Redirect URLs 沒有加網站網址。
- **上傳顯示權限錯誤（row-level security）**：未登入，或 schema.sql 沒有執行成功。
- **想換成需要登入才能看**：把 `schema.sql` 裡的 `"public read"` policy 改成 `to authenticated`。
