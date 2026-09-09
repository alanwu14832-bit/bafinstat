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
| `record_drafts` | 網站「紀錄比賽」進行中的狀態（換裝置接續用，只有登入者能讀寫） | `game_id` |

刪除 `games` 的一列會連帶刪掉該場所有打席（on delete cascade）。統計全部由網站計算，資料庫只存原始紀錄。

## 已建好的專案要補的表
`record_drafts`（換裝置接續逐球紀錄）是後來加的。舊專案到 SQL Editor 執行 `supabase/migrations/2026-09-10_record_drafts.sql` 一次即可；沒執行時紀錄頁仍能用，只是不能在另一台裝置接續。

## 常見問題
- **登入信沒收到**：檢查垃圾郵件；Supabase 免費方案每小時寄信有上限，或到 Authentication → Users 確認帳號存在。
- **點連結後回到網站但沒登入**：Redirect URLs 沒有加網站網址。
- **上傳顯示權限錯誤（row-level security）**：未登入，或 schema.sql 沒有執行成功。
- **想換成需要登入才能看**：把 `schema.sql` 裡的 `"public read"` policy 改成 `to authenticated`。
