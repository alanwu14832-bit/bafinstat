# 棒球數據指標研究：MLB Statcast、CPBL 官方紀錄與業餘記錄表升級建議

> 研究日期：2026-09-08。對象：本隊（社會組／大學層級，紙本＋手機紀錄）現行記錄表。
> 目的：盤點 2024–2026 年 MLB / CPBL 主流指標，找出以「一位記錄員、逐球手記」就能算出的指標，並提出記錄表應新增的欄位。
> 標記說明：✅ 可由手動紀錄直接取得｜⚠️ 可用人工近似（定義與職棒不同，僅供隊內比較）｜❌ 需追蹤設備（Trackman / Hawk-Eye 等），手動無法取得。

---

## 一、研究來源與日期

以下為本次實際搜尋／擷取（fetch）過的來源，全部於 2026-09-08 讀取。

### MLB / Statcast / 賽伯計量
- [MLB.com：New Statcast metrics measure swing path, attack angle, attack direction（2025-05）](https://www.mlb.com/news/new-statcast-swing-metrics-2025)（搜尋摘要）
- [FanGraphs：Test Driving Statcast's Newest Bat Tracking Metrics（2025-05-21）](https://blogs.fangraphs.com/test-driving-statcasts-newest-bat-tracking-metrics/)
- [FanGraphs：Statcast Bat Tracking Metrics Are Now on FanGraphs（2026-03-06）](https://blogs.fangraphs.com/instagraphs/statcast-bat-tracking-metrics-are-now-on-fangraphs/)
- [Baseball Savant：Swing Path / Attack Angle 排行榜（含名詞定義）](https://baseballsavant.mlb.com/leaderboard/bat-tracking/swing-path-attack-angle)
- [Baseball Savant：Bat Tracking 排行榜（含名詞定義）](https://baseballsavant.mlb.com/leaderboard/bat-tracking)
- [Baseball Savant：Swing Timing + Miss Distance 排行榜（2026-06-09 新增）](https://baseballsavant.mlb.com/leaderboard/bat-tracking/swing-timing-miss-distance)
- [Baseball Savant：Changelog（2026-04 至 2026-08 更新）](https://baseballsavant.mlb.com/changelog)
- [Baseball Savant：2025-03-11 Batted Ball Profile / Run Value 更新](https://baseballsavant.mlb.com/changelog/2025-03-11-batted-ball-profile-run-value)
- [Baseball Savant：2025-08-15 Catcher Framing / FRV 更新](https://baseballsavant.mlb.com/changelog/2025-08-15-catcher-framing-frv)
- [Baseball Savant：ABS Challenges 排行榜（2026）](https://baseballsavant.mlb.com/leaderboard/abs-challenges?gameType=regular&year=2026&challengeType=team-summary&level=mlb&minChal=1&minOppChal=0)
- [MLB.com：Matt Olson among leaders in new first base scoops stat（2026-08）](https://www.mlb.com/news/matt-olson-among-leaders-in-new-first-base-scoops-stat)（搜尋摘要）
- [MLB.com：Baseball Savant releases Game Strategy Explorer（2026-04）](https://www.mlb.com/news/baseball-savant-releases-game-strategy-explorer)（搜尋摘要）
- [MLB Glossary：Squared-up Rate](https://www.mlb.com/glossary/statcast/squared-up)、[Blasts](https://www.mlb.com/glossary/statcast/bat-tracking-blasts)、[Ideal Attack Angle](https://www.mlb.com/glossary/statcast/ideal-attack-angle)、[Barrel](https://www.mlb.com/glossary/statcast/barrel)、[Hard-hit Rate](https://www.mlb.com/glossary/statcast/hard-hit-rate)、[Sprint Speed](https://www.mlb.com/glossary/statcast/sprint-speed)、[Outs Above Average](https://www.mlb.com/glossary/statcast/outs-above-average)、[Hold](https://www.mlb.com/glossary/standard-stats/hold)、[Caught Stealing %](https://www.mlb.com/glossary/standard-stats/caught-stealing-percentage)、[Pythagorean Winning %](https://www.mlb.com/glossary/advanced-stats/pythagorean-winning-percentage)
- [MLB 新聞稿：ABS Challenge System coming to the Major Leagues beginning in 2026（2025-09-23）](https://www.mlb.com/press-release/press-release-mlb-announces-abs-challenge-system-coming-to-the-major-leagues-beginning-in-the-2026-season)
- [Bleacher Report：MLB Teams' ABS Challenge Success Rate Stats（2026 開季後）](https://bleacherreport.com/articles/25422872-mlb-teams-abs-challenge-success-rate-stats-revealed-after-opening-month-2026-season)、[MLB.com：Players, teams that have been successful at ABS challenges](https://www.mlb.com/news/how-to-know-who-is-good-at-using-abs-2026-mlb)（搜尋摘要）
- [NBC：MLB Rule Changes for 2026](https://www.nbc.com/nbc-insider/mlb-rule-changes-for-2026-baseball-season-everything-to-know)（搜尋摘要）
- [FanGraphs Guts! 常數表（2023–2026）](https://www.fangraphs.com/tools/guts)
- [FanGraphs Library：wOBA](https://library.fangraphs.com/offense/woba/)、[wRC / wRC+](https://library.fangraphs.com/offense/wrc/)、[FIP](https://library.fangraphs.com/pitching/fip/)、[xFIP](https://library.fangraphs.com/pitching/xfip/)、[SIERA](https://library.fangraphs.com/pitching/siera/)、[LOB%](https://library.fangraphs.com/pitching/lob/)、[Plate Discipline](https://library.fangraphs.com/offense/plate-discipline/)、[BsR](https://library.fangraphs.com/offense/bsr/)、[DRS](https://library.fangraphs.com/defense/drs/)
- [Pitcher List：CSW Rate 介紹](https://pitcherlist.com/csw-rate-an-intro-to-an-important-new-metric/)、[Pitcher List 名詞表](https://pitcherlist.com/baseball-stats-glossary/)
- [Baseball-Reference Blog：What does XBT% really tell us?](https://www.baseball-reference.com/blog/archives/10867.html)（搜尋摘要）、[Cooperstown Cred 名詞表](https://www.cooperstowncred.com/statistics-glossary/)
- [Wikipedia：First-pitch strike](https://en.wikipedia.org/wiki/First-pitch_strike)
- [Baseball Prospectus：Assessing Productive Outs（2004-11-23）](https://www.baseballprospectus.com/news/article/3634/assessing-productive-outs-little-things-mean-a-little/)、[ESPN Olney：Productive Outs](https://www.espn.com/mlb/columns/story?columnist=olney_buster&id=1670649)（搜尋摘要）
- [GameChanger：Quality At-Bats 說明](https://gamechanger.zendesk.com/hc/en-us/articles/214493703-Quality-At-Bats-)（搜尋摘要）、[Rizzler Sports：Quality At-Bat 定義](https://rizzlersports.com/stats/batting/quality-at-bat)

### CPBL（中華職棒）
- [CPBL 官網 單項排行榜（2025 年，Wayback 存檔）](https://www.cpbl.com.tw/stats/toplist)
- [CPBL 官網 成績看板 Box Score 欄位（Wayback 存檔）](https://cpbl.com.tw/box)
- [CPBL 官網 球員個人頁：打擊／投球／守備成績欄位（2024 Wayback 存檔）](https://www.cpbl.com.tw/team/person?Acnt=0000002285)、[球隊團隊成績（2025 Wayback 存檔）](https://www.cpbl.com.tw/team/teamscore?ClubNo=ACN)
- [中華職棒進階數據（stats.cpbl.com.tw）首頁](https://stats.cpbl.com.tw/)、[排行榜](https://stats.cpbl.com.tw/rankings)
- [Yahoo 運動：CPBL 攜手 Trackman 打造全新進階數據平台 官方網站正式上線試營運（2026-05-04）](https://tw.sports.yahoo.com/news/%E4%B8%AD%E8%8F%AF%E8%81%B7%E6%A3%92%E3%80%8Bcpbl%E6%94%9C%E6%89%8Btrackman%E6%89%93%E9%80%A0%E5%85%A8%E6%96%B0%E9%80%B2%E9%9A%8E%E6%95%B8%E6%93%9A%E5%B9%B3%E5%8F%B0-%E5%AE%98%E6%96%B9%E7%B6%B2%E7%AB%99%E6%AD%A3%E5%BC%8F%E4%B8%8A%E7%B7%9A%E8%A9%A6%E7%87%9F%E9%81%8B-100207852.html)、[聯合新聞網同題報導](https://udn.com/news/story/7001/9481185)
- [Yahoo 運動：中職好球帶改革進行式 ABS 挑戰制度上路前仍有考題（2026-06-05）](https://tw.sports.yahoo.com/news/%E4%B8%AD%E8%8F%AF%E8%81%B7%E6%A3%92%E3%80%8B%E4%B8%AD%E8%81%B7%E5%A5%BD%E7%90%83%E5%B8%B6%E6%94%B9%E9%9D%A9%E9%80%B2%E8%A1%8C%E5%BC%8F-abs%E6%8C%91%E6%88%B0%E5%88%B6%E5%BA%A6%E4%B8%8A%E8%B7%AF%E5%89%8D%E4%BB%8D%E6%9C%89%E8%80%83%E9%A1%8C%E3%80%90%E5%91%82%E6%AC%8A%E7%B4%98%E5%B0%88%E6%AC%84%E3%80%91-113000719.html)
- [Yahoo 運動：ABS 進入實戰測試階段 中信兄弟、味全龍二軍賽事先行試辦（2026-07-20）](https://tw.sports.yahoo.com/news/%E4%B8%AD%E8%8F%AF%E8%81%B7%E6%A3%92%E3%80%8Babs%E9%80%B2%E5%85%A5%E5%AF%A6%E6%88%B0%E6%B8%AC%E8%A9%A6%E9%9A%8E%E6%AE%B5-%E4%B8%AD%E4%BF%A1%E5%85%84%E5%BC%9F%E3%80%81%E5%91%B3%E5%85%A8%E9%BE%8D%E4%BA%8C%E8%BB%8D%E8%B3%BD%E4%BA%8B%E5%85%88%E8%A1%8C%E8%A9%A6%E8%BE%A6-133204513.html)、[自由體育：中職 ABS 電子好球帶 明年上路目標未變（2026-07-21）](https://sports.ltn.com.tw/news/paper/1763519)
- [東森新聞：中職 2026 新規出爐 投球計時再縮短、牽制減至 2 次（2026-03-24）](https://news.ebc.net.tw/news/sport/543623)
- [運動視界：中華職棒記錄專用表簡介－下篇（中繼／救援／自責分／團隊 RISP）](https://www.sportsv.net/articles/53124)、[新編版．如何看數據－其之二：打者數據篇（2020-08-31）](https://www.sportsv.net/articles/10188)、[其之四：守備數據篇（2020-08-31）](https://www.sportsv.net/articles/10666)（皆 Wayback 存檔）
- [三立新聞：優質先發不同聯盟價值不同 中職定義有延伸（2019-05-01）](https://www.setn.com/News.aspx?NewsID=535184)
- [維基百科：中繼成功（含中職定義）](https://zh.wikipedia.org/zh-tw/%E4%B8%AD%E7%B9%BC%E6%88%90%E5%8A%9F)
- [GitHub ldkrsi/cpbl-opendata（中職官網爬蟲，README 記載 BS 於 2005–2021 公開後移除）](https://github.com/ldkrsi/cpbl-opendata)

> 無法直接讀取的頁面：cpbl.com.tw 即時頁（回傳 406／連線重設）、台灣棒球維基館（Anubis 防爬）；CPBL 官方資料以 Wayback Machine 2024–2025 存檔為準，並於文中標明。

---

## 二、MLB / Statcast 最新指標總覽

### 2-1. 2024–2026 年新增的 Statcast 指標（揮棒追蹤與其他）

| 指標 | 英文 | 定義／公式 | 需要什麼資料 | 手動可否 |
|---|---|---|---|---|
| 揮棒速度 | Bat Speed | 球棒「甜蜜點」（距棒頭約 6 吋）於觸球瞬間的速度；球員季平均取其最快 90% 揮棒。2024-05 推出，資料回溯至 2023 明星賽後。[Savant](https://baseballsavant.mlb.com/leaderboard/bat-tracking) | Hawk-Eye 揮棒追蹤 | ❌ |
| 快速揮棒率 | Fast-swing Rate | 揮棒速度 ≥ 75 mph 的揮棒比例。[Savant](https://baseballsavant.mlb.com/leaderboard/bat-tracking) | 同上 | ❌ |
| 揮棒長度 | Swing Length | 棒頭從追蹤起點到觸球點在 XYZ 空間移動的總距離（呎），MLB 平均約 7.3 呎。 | 同上 | ❌ |
| 擊中率／方正擊球率 | Squared-up Rate | 實際擊球初速 ÷ 依揮棒速度與球速可得的最大初速；≥ 80% 即算「squared-up」。[MLB Glossary](https://www.mlb.com/glossary/statcast/squared-up) | 同上＋擊球初速 | ❌（可用「強/中/弱」粗略近似，見 ⚠️ Hard%） |
| 爆擊 | Blasts | squared-up% × 100 ＋ 揮棒速度 ≥ 164（兩者平均 ≥ 82）。2024 年 10% 競爭性揮棒、27% 擊球為 blast；blast 打擊率 .563／長打率 1.182。[MLB Glossary](https://www.mlb.com/glossary/statcast/bat-tracking-blasts) | 同上 | ❌ |
| 劍揮 | Swords | 投手讓打者做出「非競爭性、難看揮棒」的次數。 | 同上 | ❌ |
| 揮棒平面傾角 | Swing Path (Tilt) | 觸球前 40 ms 內棒頭軌跡所成平面相對地面的角度；高＝陡、低＝平。2025-05-21 推出。[Savant](https://baseballsavant.mlb.com/leaderboard/bat-tracking/swing-path-attack-angle) | 同上 | ❌ |
| 攻擊角 | Attack Angle | 觸球瞬間甜蜜點行進的垂直角度。 | 同上 | ❌ |
| 理想攻擊角率 | Ideal Attack Angle Rate | 攻擊角落在 5°–20° 的競爭性揮棒比例（2024 例：Bregman 69%、Schwarber 67%）。[MLB Glossary](https://www.mlb.com/glossary/statcast/ideal-attack-angle) | 同上 | ❌ |
| 攻擊方向 | Attack Direction | 觸球瞬間甜蜜點行進的水平角度（PULL／OPPO）。 | 同上 | ⚠️（只能用落點 1–9 推 Pull/Oppo，非同一物理量） |
| 揮棒時機 / 揮空距離 | Swing Timing & Miss Distance | 2026-06-09 新排行榜：以「水平（Tied-up/Centered ±4 吋/Flail）、時間（Late/On-time ±7 ms/Early）、垂直（Over/Lined-up ±2 吋/Under）」三維分類每次揮棒；揮空距離為球與棒上半部的最近距離（吋）。[Savant](https://baseballsavant.mlb.com/leaderboard/bat-tracking/swing-timing-miss-distance) | 同上 | ❌ |
| 打擊站位／截擊點 | Batting Stance / Intercept Point | 站位深度、開放角度與球棒攔截球的位置（2025 春季推出）。 | 同上 | ❌ |
| 投手出手角度 | Arm Angle | 出手時肩膀到球的連線相對地面角度，0°＝側投、90°＝正上肩；Savant 排行榜資料自 2020 起。[Savant](https://baseballsavant.mlb.com/leaderboard/pitcher-arm-angles?season=2024&min=300&sort=descending) | 球員姿態追蹤 | ❌（教練可肉眼分類「上肩/四分之三/側投」） |
| 擊球型態剖面 | Batted Ball Profile（含 Pulled Air-ball%） | 2025-03-11 新增，含「拉打飛球率」；同日將打擊／投球 Run Value 預設改為情境中立值。[Changelog](https://baseballsavant.mlb.com/changelog/2025-03-11-batted-ball-profile-run-value) | 擊球初速/仰角/方向 | ⚠️（軌跡 G/F/L ＋ 落點可近似） |
| 捕手接球／守備分數 | Catcher Framing、Fielding Run Value（FRV） | 2025-08-15 更新：逐球好球機率計算 framing；FRV 新增內野雙殺分項與球隊層級加總。[Changelog](https://baseballsavant.mlb.com/changelog/2025-08-15-catcher-framing-frv) | 進壘點追蹤 | ❌ |
| 一壘手接球 OAA | First Base Receiving / Scoops | 2026-08-19 新排行榜：依傳球位置（On Target/High/Low/Wide/Scoops/Bounces）、跑者速度算一壘手把內野傳球轉成出局的機率差；資料回溯 2021。[MLB.com](https://www.mlb.com/news/matt-olson-among-leaders-in-new-first-base-scoops-stat) | 追蹤 | ⚠️（可手記「一壘手撿球成功/失敗」次數） |
| 比賽策略探索器 | Game Strategy Explorer | 2026-04-17 工具：依 2016–2025 十季資料查任一局面之勝率（WP）與得分期望值（RE）。[MLB.com](https://www.mlb.com/news/baseball-savant-releases-game-strategy-explorer) | 歷史逐打席資料 | ⚠️（可借用 MLB 的 24 種壘上/出局 RE 表做隊內近似） |
| 球員比較工具、百分位篩選 | Player Comparison Tool | 2026-07-20 推出，最多 9 名球員並列比較 Statcast 百分位。[Changelog](https://baseballsavant.mlb.com/changelog) | — | — |
| ABS 挑戰數據 | ABS Challenges | 2026 年起 Savant 提供挑戰率（challengeable pitch 中提出挑戰之比例）、成功率、期望挑戰、淨得分等。[Savant](https://baseballsavant.mlb.com/leaderboard/abs-challenges?gameType=regular&year=2026&challengeType=team-summary&level=mlb&minChal=1&minOppChal=0) | Hawk-Eye | ❌（業餘無此制度） |

> 補充：FanGraphs 於 2026-03-06 起將 Bat Speed、Swing Length、FastSw%、SqUpCon%/SqUpSw%、BlastCon%/BlastSw%、Swing Path/Tilt、AtkAng、AtkDir、IdealAtkAng% 納入球員頁與排行榜。[FanGraphs](https://blogs.fangraphs.com/instagraphs/statcast-bat-tracking-metrics-are-now-on-fangraphs/)

### 2-2. 既有 Statcast 追蹤指標

| 指標 | 英文 | 定義／公式 | 需要什麼資料 | 手動可否 |
|---|---|---|---|---|
| 擊球初速 | Exit Velocity (EV) | 球離棒速度（mph）。 | 雷達/光學 | ❌ |
| 擊球仰角 | Launch Angle (LA) | 球離棒的垂直角度；甜蜜點 Sweet Spot = 8°–32°。 | 同上 | ⚠️（G/F/L 三分類是最粗近似） |
| 強勁擊球率 | Hard-hit% | 初速 ≥ 95 mph 之擊球比例（2018：hard-hit .524 AVG / 1.047 SLG）。[MLB Glossary](https://www.mlb.com/glossary/statcast/hard-hit-rate) | 同上 | ⚠️（「強」擊球比例） |
| 桶擊率 | Barrel% | 初速 ≥ 98 mph 且仰角 26–30°（初速每高 1 mph 區間擴大）之擊球比例；定義門檻為歷史同類擊球 ≥ .500 AVG／1.500 SLG。[MLB Glossary](https://www.mlb.com/glossary/statcast/barrel) | 同上 | ⚠️（「強」且 L/F） |
| 預期指標 | xBA / xSLG / xwOBA | 依初速、仰角（部分加跑速）比對 2015 起同類擊球的結果機率。 | 同上 | ❌ |
| 揮空率 | Whiff% | 揮空 ÷ 揮棒。 | 逐球 | ✅ |
| 追打率 | Chase Rate（O-Swing%） | 對好球帶外球的揮棒 ÷ 好球帶外球數。 | 需逐球「進壘點在帶內/帶外」 | ⚠️（記錄員判定，主觀） |
| 衝刺速度 | Sprint Speed | 最快 1 秒視窗內每秒英呎；聯盟平均 27 ft/s；≥ 30 ft/s 稱 Bolt。[MLB Glossary](https://www.mlb.com/glossary/statcast/sprint-speed) | 球員追蹤 | ⚠️（可用碼錶量本壘到一壘時間） |
| 守備出局值 | Outs Above Average (OAA) | 依接球機率（距離、時間、方向）每球給 ± 分；2020 起擴及內野。[MLB Glossary](https://www.mlb.com/glossary/statcast/outs-above-average) | 追蹤 | ❌ |
| 捕手傳球時間 | Pop Time | 球進捕手手套到目標野手接球的時間。 | 追蹤 | ⚠️（碼錶） |

### 2-3. 已成熟的賽伯計量指標

| 指標 | 英文 | 定義／公式 | 需要什麼資料 | 手動可否 |
|---|---|---|---|---|
| 加權上壘率 | wOBA | 線性權重加權的上壘率，見附錄 6-2（2025 權重：wBB .691、wHBP .722、w1B .882、w2B 1.252、w3B 1.584、wHR 2.037）。[FanGraphs Guts](https://www.fangraphs.com/tools/guts) | PA 結果 | ✅（權重借用 MLB） |
| 加權得分創造 | wRC+ | 依 wOBA 換算 wRAA，再校正球場與聯盟，100 為平均。[FanGraphs](https://library.fangraphs.com/offense/wrc/) | 需聯盟平均 | ⚠️（以隊內或聯賽全體為「聯盟」） |
| 純長打率 | ISO | SLG − AVG。 | PA 結果 | ✅ |
| 場內球安打率 | BABIP | (H − HR) ÷ (AB − K − HR + SF)。 | PA 結果 | ✅ |
| 三振率／保送率 | K% / BB% | SO ÷ PA；BB ÷ PA。 | PA 結果 | ✅ |
| 獨立防禦率 | FIP | (13·HR + 3·(BB+HBP) − 2·K) ÷ IP ＋ 常數（2025 cFIP 3.135）。[FanGraphs](https://library.fangraphs.com/pitching/fip/) | 投手基本項 | ✅ |
| 預期 FIP | xFIP | 以「飛球數 × 聯盟 HR/FB」取代實際 HR。[FanGraphs](https://library.fangraphs.com/pitching/xfip/) | 需飛球數＋聯盟 HR/FB | ⚠️ |
| 技能互動 ERA | SIERA | 以 K、BB、GB、FB 比例的非線性迴歸估計；FanGraphs 未直接列公式（指向 Swartz 原文）。[FanGraphs](https://library.fangraphs.com/pitching/siera/) | 同上＋係數 | ⚠️（樣本太小不建議） |
| 好球＋揮空率 | CSW% | (Called Strikes + Whiffs) ÷ 總球數，Pitcher List 2018 年提出；不含界外球。[Pitcher List](https://pitcherlist.com/csw-rate-an-intro-to-an-important-new-metric/) | 逐球 | ✅ |
| 首球好球率 | F-Strike% | 第一球為好球的 PA ÷ PA；MLB 平均約 59%。[FanGraphs](https://library.fangraphs.com/offense/plate-discipline/) | 逐球 | ✅ |
| 揮空好球率 | SwStr% | 揮空 ÷ 總球數；MLB 平均約 9.5%。 | 逐球 | ✅ |
| 守備失分節省 | DRS | Sports Info Solutions 依打球位置/難度給分，換算成失分。[FanGraphs](https://library.fangraphs.com/defense/drs/) | 逐球打球位置 | ❌ |
| 勝利機率增值 | WPA | 每一打席前後勝率變化的累加。 | 勝率表 | ⚠️（可套 MLB 表） |
| 24 種局面得分增值 | RE24 | 打席前後「壘上/出局數」得分期望值差。 | RE 表＋壘上/出局 | ⚠️（需新增「壘上(前)」欄；RE 表借 MLB） |
| 殘壘率 | LOB% | (H+BB+HBP−R) ÷ (H+BB+HBP−1.4·HR)；MLB 平均約 70–72%。[FanGraphs](https://library.fangraphs.com/pitching/lob/) | 投手基本項 | ✅ |
| 畢氏期望勝率 | Pythagorean W% | RS^x ÷ (RS^x + RA^x)，Baseball-Reference 採 x = 1.83。[MLB Glossary](https://www.mlb.com/glossary/advanced-stats/pythagorean-winning-percentage) | 得失分 | ✅ |
| 跑壘綜合值 | BsR（wSB + UBR + wGDP） | 盜壘、推進額外壘、避免雙殺的得分價值。[FanGraphs](https://library.fangraphs.com/offense/bsr/) | 逐打席跑壘 | ⚠️ |
| 額外進壘率 | XBT% | 一安上三壘或二安回本壘等「多推進一個壘」的機會把握率。[Baseball-Reference](https://www.baseball-reference.com/blog/archives/10867.html) | 逐打席跑者推進 | ✅（需新增跑者推進欄） |

### 2-4. 2025–2026 規則／資料環境變化（與記錄有關者）

- **MLB ABS 挑戰制（2026 起全部例行賽／季後賽）**：每隊每場 2 次挑戰，成功者保留；僅投手、捕手、打者可於判決後立即拍帽/頭盔提出，不得受教練協助；延長賽開局若無挑戰次數則補 1 次。好球帶為本壘板中點的二維長方形，寬 17 吋，上緣 = 打者身高 53.5%、下緣 = 27%；12 台 Hawk-Eye 攝影機，全程約 15 秒。2025 春訓每場約 4 次挑戰、成功率近 50%（捕手 56%、打者 50%、投手 41%）。[MLB 新聞稿 2025-09-23](https://www.mlb.com/press-release/press-release-mlb-announces-abs-challenge-system-coming-to-the-major-leagues-beginning-in-the-2026-season) 2026 例行賽至 8 月初已逾 7,000 次挑戰、約 53% 被推翻。[Bleacher Report](https://bleacherreport.com/articles/25422872-mlb-teams-abs-challenge-success-rate-stats-revealed-after-opening-month-2026-season)
- 2026 年 MLB 另新增一、三壘指導教練須留在指導區內的規定；投球計時維持 2024 版。[NBC](https://www.nbc.com/nbc-insider/mlb-rule-changes-for-2026-baseball-season-everything-to-know)（搜尋摘要）
- 對業餘記錄的意義：ABS 讓「進壘點」與「好球帶」資料成為公開常態；本隊若加記「進壘點九宮格」，未來即可比較「追打率」概念，但仍屬記錄員主觀判定（⚠️）。

---

## 三、CPBL 官方紀錄項目總覽

### 3-1. 官網（cpbl.com.tw）球員頁與 Box Score 欄位

依 2024 年球員個人頁（Wayback 存檔）與 2025 年 Box Score 模板整理。

| 類別 | 指標（官網欄位名） | 英文 | 定義／公式 | 需要什麼資料 | 手動可否 |
|---|---|---|---|---|---|
| 打擊 | 出賽數、打席、打數、打點、得分、安打、一安、二安、三安、全壘打、壘打數、被三振、盜壘、盜壘刺 | G, PA, AB, RBI, R, H, 1B, 2B, 3B, HR, TB, SO, SB, CS | 標準計數項 | PA 結果 | ✅ |
| 打擊 | 上壘率、長打率、打擊率、整體攻擊指數 | OBP, SLG, AVG, OPS | 見附錄 | PA 結果 | ✅ |
| 打擊 | 雙殺打、犧短、犧飛、四壞（故四）、死球 | GIDP, SH, SF, BB (IBB), HBP | 官網把故意四壞以括號列於四壞旁 | PA 結果需區分犧短/犧飛、雙殺打、故四 | ✅（需新增代碼） |
| 打擊 | 滾地出局、高飛出局、滾飛出局比 | GO, FO, GO/AO | GO ÷ AO | 出局的軌跡 G/F | ✅（現有 G/F/L 即可） |
| 打擊 | 盜壘率 | SB% | SB ÷ (SB+CS) | 需 CS | ✅（需新增「盜壘刺」） |
| 打擊 | 銀棒指數（團隊成績頁） | — | 官網自訂綜合指數，公式未公開 | — | ❌（不必仿製） |
| 打擊 | 得點圈打擊率 | AVG w/ RISP | 得點圈安打 ÷ 得點圈打數。**未出現在 2024 個人頁欄位**；2019 年記錄組文章指出「團隊 RISP 在聯盟記錄表上並未記載，需人工運算」。[運動視界](https://www.sportsv.net/articles/53124) | 打席前壘上狀態 | ✅（需新增「壘上(前)」） |
| 投球 | 出賽數、先發、後援、完投、完封、無四死球、勝場、敗場 | G, GS, GR, CG, SHO, —, W, L | 標準項 | 比賽層級 | ✅ |
| 投球 | 救援成功、救援失敗、中繼成功 | SV, BS, HLD | 中職中繼定義：救援情境登板至少 1 出局；平手登板至少 2 出局且退場未失分；領先時登板允許失分但扣除責失後仍領先；勝投/中繼/救援互斥。[維基百科](https://zh.wikipedia.org/zh-tw/%E4%B8%AD%E7%B9%BC%E6%88%90%E5%8A%9F)、[運動視界](https://www.sportsv.net/articles/53124)。BS 於 2005–2021 公開後自公開數據移除。[cpbl-opendata](https://github.com/ldkrsi/cpbl-opendata) | 比賽層級＋進場時比分 | ✅（需新增投手進退場比分） |
| 投球 | 投球局數、每局被上壘率、防禦率、面對打席、總投球數 | IP, WHIP, ERA, BF, NP | ERA 以 9 局計 | 投手基本項 | ✅ |
| 投球 | 被安打、被全壘打、四壞（故四）、死球、奪三振、暴投、投手犯規、失分、自責分 | H, HR, BB(IBB), HBP, K, WP, BK, R, ER | 標準項 | 需新增 WP、BK | ✅ |
| 投球 | 滾地出局、高飛出局、滾飛出局比 | GO, AO, GO/AO | 同打擊 | 軌跡 | ✅ |
| 投球 | Box Score 另列「好球數」 | Strikes | 好球數 ÷ 投球數 = 好球率 | 逐球 | ✅ |
| 投球 | 優質先發 | QS | MLB：≥6 IP 且 ER ≤ 3；中職媒體慣例另將「8 局失 4 分」也視為 QS（2019 報導），官網個人頁未列此欄。[三立](https://www.setn.com/News.aspx?NewsID=535184) | 比賽層級 | ✅ |
| 守備 | 守備位置、出賽數、守備機會、刺殺、助殺、失誤、雙殺、三殺、守備率 | POS, G, TC, PO, A, E, DP, TP, FPCT | 守備率 = (PO+A) ÷ (PO+A+E)，為官網唯一的個人守備率化指標。[運動視界](https://www.sportsv.net/articles/10666) | 逐球守備歸屬 | ✅（需新增 PO/A/E 歸屬） |
| 守備 | 捕逸、盜壘阻殺率、牽制 | PB, CS%, PK | **未在 2024 球員個人頁的守備表中列出**（本次僅能確認上述 9 欄）；聯盟內部記錄表有捕逸與牽制項，但公開頁面無法驗證 | 逐球事件 | ✅（隊內自行記錄） |
| 排行榜 | 官網「單項排行榜」2025 年顯示：防禦率、勝投、救援成功、中繼成功、奪三振、打擊率、安打數、全壘打、打點、盜壘成功 | ERA, W, SV, HLD, SO, AVG, H, HR, RBI, SB | [CPBL 單項排行榜](https://www.cpbl.com.tw/stats/toplist) | — | ✅ |

### 3-2. CPBL 進階數據平台（stats.cpbl.com.tw，Trackman）

- **上線**：2026-05-04 正式上線試營運；由聯盟、六球團與國科會、運動部、野球革命（Rebas）合作，整合六球團主場 Trackman 雷達資料；第二階段將於轉播同步呈現逐球軌跡。[Yahoo 運動](https://tw.sports.yahoo.com/news/%E4%B8%AD%E8%8F%AF%E8%81%B7%E6%A3%92%E3%80%8Bcpbl%E6%94%9C%E6%89%8Btrackman%E6%89%93%E9%80%A0%E5%85%A8%E6%96%B0%E9%80%B2%E9%9A%8E%E6%95%B8%E6%93%9A%E5%B9%B3%E5%8F%B0-%E5%AE%98%E6%96%B9%E7%B6%B2%E7%AB%99%E6%AD%A3%E5%BC%8F%E4%B8%8A%E7%B7%9A%E8%A9%A6%E7%87%9F%E9%81%8B-100207852.html)、[聯合新聞網](https://udn.com/news/story/7001/9481185)
- **Trackman 佈建**：一軍天母、新莊、洲際、台南亞太、澄清湖、樂天桃園、台北大巨蛋，二軍青埔、中信公益園區、斗六、皇鷹學院共 11 座球場。[Yahoo 運動 2026-06-05](https://tw.sports.yahoo.com/news/%E4%B8%AD%E8%8F%AF%E8%81%B7%E6%A3%92%E3%80%8B%E4%B8%AD%E8%81%B7%E5%A5%BD%E7%90%83%E5%B8%B6%E6%94%B9%E9%9D%A9%E9%80%B2%E8%A1%8C%E5%BC%8F-abs%E6%8C%91%E6%88%B0%E5%88%B6%E5%BA%A6%E4%B8%8A%E8%B7%AF%E5%89%8D%E4%BB%8D%E6%9C%89%E8%80%83%E9%A1%8C%E3%80%90%E5%91%82%E6%AC%8A%E7%B4%98%E5%B0%88%E6%AC%84%E3%80%91-113000719.html)

| 平台公開指標（中文欄名） | 對應英文 | 手動可否 |
|---|---|---|
| 擊球初速 AVG / MAX、最遠擊球距離、擊球初速×仰角、擊球彈道（3D） | EV avg/max, Max distance, EV×LA | ❌ |
| 最佳攻擊仰角、出色擊球（Barrels）、強擊球%、平飛球% | Sweet-spot / Barrel%, Hard-hit%, LD% | ⚠️（LD% 可用軌跡 L 近似） |
| 飛球%、高飛球%、高飛必死球%、滾地球比例 | FB%, high FB%, Pop-up%, GB% | ⚠️（軌跡 G/F/L；可加 P 記高飛必死球） |
| 拉打%、中線%、推打%（依飛球/平飛/滾地分開） | Pull% / Center% / Oppo% | ✅（落點 1–9 ＋ 慣用手） |
| 加權上壘率、對戰加權上壘率、百分位 | wOBA, wOBA against, percentile | ✅ |
| 揮空%、追打%、三振%、保送%、本壘板紀律 | Whiff%, Chase%, K%, BB%, plate discipline | ✅／⚠️（追打需帶內外判定） |
| 轉速、有效轉速、球種×球速轉速、投球進壘位置、轉軸、出手位置 | Spin, active spin, pitch type/velo, location, axis, release | ❌（球速可用測速槍） |
| 篩選：年度、一/二軍、月份、球場、球種、對戰球隊、慣用手、守備位置、最低擊球數 | Splits | ✅（記錄表需保留這些維度） |

### 3-3. CPBL 2026–2027 規則與 ABS 進度

- **2026 新規（2026-01-26 領隊會議通過、3-24 公告）**：投球計時壘上無人 20→18 秒、有人 25→23 秒；同一打席牽制（含假動作）3→2 次；換投熱身 90 秒；暫停一律 40 秒；換局 2 分鐘（捕手為前半局最後打者/跑者或首位打者時 2 分 20 秒）；兩出局封殺局面直接跑過二壘判違規出局。[東森新聞](https://news.ebc.net.tw/news/sport/543623)
- **ABS 挑戰制**：採 Trackman；2026-07-21 於斗六中信兄弟 vs 味全龍二軍賽首度實戰測試（規則比照 MLB：每隊 2 次、成功保留、僅投/捕/打可提、延長補 1 次；測試期挑戰結果不改判）；2026 明星賽會長示範；目標 2027 一軍上路，前提為準確度達標。[Yahoo 運動 2026-07-20](https://tw.sports.yahoo.com/news/%E4%B8%AD%E8%8F%AF%E8%81%B7%E6%A3%92%E3%80%8Babs%E9%80%B2%E5%85%A5%E5%AF%A6%E6%88%B0%E6%B8%AC%E8%A9%A6%E9%9A%8E%E6%AE%B5-%E4%B8%AD%E4%BF%A1%E5%85%84%E5%BC%9F%E3%80%81%E5%91%B3%E5%85%A8%E9%BE%8D%E4%BA%8C%E8%BB%8D%E8%B3%BD%E4%BA%8B%E5%85%88%E8%A1%8C%E8%A9%A6%E8%BE%A6-133204513.html)、[自由體育](https://sports.ltn.com.tw/news/paper/1763519)

---

## 四、現行記錄表 已有 vs 尚未加入 的差距分析

現行表可直接產出：PA、AB、H、1B/2B/3B/HR、SAC、BB、HBP、SO、SB、R、RBI、投手 IP/BF/球數/好球/壞球/K/BB/HBP/H/HR/R/ER/ERA(7 局)/WHIP/Strike%。逐球（SS/CS/IP/B/F）、落點 1–9、軌跡 G/F/L、強度 強/中/弱、失誤上壘、壘上出局、局數與打席前出局數（`outs_before`）已在 JSON 中。

### 4-1. 用現有欄位就能算、但尚未算出的指標（零成本，優先做）

| 優先 | 指標 | 為何重要 |
|---|---|---|
| P0 | AVG / OBP / SLG / OPS / ISO / TB / XBH | CPBL 官網基本欄位；OBP 需先把「犧牲」拆成犧短/犧飛（見 P0 缺口） |
| P0 | K% / BB% / P/PA / Whiff% / CSW% / F-Strike% / Strike% | 逐球資料已具備；CSW% 與 F-Strike% 是現代投手評估最穩定的小樣本指標 |
| P0 | GB% / FB% / LD%、GO/AO、Hard%（強）、Pull/Center/Oppo% | 軌跡＋強度＋落點已有；對應 CPBL 進階平台的擊球彈道與拉推打分布 |
| P1 | BABIP、wOBA、FIP、K/9、BB/9、K/BB、LOB%、Pythagorean W% | 只需既有計數項＋常數 |
| P1 | 滾地出局/高飛出局（GO/FO）分開列 | CPBL 官網欄位 |

### 4-2. 缺少欄位而算不出的指標

| 優先 | 缺口 | 影響的指標 | 理由 |
|---|---|---|---|
| P0 | 打席前壘上狀態（無人/一/二/三/一二/一三/二三/滿壘） | 得點圈打擊率、RISP 打點效率、RE24、productive out、QAB 的「推進跑者」條件、WPA 近似 | CPBL/媒體最常引用的情境指標；一位記錄員只需在每打席勾一格 |
| P0 | 犧短 vs 犧飛 分開；雙殺打；故意四壞；不死三振/妨礙 | OBP 正確分母、GIDP、IBB（wOBA 分母要扣 IBB）、CPBL 官網欄位 | 目前「犧牲」與「保送」未細分 |
| P0 | 盜壘失敗（盜壘刺）與被牽制出局分開 | SB%、CS%（捕手）、wSB | 目前只有「壘上出局」一欄，無法區分是盜壘刺、牽制或跑壘失誤 |
| P0 | 對方球隊也要逐球紀錄（現行只記本隊打擊） | 投手 Whiff%/CSW%/F-Strike%、被打擊率、被 BABIP、GB% 誘導 | 投手所有過程指標都來自「對方打者的逐球」；若只有本隊打擊，投手端只能算 ERA/WHIP |
| P1 | 守備事件歸屬（刺殺/助殺/失誤/雙殺 到守備位置或球員） | 守備率、RF/9、DP | 現行只有全隊失誤數 |
| P1 | 捕手事件：被盜壘、阻殺、捕逸、暴投歸屬 | CS%、PB、WP | CPBL 投手欄有暴投，隊內評估捕手也需要 |
| P1 | 跑者推進紀錄（安打時由一壘上三壘、由二壘回本壘等） | XBT%、UBR 近似、first-to-third% | 只需在打席列旁記「1→3」「2→H」等符號 |
| P1 | 投手進場/退場時的比分與壘上跑者 | 中繼成功、救援成功/失敗、繼承跑者失分（IR/IS） | CPBL 排行榜三大項之二（SV、HLD） |
| P1 | 好球帶內/外（至少「帶內/帶外/邊緣」三分） | Chase%、Zone%、O-Contact%（CPBL 進階平台「追打%」、「本壘板紀律」） | 主觀但穩定記錄即有隊內比較價值 |
| P2 | 高飛必死球（P）與觸擊軌跡（B） | Pop-up%、犧短辨識 | 現行 G/F/L 缺 P、B |
| P2 | 打者/投手慣用手 | Pull/Oppo% 正確判斷、左右對戰拆分 | 名單層級一次填寫即可 |
| P2 | 球種（直/變）與測速槍球速 | 球種 CSW%、球速趨勢 | 需要多一位記錄員或測速槍，先列選配 |
| P2 | 本壘到一壘時間、捕手 Pop Time（碼錶） | Sprint speed / Pop time 近似 | 練習時量測即可，不必每場 |

### 4-3. 明確不追求（❌）
揮棒速度、揮棒長度、squared-up、blasts、攻擊角、swing path、揮棒時機、擊球初速/仰角、轉速、OAA/FRV/DRS、xwOBA、ABS 資料——全部需 Trackman/Hawk-Eye。建議只保留「強/中/弱」與 G/F/L/P 作為近似，並在報表中明確標示為近似值。

---

## 五、建議新增的記錄欄位

原則：一位記錄員、每打席多花不超過 5 秒；所有新欄位都是「勾選或單字代碼」；既有欄位不動。

### 5-1. 每打席（PA）新增欄位

| 欄位 | 允許值 | 用途 |
|---|---|---|
| 壘上(前) `base_before` | `0` 無人、`1`、`2`、`3`、`12`、`13`、`23`、`123` | RISP AVG、RE24、productive out、QAB、WPA 近似。與現有 `outs_before` 組成 24 局面 |
| 結果代碼擴充 `result` | 既有值＋ `犧短`、`犧飛`、`雙殺打`、`三殺打`、`故四`、`不死三振`、`妨礙`、`滾地出局`（取代「內滾」時可保留）、`高飛必死` | OBP 分母、GIDP、IBB、CPBL 官網欄位一一對應 |
| 軌跡 `traj` 擴充 | `G` 滾地、`L` 平飛、`F` 飛球、`P` 高飛必死（內野飛球）、`B` 觸擊 | Pop-up%、觸擊辨識、GO/AO |
| 打點細分 | 既有 `rbi` 數字即可，但加註 `rbi_type`：`H` 安打、`SF` 犧飛、`GO` 滾地、`BB` 滿壘保送、`E` 失誤（不計打點） | 得點圈效率、productive out |
| 跑者推進 `runner_adv` | 自由代碼，每名跑者一段：`1-3`（一壘上三壘）、`2-H`、`1-2`、`3-H`；出局寫 `1x3`（一壘跑者在三壘被觸殺） | XBT%、UBR 近似、跑壘出局分類 |
| 壘上出局原因 `out_on_base_type` | `CS` 盜壘刺、`PK` 牽制出局、`TO` 進壘出局（跑壘失誤）、`DP` 雙殺被殺、`APP` 申訴/漏踩壘 | SB%、CS%、牽制、跑壘失誤 |
| 好球帶判定（選配）`zone` | 對每一球在 `B` 或 `CS/SS/F/IP` 後加 `i`（帶內）／`o`（帶外）／`e`（邊緣），例：`SSo`、`Bo`、`CSe` | Chase%、Zone%、O-Contact%（近似） |
| 首球註記 | 不必新增：由 `pitches[0]` 是否為 `CS/SS/F/IP` 判斷 | F-Strike%、首球揮棒率 |
| 強度 `quality` | 維持 強/中/弱，但在記錄規範明定：「強」＝平飛或穿越內野、外野手退防、或全壘打；「弱」＝滾地不出內野草皮、內野飛球、觸擊 | Hard% 近似的一致性 |

### 5-2. 每場（game）新增欄位

| 欄位 | 允許值 | 用途 |
|---|---|---|
| 對方打者逐球紀錄 | 與本隊同格式（至少記 `pitches`、`result`、`traj`、`base_before`、`outs_before`） | 投手 Whiff%/CSW%/F-Strike%/GB%/被打擊率/被 BABIP；沒有這項，所有投手過程指標都無法算 |
| 投手交接 `pitcher_changes` | 每位投手：`enter_inning`、`enter_outs`、`enter_bases`、`score_diff_at_entry`（本隊−對方）、`exit_...` 同組、`inherited_runners`、`inherited_scored` | HLD / SV / BS 判定、IR/IS |
| 投手事件 | `wp` 暴投、`bk` 投手犯規、`pk` 牽制出局 次數（暴投記到當時捕手也可查） | CPBL 投手欄位 |
| 捕手事件 | `pb` 捕逸、`sba` 被盜壘、`cs` 阻殺（附捕手姓名） | CS%、PB |
| 守備事件（選配，可只記出局球） | 每個出局：守備序列 `6-3`、`F8`、`4-6-3 DP`；失誤記 `E5`、`E7(T)` 傳球失誤 | PO/A/E/DP 歸屬、守備率、RF |
| 比賽層級 | `game_innings`（7 或 9）、`qs`、`decision`（W/L/SV/HLD/BS）、`lob_team` 團隊殘壘 | ERA 換算、QS、殘壘 |
| 名單層級 | 打者 `bats`（R/L/S）、投手 `throws`（R/L）、選配 `home_to_first_sec`、捕手 `pop_time_sec` | Pull/Oppo 判定、左右對戰拆分、速度近似 |

### 5-3. 隊內「優質打席」（QAB）建議定義
綜合 GameChanger 與常見教練版本，建議採用可從上述欄位自動判定的版本（任一成立即計 1 QAB）：
1. 安打、保送、觸身；2. 犧短/犧飛成功；3. 兩出局前推進跑者的出局（productive out：無人出局時推進任一跑者，或一出局時滾地/飛球送回三壘跑者）；4. 打點；5. 6 球以上的打席；6. 兩好球後再纏鬥 3 球以上；7. 強勁擊球（強度＝強）不論結果。
GameChanger 版本為：兩好球後 3 球以上、6 球以上、長打、強勁擊球、保送、犧短、犧飛。[GameChanger](https://gamechanger.zendesk.com/hc/en-us/articles/214493703-Quality-At-Bats-)；另有版本加入「8 球以上」與「0-2 落後後讓投手多投 4 球」。[Rizzler](https://rizzlersports.com/stats/batting/quality-at-bat) 業餘教練常用目標為 QAB% ≥ 60%。

---

## 六、公式附錄

### 6-1. 打擊（CPBL 官網與 MLB 通用）
- **AVG** = H ÷ AB
- **OBP** = (H + BB + HBP) ÷ (AB + BB + HBP + SF)　（犧短不在分母；犧飛在分母）
- **SLG** = TB ÷ AB，TB = 1B + 2·2B + 3·3B + 4·HR
- **OPS** = OBP + SLG（CPBL 官網稱「整體攻擊指數」）
- **ISO** = SLG − AVG
- **BABIP** = (H − HR) ÷ (AB − SO − HR + SF)
- **K%** = SO ÷ PA；**BB%** = BB ÷ PA；**P/PA** = 總球數 ÷ PA
- **GO/AO** = 滾地出局 ÷ 高飛出局（CPBL「滾飛出局比」）
- **SB%** = SB ÷ (SB + CS)（CPBL「盜壘率」）
- **RISP AVG** = 壘上(前) ∈ {2,3,12,13,23,123} 之打席中的 H ÷ AB
- **XBT%** = 額外進壘次數 ÷ 機會數；額外進壘 = 一安時由一壘上三壘、二安時由一壘回本壘、一安時由二壘回本壘等「多推進一壘」。[Baseball-Reference](https://www.baseball-reference.com/blog/archives/10867.html)
- **Productive Out**（ESPN/Elias 定義）= 無人出局時以飛球/滾地/觸擊推進跑者；一出局時投手觸擊推進；或一出局時滾地/飛球送回得分。POP = productive outs ÷ productive-out 機會。[Baseball Prospectus](https://www.baseballprospectus.com/news/article/3634/assessing-productive-outs-little-things-mean-a-little/)

### 6-2. wOBA / wRAA / wRC+
- **wOBA** = (wBB·(BB − IBB) + wHBP·HBP + w1B·1B + w2B·2B + w3B·3B + wHR·HR) ÷ (AB + BB − IBB + SF + HBP)。[FanGraphs](https://library.fangraphs.com/offense/woba/)
- FanGraphs Guts! 線性權重（2026-09-08 讀取，[來源](https://www.fangraphs.com/tools/guts)）：

| 年度 | lg wOBA | wOBA scale | wBB | wHBP | w1B | w2B | w3B | wHR | runSB | runCS | R/PA | R/W | cFIP |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2023 | .318 | 1.204 | .696 | .726 | .883 | 1.244 | 1.569 | 2.004 | .200 | −.422 | .122 | 10.028 | 3.255 |
| 2024 | .310 | 1.242 | .689 | .720 | .882 | 1.254 | 1.590 | 2.050 | .200 | −.405 | .117 | 9.683 | 3.166 |
| 2025 | .313 | 1.232 | .691 | .722 | .882 | 1.252 | 1.584 | 2.037 | .200 | −.410 | .118 | 9.774 | 3.135 |
| 2026（進行中） | .316 | 1.239 | .698 | .729 | .890 | 1.262 | 1.597 | 2.051 | .200 | −.412 | .118 | 9.816 | 3.095 |

- **wRAA** = ((wOBA − lgwOBA) ÷ wOBA scale) × PA
- **wRC** = (((wOBA − lgwOBA) ÷ wOBA scale) + lgR/PA) × PA
- **wRC+** = (((wRAA/PA + lgR/PA) + (lgR/PA − PF × lgR/PA)) ÷ lg wRC/PA) × 100；業餘隊可令 PF = 1、「聯盟」= 自家聯賽全體或本隊全體打席。[FanGraphs](https://library.fangraphs.com/offense/wrc/)
- 註：業餘環境得分結構不同，借用 MLB 權重時 wOBA 只宜作隊內排序，不宜與職棒數值直接比較。

### 6-3. 逐球過程指標（本表代碼：SS 揮空、CS 好球未揮、IP 打進場內、B 壞球、F 界外）
- 揮棒數 = SS + F + IP；總球數 = SS + CS + IP + B + F
- **Whiff%** = SS ÷ (SS + F + IP)
- **Swing%** = (SS + F + IP) ÷ 總球數；**Contact%** = (F + IP) ÷ (SS + F + IP)
- **SwStr%** = SS ÷ 總球數
- **CSW%** = (CS + SS) ÷ 總球數（界外不算）。[Pitcher List](https://pitcherlist.com/csw-rate-an-intro-to-an-important-new-metric/)
- **Strike%** = (SS + CS + F + IP) ÷ 總球數（CPBL Box「好球數」口徑，界外算好球）
- **F-Strike%** = 第一球 ∈ {CS, SS, F, IP} 的打席數 ÷ PA（或 ÷ BF）。MLB 平均約 59%；2003 年研究：首球好球後打者 AVG .261 vs 首球壞球後 .280。[FanGraphs](https://library.fangraphs.com/offense/plate-discipline/)、[Wikipedia](https://en.wikipedia.org/wiki/First-pitch_strike)
- **Chase%（近似）** = 帶外球揮棒 ÷ 帶外球數（需 `zone` 註記）；**Zone%** = 帶內球 ÷ 總球數
- **GB% / FB% / LD% / PU%** = 各軌跡數 ÷ 場內球數（IP 且非界外）；MLB 甜蜜點仰角 8°–32° 對應本表約為 L 與低 F
- **Hard%（近似）** = 強度「強」÷ 場內球數（Statcast Hard-hit 為 EV ≥ 95 mph；本表為主觀近似）
- **Pull% / Center% / Oppo%**（依落點 1–9 與慣用手）：右打 拉打 = 5/6/7、中線 = 1/2/8、推打 = 3/4/9；左打相反（拉打 = 3/4/9、推打 = 5/6/7）。落點 1（投手）、2（捕手）視為中線。

### 6-4. 投球
- **IP** = 出局數 ÷ 3（顯示 x.1／x.2，計算時用 x.333／x.667）
- **ERA (7 局)** = ER × 7 ÷ IP；**ERA (9 局)** = ER × 9 ÷ IP（CPBL 官網為 9 局口徑；隊內報表建議兩者並列）
- **WHIP** = (BB + H) ÷ IP（CPBL「每局被上壘率」；不含 HBP）
- **K/9** = K × 9 ÷ IP；**BB/9** = BB × 9 ÷ IP；**K/BB** = K ÷ BB；**K%** = K ÷ BF；**BB%** = BB ÷ BF
- **FIP** = (13·HR + 3·(BB + HBP) − 2·K) ÷ IP + cFIP；cFIP = lgERA − (13·lgHR + 3·(lgBB + lgHBP) − 2·lgK) ÷ lgIP；MLB 2025 cFIP = 3.135（一般約 3.10）。7 局賽制若沿用 9 局 ERA 口徑則常數可直接借用；若用 7 局 ERA 則 cFIP 需以自家聯盟 ERA 重算。[FanGraphs](https://library.fangraphs.com/pitching/fip/)
- **xFIP** = (13·(FB × lgHR/FB%) + 3·(BB + HBP) − 2·K) ÷ IP + 常數。[FanGraphs](https://library.fangraphs.com/pitching/xfip/)
- **LOB%** = (H + BB + HBP − R) ÷ (H + BB + HBP − 1.4·HR)；MLB 平均約 70–72%。[FanGraphs](https://library.fangraphs.com/pitching/lob/)
- **QS**：MLB = 先發 ≥ 6 IP 且 ER ≤ 3；7 局賽制建議 ≥ 5 IP 且 ER ≤ 3（隊內定義）
- **HLD / SV / BS**：採 CPBL 定義（見 3-1），需要投手進退場比分與壘上跑者
- **P/IP** = 總球數 ÷ IP；**P/BF** = 總球數 ÷ BF

### 6-5. 守備與捕手
- **Fielding %** = (PO + A) ÷ (PO + A + E)
- **Range Factor**：RF/G = (PO + A) ÷ G；RF/9 = (PO + A) × 9 ÷ 守備局數（7 局賽制可改 ×7 作隊內比較）。[Cooperstown Cred](https://www.cooperstowncred.com/statistics-glossary/)
- **Catcher CS%** = 阻殺 ÷ (被盜壘 + 阻殺)；因暴投／捕逸推進的跑者不計入盜壘嘗試。[MLB Glossary](https://www.mlb.com/glossary/standard-stats/caught-stealing-percentage)
- **PB**、**WP**：捕逸歸捕手、暴投歸投手；建議兩者都記下當時的投捕搭配以便交叉查詢

### 6-6. 球隊
- **Pythagorean W%** = RS^1.83 ÷ (RS^1.83 + RA^1.83)（Baseball-Reference 指數；Bill James 原版為 2）。[MLB Glossary](https://www.mlb.com/glossary/advanced-stats/pythagorean-winning-percentage)
- **Run Differential** = RS − RA；**期望勝場** = Pythagorean W% × 場數
- **RE24（近似）**：以 MLB Game Strategy Explorer 的 24 局面得分期望值表為基準，每打席 RE24 = RE(後) − RE(前) + 該打席得分；需 `base_before`、`outs_before` 與打席後局面。[MLB.com](https://www.mlb.com/news/baseball-savant-releases-game-strategy-explorer)

---

## 七、結論（給記錄組的一頁摘要）

1. 現行逐球格式已足以算出 Whiff%、CSW%、F-Strike%、P/PA、GB/FB/LD%、Pull/Oppo%，這些正是 MLB 與 CPBL 進階平台都在看的「過程指標」，只差程式端計算。
2. 最值得新增、成本最低的欄位是 **壘上(前)**、**犧短/犧飛/雙殺打/故四 細分**、**盜壘刺 vs 牽制**、**對方打者逐球**、**投手進退場比分**；補齊後即可完整對齊 CPBL 官網打擊／投球欄位，並產出 RISP、HLD/SV、SB%、CS%。
3. 揮棒追蹤（bat speed、attack angle、squared-up、swing timing）與擊球初速類指標在 2024–2026 年是 MLB 最大的新增，但全部需追蹤設備；本隊以「強/中/弱＋G/F/L/P」作近似並明確標示即可。
4. CPBL 自 2026-05 起公開 Trackman 進階數據（stats.cpbl.com.tw），ABS 挑戰制目標 2027 一軍上路；本隊可先養成「好球帶內/外」註記習慣，讓追打率概念有隊內版本。
