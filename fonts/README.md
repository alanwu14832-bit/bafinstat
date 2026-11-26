# 字型（網站從 jsDelivr 讀取，不在 web/ 裡）

- `HanWangYanKai.woff2` — 王漢宗顏楷體繁（HanWangYanKai，原檔 `wt064.ttf`，13,970 字），王漢宗教授捐出、以 GNU GPL v2
  釋出的自由字型（授權全文：`LICENSE-HanWang-GPL-2.0.txt`）。只把原本的 TrueType 檔轉成 WOFF2，字形沒有修改。
  來源：王漢宗自由字型（wangfonts）的公開備份 https://github.com/rschiang/wangfonts
- 用在限時動態的海報模板與先發陣容 IG 貼文的中文字（`web/src/lib/storyFonts.ts`）。網站用 jsDelivr 讀取這個資料夾裡
  固定版本的檔案（`cdn.jsdelivr.net/gh/alanwu14832-bit/bafinstat@<commit>/fonts/...`），所以字型不會放進每次上線的
  網站檔案和保存版本裡。換字型檔時要更新程式裡的 commit。
