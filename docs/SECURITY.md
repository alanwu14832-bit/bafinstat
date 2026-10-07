# 資安制度、流量與網域

適用對象：管理員（Supabase／Vercel／GitHub 有權限的人）與紀錄員。這份文件講三件事：資料怎麼被保護、誰能做什麼、流量大了怎麼辦。

## 1. 現在的防護怎麼運作

**威脅模型**：資料本身是公開的（比賽成績任何人都能看），要保護的是「寫入權」與「紀錄員的帳號」。最嚴重的情境是：有人取得寫入權後竄改或刪光資料、或把自己加成紀錄員。

| 層 | 機制 | 說明 |
|---|---|---|
| 網站 | Vercel 靜態託管、HTTPS、安全標頭 | 沒有自己的伺服器；`vercel.json` 加了禁止被別的網站嵌入（防點擊劫持）、HSTS、nosniff、Referrer／Permissions-Policy |
| 腳本 | Content-Security-Policy（`index.html` 的 meta，`src/config/security.ts` 產生） | 只執行本站自己的程式（禁止內嵌與注入的腳本、禁止 eval）；資料只能送往本站與自己的 Supabase 專案 |
| 資料庫 | Supabase Postgres + Row Level Security | **任何人可讀**；**只有「已綁定的紀錄員帳號」可寫**（`is_editor()` 比對登入帳號本身，不只是 email） |
| 帳號綁定 | `supabase/migrations/2026-10-08_security.sql` | 名單上的 email 要「綁定」到一個登入帳號才能寫：管理員綁定或一次性**邀請碼**（網站已不提供 Email 驗證碼登入）。光是用某人的 email 註冊帳號，什麼都寫不了 |
| 邀請碼 | 10 碼、7 天有效、只存雜湊值 | 輸錯 10 次鎖住；用過即失效；紀錄員自己也讀不到雜湊值 |
| 金鑰 | 前端只有 anon（publishable）key | 權限完全由 RLS 決定；匿名角色另外被收回所有寫入權（雙重保險）；`service_role` key 永遠不放前端、不進 git（已掃過整個 git 歷史，沒有外洩） |
| 個資 | 公開表格不存 email | `updated_by`／`created_by` 由資料庫自動填紀錄員的備註名稱（例如「管理員」），舊資料裡的 email 已被換掉 |
| 稽核 | `audit_log`（只有紀錄員讀得到） | 比賽、球員、報名名單、相簿、紀錄員名單的每次新增／修改／刪除：時間、帳號、哪一筆；刪除會保留整列內容，可以手動救回 |
| 資料上限 | 資料庫 check constraint | 相簿連結必須是 http(s)（擋掉 `javascript:` 連結）；備註、逐球、進行中紀錄有大小上限，防止被灌爆 |
| 備份 | GitHub Actions「每日備份資料」 | 每天存一份全部資料（JSON），保留 30 天 |
| 套件 | `npm audit` 0 個漏洞 | Excel 套件升級到 SheetJS 0.20.3（修掉原型污染與 ReDoS 兩個高風險漏洞） |

前端把「紀錄比賽」「資料匯入」「修改資料」藏起來只是介面上的方便，**真正的防線是資料庫的 RLS 與帳號綁定**：就算有人繞過網站直接打 API，也寫不進去。

## 2. 管理員要做的設定（一次）

1. **執行 `supabase/migrations/2026-10-08_security.sql`**（SQL Editor 全部貼上 → Run）。最後會列出紀錄員名單：`bound_via` 是 `existing` 的，是「這次自動綁定的舊帳號」，請確認每一個都是本人；不是的話在 Table Editor → `editors` 把那列的 `user_id` 清空。
2. **關閉自行註冊**：Authentication → Sign In / Providers → 關閉 **Allow new users to sign up**（帳號都由管理員建立）。
3. **密碼**：Authentication → Sign In / Providers → Email：Minimum password length 設 **8 以上**；有 Pro 方案的話開 **Leaked password protection**。
4. **URL Configuration**：Site URL 與 Redirect URLs 只留自己的網址（`https://bafinstat.vercel.app` 與自訂網域），不要有萬用字元。
5. **Advisors → Security Advisor**：按一次 Refresh，應該沒有紅色項目；有的話把畫面給 Claude 看。
6. **兩步驟驗證**：Supabase、Vercel、GitHub、共用 Gmail 全部開 2FA。後台帳號才是真正的最高權限。
7. **GitHub Actions 變數**：repo → Settings → Secrets and variables → Actions → Variables 要有 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`（每日備份與保持清醒會用）。

## 3. 人員與權限制度

| 角色 | 能做什麼 | 怎麼給 | 怎麼收 |
|---|---|---|---|
| 瀏覽者（全隊、家長） | 看所有頁面、即時比分 | 不用做任何事 | — |
| 紀錄員 | 紀錄比賽、上傳、修改、刪除比賽 | ① Authentication → Users → **Add user**（email＋密碼、勾 Auto Confirm）② SQL Editor：`select admin_bind_editor('對方email', '名字');` | Table Editor → `editors` 刪掉那一列，立即失效 |
| 管理員 | 上述全部 + Supabase／Vercel／GitHub 後台 | 邀請進 Supabase 組織（Organization → Members） | 每學期檢查成員，畢業或卸任立刻移除 |

- **忘記密碼／換帳號**：Authentication → Users 找到他 → 刪除帳號（紀錄員權限會自動解除綁定）→ 重新 Add user → 再跑一次 `admin_bind_editor`。
- 也可以給邀請碼而不是自己設密碼：`select admin_issue_editor_code('對方email');` 會回傳一組 10 碼，對方用任何方式登入後，在「資料匯入」輸入邀請碼並設定自己的密碼即可（7 天內有效）。
- 建議：紀錄員 2 到 4 人；管理員至少 2 人，避免一人畢業後沒人能進後台。

## 4. 例行工作與事件處理

| 頻率／情境 | 事項 |
|---|---|
| 每場賽後 | 比賽頁的「記錄檢查」為 0 個可疑打席再收工 |
| 每月 | GitHub → Actions → 每日備份資料，確認是綠勾；另外「資料匯入 → 匯出備份（總表格式）」存一份到隊上雲端 |
| 每學期 | 檢查 `editors` 名單、Supabase 組織成員；請 Claude 跑一次 `npm audit` 與套件更新 |
| 有人離隊 | 從 `editors` 移除；他知道的共用密碼全部重設 |
| **懷疑帳號被盜／資料被改** | ① 從 `editors` 刪掉可疑帳號（立即失去寫入權）② Table Editor → `audit_log` 依時間看是誰改了什麼 ③ 用每日備份還原（把備份檔交給 Claude）④ 必要時 Settings → API 重設 anon key，並更新 Vercel 與 GitHub 變數 |

免費方案沒有 Supabase 自己的自動備份與時間點還原（PITR），所以每日備份很重要。資料變得重要時，升級 Supabase Pro（每月 25 美元）就有每日備份與 7 天 PITR。

## 5. 個資

球員姓名與背號是個資。原則：只放比賽相關資料（姓名、背號、守位、成績），不放電話、學號、生日；新隊員入隊時告知資料會公開在隊上網站；有人要求下架就從球員名單移除並重傳。

## 6. 很多人同時使用會不會掛？

架構上這個站很難被「用到掛」，原因：

- **網頁本身是靜態檔**，由 Vercel 的 CDN 發送，幾千人同時開也只是 CDN 的日常。
- **統計在瀏覽器裡算**，資料庫只負責交出原始打席資料，沒有重的查詢。
- **資料量很小**：一場約 60 列，一季 30 場約 2,000 列，整份資料不到 1 MB；每個瀏覽器載入一次後快取在本機，之後只在有變動時重抓。
- **即時比分頁用 5 秒輪詢**、不用長連線，100 個人同時看是每秒 20 個小查詢，遠低於 Supabase 的限制。

免費方案的邊界：資料庫 500 MB（夠用很多年）、每月流量 5 GB（約 5,000 次完整載入）、同時 200 條 Realtime 連線（每個開著網站的分頁佔一條）。如果比賽日常常超過 150 人同時開著網站，或每月完整載入超過 4,000 次，就升 Pro：8 GB、250 GB 流量、500 條連線，加上前面提到的備份。

已經做的減負措施：本機快取、只抓變動、輪詢只在分頁可見時進行、Realtime 只訂閱變更事件。若未來單季超過 200 場（很難），再把資料改成按賽季分批載入。

## 7. 需要自訂網域嗎？

不需要也能安全運作：`bafinstat.vercel.app` 已有 HTTPS，功能與安全性和自訂網域完全相同。

值得買的情況：想印在海報、社群簡介上；不想被 Vercel 的網址綁住（未來換託管商網址不變）；想要 `@` 網域的信箱。費用約每年 NT$300 到 600（`.tw`、`.com`、`.app`）。

設定只要三步：在 Cloudflare、Gandi 或 Namecheap 買網域 → Vercel → Project → Settings → Domains 新增並照指示加 CNAME → Supabase → Authentication → URL Configuration 的 Redirect URLs 補上新網域。建議先用 vercel.app 跑一季，確定要長期用再買。
