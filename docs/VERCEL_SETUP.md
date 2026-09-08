# 部署到 Vercel

網站是純靜態的 Vite 專案，Vercel 免費方案即可；資料庫仍在 Supabase，不受影響。

## 1. 匯入專案（一次）
1. <https://vercel.com> 用 GitHub 登入 → **Add New… → Project** → 選 `bafinstat` → Import。
2. 設定：
   - **Root Directory**：點 Edit，選 `web`。
   - **Framework Preset**：Vite（會自動偵測）。
   - Build Command / Output Directory 保持預設（`npm run build` / `dist`，`web/vercel.json` 已寫好）。
3. **Environment Variables** 新增兩個（Production、Preview 都勾）：
   - `VITE_SUPABASE_URL` = Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon key
4. Deploy。約 1 分鐘後得到網址，例如 `https://bafinstat.vercel.app`。

之後每次 push 到 `main` 自動重新部署；其他分支或 PR 會得到預覽網址。

## 2. Supabase 端要補的設定
Authentication → URL Configuration：
- Site URL 改成 Vercel 網址（或保留 GitHub Pages 皆可）。
- Redirect URLs 加上 `https://<你的專案>.vercel.app/**`（若之後綁自訂網域，也加上）。
用密碼登入的話這步不影響，但 Email 連結登入需要。

## 3. 自訂網域（選用）
Vercel → Project → Settings → Domains → Add，照指示在網域商加 CNAME。Supabase Redirect URLs 也加上該網域。

## 注意
- GitHub Pages 與 Vercel 可以並存；`vite.config.ts` 的 `base` 由 `VITE_BASE` 決定，Vercel 不設定即為 `/`，GitHub Pages 的 workflow 會設成 `/bafinstat/`。
- 「下載總表範本」連結：`npm run build` 前會自動把 `data/BAFIN_棒球數據總表.xlsx` 複製到 `public/`（`web/scripts/prebuild.mjs`）。Vercel 的 Root Directory 設為 `web` 時仍能讀到上層的 `data/`（預設開啟「Include source files outside of the Root Directory」）。
- 深層連結（例如 `/import`）由 `web/vercel.json` 的 rewrite 處理，不需要 GitHub Pages 那套 404 轉址。
