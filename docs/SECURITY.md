# 資安制度、流量與網域

適用對象：管理員（Supabase／Vercel／GitHub 有權限的人）與紀錄員。這份文件講三件事：資料怎麼被保護、誰能做什麼、流量大了怎麼辦。

## 1. 現在的防護怎麼運作

| 層 | 機制 | 說明 |
|---|---|---|
| 網站 | Vercel 靜態託管、HTTPS 強制 | 沒有自己的伺服器，沒有可以被打的後端程式；憑證由 Vercel 自動更新 |
| 資料庫 | Supabase Postgres + Row Level Security（RLS） | 每一張表都開 RLS：**任何人可讀**、**只有 `editors` 名單內且登入的帳號可寫** |
| 金鑰 | 前端只有 anon key | anon key 本來就是公開的，它的權限完全由 RLS 決定；`service_role` key 永遠不放前端、不進 git |
| 登入 | Supabase Auth（密碼或 Email 連結，PKCE） | 帳號由管理員在後台建立；不開放自行註冊 |
| 寫入路徑 | 網站「紀錄比賽」「資料匯入」「修改資料」 | 三條路徑都走同一個 `saveGame`／`pushCloudDataset`，都受 RLS 檢查；就算有人繞過網站直接打 API，沒有 editors 身分一樣寫不進去 |
| 紀錄 | `games.updated_by`、`record_drafts.updated_by` | 知道最後是誰改的 |

前端把「紀錄比賽」「資料匯入」「修改資料」藏起來只是介面上的方便，**真正的防線是 RLS**。

## 2. 管理員要做的設定（一次）

1. **執行 `supabase/migrations/2026-09-11_editors.sql`**（SQL Editor）。它會建立 `editors` 表、把寫入權限從「任何登入者」收緊為「名單內的人」，並在 `games` 加 `updated_by`。裡面預設放了 `baseball.ntuba@gmail.com`，請改成實際的管理員 email。
2. **關閉自行註冊**：Supabase → Authentication → Providers → Email → 把 **Enable email signups** 關掉（只留 Enable email provider）。這樣沒有人能自己開帳號。
3. **密碼強度**：Authentication → Policies（或 Settings）→ 最短長度設 12，開啟「Leaked password protection」。
4. **Redirect URLs** 只留自己的網址（Vercel 網址、自訂網域）；不要留萬用字元到別人的網域。
5. **GitHub**：repo 設為 private；`.env.local` 在 `.gitignore`（已設定）；Vercel 環境變數只放 anon key。
6. **Supabase 後台帳號**開兩步驟驗證（Account → Security → MFA）。後台帳號才是真正的最高權限。

## 3. 人員與權限制度

| 角色 | 能做什麼 | 怎麼給 | 怎麼收 |
|---|---|---|---|
| 瀏覽者（全隊、家長） | 看所有頁面、即時比分 | 不用做任何事 | — |
| 球員（登入） | 上述全部 + 回覆練球會到／小遲／下次一定、開練球通知 | 名單的 Email 欄填他的信箱；他自己用信箱登入 | 名單刪掉信箱即不能投票；帳號留著也寫不了任何比賽資料 |
| 紀錄員 | 紀錄比賽、上傳、修改、刪除比賽 | 管理員在 Authentication → Users 建帳號（Add user → 設 email 與密碼）＋ 在 Table Editor → `editors` 新增同一個 email | 從 `editors` 刪掉那一列即刻失效；帳號可保留或刪除 |
| 管理員 | 上述全部 + Supabase／Vercel／GitHub 後台 | 邀請進 Supabase 組織（Organization → Members） | 每學期檢查一次成員名單，畢業或卸任立刻移除 |

建議：紀錄員 2 到 4 人；管理員至少 2 人，避免一人畢業後沒人能進後台。交接時換管理員 email、重設共用帳號密碼。

## 4. 例行工作

| 頻率 | 事項 |
|---|---|
| 每場賽後 | 比賽頁的「記錄檢查」為 0 個可疑打席再收工 |
| 每月 | 「資料匯入 → 匯出備份 (.xlsx)」下載一份放到隊上共用雲端；GitHub `data/` 內的 JSON 也是一份備份 |
| 每學期 | 檢查 `editors` 名單與 Supabase 組織成員；升級 npm 套件（`npm audit`、Dependabot） |
| 有人離隊 | 從 `editors` 移除；若那個人知道共用密碼，重設密碼 |
| 懷疑外洩 | Supabase → Settings → API → **Reset** anon key，並更新 Vercel 環境變數；檢查 `games.updated_by` 找出異常修改，用備份還原 |

免費方案沒有自動備份與時間點還原（PITR）。如果資料變得重要，升級 Supabase Pro（每月 25 美元）就有每日備份與 7 天 PITR，這是最值得花的一筆。

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
