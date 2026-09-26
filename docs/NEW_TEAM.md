# 幫另一隊開一個網站

所有球隊共用同一份程式碼：每隊一個網站、一個資料庫，差別只在「設定」。你推一次新版，每一隊的網站都會自動更新。

## 1. 各隊不同的設定（網站託管後台的環境變數）

沒填的一律沿用 BaFiN 的值，所以 BaFiN 自己的網站什麼都不用設。

| 變數 | 用途 | 範例 |
|---|---|---|
| `VITE_TEAM_NAME` | 隊名，要和比賽紀錄、Excel 裡寫的一模一樣（系統靠它分辨哪一隊是「我隊」） | `台大棒球` |
| `VITE_TEAM_ORG` | 側欄標題、加到手機主畫面的 App 名稱 | `國立臺灣大學棒球隊` |
| `VITE_TEAM_SHORT` | 側欄副標、瀏覽器分頁標題、主畫面圖示下的字 | `NTU Baseball` |
| `VITE_TEAM_MONOGRAM` | 沒有隊徽圖片時顯示的字母 | `N` |
| `VITE_TEAM_MARK` | 正方形隊徽（側欄、分頁圖示、主畫面圖示）：`web/public` 裡的檔名，或完整網址 | `teams/ntu/mark.png` |
| `VITE_TEAM_LOGO` | 使用指南頁的完整 logo：同上 | `teams/ntu/logo.png` |
| `VITE_TEAM_INNINGS` | 幾局制；ERA 換算與新比賽的預設局數 | `9` |
| `VITE_TEAM_SEED` | 填 `0`：網站從空白開始，**不帶 BaFiN 的比賽資料**（其他隊一定要填 `0`） | `0` |
| `VITE_TEAM_FILE_PREFIX` | 匯出備份的檔名開頭 | `NTUBB` |
| `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` | 這一隊自己的資料庫（見第 2 步） | — |

`VITE_TEAM_SEED=0` 時，BaFiN 的比賽紀錄在建置時就被整個拿掉，不會出現在對方網站的程式碼裡。

## 2. 開一隊的步驟（約 30 分鐘）

1. **資料庫**：Supabase 新增一個專案（地區選 Tokyo 或 Singapore）→ SQL Editor 貼上 `supabase/schema.sql` 全部執行 → 再依序執行 `supabase/migrations/` 裡的檔案。照 `docs/SUPABASE_SETUP.md` 關閉自行註冊、建紀錄員帳號（用 **Create new user** 設密碼，不要用 Invite）。
2. **隊徽**：把對方的圖放到 `web/public/teams/<隊代號>/mark.png`、`logo.png`，推上 GitHub。
3. **網站**：網站託管後台新增一個專案，接到**同一個** GitHub repo、同一條 `main`；建置指令 `npm run build`、根目錄 `web`、輸出 `dist`。填入第 1 步的環境變數。
   - 收費的球隊請用 Cloudflare Pages（免費且允許商業使用）；Vercel 免費方案不能商用。
4. **登入網址**：Supabase → Authentication → URL Configuration，把新網站網址加進 Redirect URLs。
5. 打開網站確認側欄隊名、局數；紀錄員登入後就能開始用。

## 3. 之後更新

- 改程式照常推上 GitHub，所有接在 `main` 的網站都會自動重新建置。
- 如果新功能要改資料庫（`supabase/migrations/` 多了新檔案），**每一隊的 Supabase 都要各執行一次**那個檔案。
- 某一隊專屬的功能，用新的 `VITE_TEAM_*` 設定當開關，不要另外複製一份程式碼。
