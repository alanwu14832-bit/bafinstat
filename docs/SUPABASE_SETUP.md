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
- `supabase/migrations/2026-09-13_practice.sql`：**練球點名**。在 `players` 加 `email` 欄（球員登入用），建立 `practice_series`（每週固定練球）、`practice_breaks`（停練期間）、`practices`（每一場）、`practice_votes`（會到／小遲／下次一定）、`practice_rollcall`（點名）、`push_subscriptions`（推播訂閱）與 `generate_practices()` 函式。球員只能讀寫自己的那一票（依登入信箱對到名單），紀錄員能改全部。沒執行時「練球」頁會提示尚未開通。
- `supabase/migrations/2026-09-14_player_accounts.sql`：**球員自己註冊**。把帳號與名單的對應搬到 `player_accounts`（只有本人和紀錄員讀得到），並把 `players` 的 `email` 欄移除——球員名單是公開資料，信箱不該跟著公開；先前填在名單上的信箱會自動搬過去。同時建立 `claim_player_name()`：球員註冊時選名單上的名字，資料庫會確認名字存在、還沒被別人註冊。**要開放註冊**：Authentication → Providers → Email 開啟 `Enable email signups`；若同時開著 `Confirm email`，球員註冊後要先點信裡的連結才會生效。

## 練球通知（推播，選做）
投票與點名執行完上面的 SQL 就能用；要讓手機在練球前一天 18:00 跳通知，再做這五步（約 20 分鐘，只做一次）。VAPID 是瀏覽器推播的身分驗證：通知由 Google／Apple 的推播伺服器轉送，這對金鑰用來證明通知是本站發的。公鑰放前端，私鑰放 Supabase，不用申請、不會過期。

1. **產生 VAPID 金鑰**（在自己的電腦算，金鑰不會外流）。有 Node 的話最快：
   ```
   npx web-push generate-vapid-keys
   ```
   沒有 Node 就用瀏覽器主控台。Chrome：F12 →  Console。Safari：先到 Safari → 設定 → 進階 → 勾「顯示網頁開發者功能選單」，再按 ⌥⌘C 開啟主控台。貼上這段按 Enter，會印出三行：
   ```js
   (async () => {
     const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
     const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
     console.log('public :', b64(await crypto.subtle.exportKey('raw', kp.publicKey)))
     console.log('private:', (await crypto.subtle.exportKey('jwk', kp.privateKey)).d)
     console.log('secret :', crypto.randomUUID())
   })()
   ```
   公鑰 87 字、私鑰 43 字，第三行的 secret 是步驟 2 要用的 `CRON_SECRET`。私鑰只貼進 Supabase，不要放進程式碼或聊天室。
2. **設定 Supabase Secrets**：Dashboard → Edge Functions → Secrets（或 Project Settings → Edge Functions），新增四筆：`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT`（填 `mailto:系隊信箱`）、`CRON_SECRET`。
3. **部署函式** `practice-notify`。後台若有 Edge Functions → Deploy a new function → Via Editor，直接把 `supabase/functions/practice-notify/index.ts` 的內容貼進去、函式名稱填 `practice-notify` 即可。沒有這個選項就用 CLI：
   ```
   supabase login
   supabase link --project-ref <你的 project ref>
   supabase functions deploy practice-notify
   ```
4. **網站端**：Vercel → Settings → Environment Variables 加 `VITE_VAPID_PUBLIC_KEY`＝公鑰，然後 Deployments → Redeploy（環境變數只在建置時讀取，不重新部署不會生效）。
5. **排程**：GitHub → Settings → Secrets and variables → Actions → New repository secret，名稱 `PRACTICE_CRON_SECRET`，值同步驟 2 的 `CRON_SECRET`；同一頁的 Variables 要有 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_ANON_KEY`。`.github/workflows/practice-notify.yml` 每天 18:00（台北）會呼叫函式，也可在 Actions 頁按 Run workflow 手動測試。

驗收：開網站 →「練球」頁按「開啟通知」→ 以紀錄員身分展開任一場練球按「現在就通知」，應立刻跳出通知。沒跳的話看 Supabase → Edge Functions → practice-notify → Logs。

各瀏覽器的差異：macOS Safari 16.1 以上、Chrome、Edge 直接在網頁按「開啟通知」就能用；iPhone 與 iPad 一定要先用 Safari「加入主畫面」，再從主畫面的圖示開啟才會出現按鈕（Apple 的限制）。macOS 若開著「專注模式」通知會被收進通知中心，測試時先關掉。

之後球員在「練球」頁按「開啟通知」即可。iPhone 必須先用 Safari「加入主畫面」再從主畫面開啟，才會出現「開啟通知」；Android／電腦 Chrome 直接可用。


## 誰能登入、誰能寫
- 帳號：紀錄員由管理員在 Authentication → Users → Add user 建立；球員自己在網站「練球」頁按「註冊」開帳號，所以 Providers → Email 的 **Enable email signups** 要開著。這不會有安全問題：註冊只能綁一個名單上的名字並回覆自己的練球，寫入比賽資料仍然只看 `editors` 表。
- 寫入權限：Table Editor → `editors` 新增那個 email；移除那一列即刻失效。
- 網站側欄底部有「紀錄員登入」；登入且在名單內的人才看得到「紀錄比賽」「資料匯入」與比賽頁的「修改資料」。
- 更完整的制度見 `docs/SECURITY.md`。

## 常見問題
- **登入信沒收到**：檢查垃圾郵件；Supabase 免費方案每小時寄信有上限，或到 Authentication → Users 確認帳號存在。
- **點連結後回到網站但沒登入**：Redirect URLs 沒有加網站網址。
- **上傳顯示權限錯誤（row-level security）**：未登入，或 schema.sql 沒有執行成功。
- **想換成需要登入才能看**：把 `schema.sql` 裡的 `"public read"` policy 改成 `to authenticated`。
