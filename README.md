# BAFIN Stats — 喝FIN就好BA 棒球數據平台

從「一場一張的單場紀錄表」升級成「全時期資料庫 + 篩選總表 + 網站儀表板」。

| 交付 | 位置 | 說明 |
|---|---|---|
| **Excel 總表** | `data/BAFIN_棒球數據總表.xlsx` | 總表（杯賽／日期／守位／對手／主客／勝敗 篩選）、三張紀錄表、單場模板、數據字典；已轉入 2025-10-10 vs 群風 |
| **網站儀表板** | `web/` | React 儀表板：總覽、打擊、投球、守備、球員、比賽、資料匯入、數據字典；可上傳總表 |
| **數據研究** | `docs/ANALYTICS_RESEARCH.md` | MLB Statcast 2024–2026、CPBL 官方紀錄與 Trackman、差距分析、建議新增欄位、公式附錄 |
| **設計藍圖** | `docs/BLUEPRINT.md` | 資訊架構、色彩／字體、版面、圖表規格、建置順序 |
| **數據字典** | `data/stat_dictionary.json` | 103 項指標的單一定義來源（Excel 與網站共用） |

## 快速開始

### 紀錄一場比賽（Excel）
1. `比賽清單` 新增一列（比賽ID 例：`G20251010-01`）。
2. 複製 `單場-摘要`、`單場-打擊`、`單場-投球` 三張模板，在 `單場-摘要!C2` 填同一個比賽ID，照原本習慣逐球記錄。
3. 賽後把單場工作表的列 **貼上值** 到 `打席紀錄`／`投球紀錄`／`守備紀錄`。`總表` 立即更新。

黃底＝輸入、灰色標題＝公式、藍字＝參數（`設定` 工作表：每場局數、FIP 常數、wOBA 權重、下拉清單）。

### 網站
```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm test           # 統計引擎測試（以 10/10 比賽驗證）
npm run build      # 產出 dist/
npm run build:single   # 單檔版 dist-single/index.html
```
到「資料匯入」上傳整個總表（或一份填好的單場模板檔）即可；資料只存在瀏覽器 localStorage。

### 重新產生總表
```bash
python3 tools/build_workbook.py            # 需要 openpyxl
```
產出檔會同時更新 `data/stat_dictionary.json` 與 `data/schema.json`。

## 部署
`main` 分支 push 後由 `.github/workflows/deploy.yml` 建置並發佈到 GitHub Pages（Settings → Pages → Source 選 GitHub Actions）。

## 目錄
```
data/    總表、種子資料（原紀錄表轉入）、字典、欄位 schema
docs/    研究報告、設計藍圖
tools/   總表產生器、數據字典來源
web/     Vite + React + TypeScript 儀表板
```
