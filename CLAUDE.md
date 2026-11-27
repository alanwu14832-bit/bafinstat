# bafinstat — notes for Claude

NTU BaFiN 系隊's stats site (喝FIN就好BA): live pitch-by-pitch recording, live score, game logs, player and team stats.
The maintainer is not a developer: talk in Traditional Chinese, plainly, and say exactly what to click outside the code.

## Two sites, one change (the user's standing rule)
The same code also runs the 校隊 site, `alanwu14832-bit/ntubastat` (NTUBA, Cloudflare Workers, its own Supabase).
**Every feature, fix or layout change goes into both repos unless the user says only one.** Add the other repo to the
session, port the change (`web/src` is shared code; team-specific parts are `web/src/config/teamDefaults.ts`, docs,
hosting and workflows), run `npm test` in each `web/`, push each through its `claude/...` branch, and check both deploys.
A database change needs a migration in both repos, and the user must run it in both Supabase projects — say so.

## This repo
- `web/` — the site (Vite + React 19 + TypeScript + Tailwind 4 + zustand). `npm ci`, `npm test`, `npm run build` there.
- Deploys: pushing any `claude/**` branch runs `.github/workflows/auto-deploy.yml` (tests + build + the database permission
  test, then merge into `main` and save the 網站版本 copy) — push the session's branch and let it merge; do not merge a PR into
  `main` by hand (that skips the tests and the archive: 2026-11-26/27 went out that way, fixed 2026-11-27). Vercel serves
  `main` at bafinstat.vercel.app and builds `main` only (`web/vercel.json` `git.deploymentEnabled`): every deployment carries the saved versions and counts against the 10 GB Deployment Storage.
- `supabase/schema.sql` + `supabase/migrations/` — the database; the site keeps working (and warns) before a migration runs.
  `supabase/tests/run.sh` (also in auto-deploy) loads them into a plain Postgres and runs `permissions.sql`: add a check
  there for every new table, policy or function.
- `tools/build_workbook.py` builds `data/BAFIN_棒球數據總表.xlsx`, the Excel template the site hands out (run it as
  `OPENPYXL_LXML=False python3 tools/build_workbook.py` to keep the committed file's XML layout). Its 總表 formulas must
  give the site's numbers: `tools/gamesim/excel.mjs` checks that.
- 網站版本: `auto-deploy.yml` builds each live version as a read-only copy (VITE_ARCHIVE_ID, base /v/<id>/) into the
  `site-archive` branch (last 30); `web/scripts/archive.mjs` (postbuild) serves them at /v/<id>/; `public/boot.js` hands
  deep links into a copy over to it. Archived copies never sign in (config/archive.ts).
- `record/sim.test.ts` plays 150 random games through the recording model: keep it green when touching recording or the
  runner timeline. `tools/gamesim/` plays two scripted games through the real 紀錄比賽 screen (Playwright, local mode)
  and checks the box score against a hand-scored answer key: rerun it after changes to recording or stats. `edit1.mjs`
  (修改資料) and `excel.mjs` (匯出／匯入 round trips, 單場模板, and the LibreOffice-recalculated 總表 against the site's own
  numbers): rerun them after changes to the game editor, import/export, stats or `tools/build_workbook.py`.
- `web/src/data/broadcast.ts` is the text of /live and the game page's 文字轉播 tab (CPBL-style sentences, runner names from
  `record/timeline.ts`); `tools/gamesim/live.mjs` checks it in the browser (run it next to game1–3 after changes to /live).
- 隊內賽 (`web/src/data/intrasquad.ts`): stored once, from one side (`dayRoster.intra` holds the other side's name, lineup
  and subs; its batters/pitchers are named on the rows). The other side's view is made when the data is read
  (`withMirrors`, id + `~2`) and never saved; `Filters.intra` decides whether stats count them (default: not), and team
  records never do. `tools/gamesim/intra.mjs` records one through the real screen.
- 跑者出局 (2026-11-18): the runner pickers (修改資料 EndPicker, 紀錄比賽 DestRow) have one 壘死 for a runner put out (the batter's
  row: 出局) and a 「自己跑壘失誤」 tick beside it (`baserunningOuts`, shown as 跑壘失誤; the Excel column keeps the name 壘死).
  內滾／犧觸 plus a runner put out on that play becomes 野選 (FC_FROM in GameEditor and Record). Out codes stay on the runner's
  own row (scorebook style); `record/timeline.outsDuring` lets the editor list say which plate appearance he was put out in.
- 紀錄比賽 → 逐打席 → a row opens the full 修改資料 panel (`GameEditor` with `live`: no 插入／移動／刪除, no draft);
  `record/liveEdit.applyLiveEdit` puts the game back on the changed rows (finished halves keep 3 outs, the half being played
  gets its outs and runners again, a third out is refused). 好壞球分佈 is `components/charts/StrikeRatioCard` (share, sortable).
- 球速 (2026-11-23): `speeds` on a plate appearance, one per pitch (null = not measured; `data/speeds.ts`), stored as
  `pitch_speeds` (`2026-11-23_pitch_speeds.sql`). 紀錄比賽 asks with a number pad (`SpeedPad`) when `RecordState.speedOn`
  says so for the pitcher on the mound (us / opp); 修改資料 has a 球速 field; the pitch chips show them. Step 2: `speedSummary`
  (球員 → 投球 `SpeedCard`: 最快, 均速 of every measured pitch — no pitch types —, per inning, per game), the 文字轉播 (each
  pitch's km/h, 「最快」 on the summary line, 上一球 on /live) and Excel (球速 「132,,128」, the last input of 打席紀錄 / 投球紀錄).
- 限時動態 (2026-11-23, step 1 of the IG story cards: no AI yet): `data/storyCard.ts` works out a card (單場打擊／單場投球／本季打擊／
  本季投球; the numbers and the one editable sentence), `lib/storyImage.ts` draws it 1080 × 1920 with Instagram's top 250 / bottom
  340 px kept clear and an optional photo that never leaves the device, `components/ui/StoryDialog.tsx` (the 限動 button on 球員 and
  on a game page) shares or downloads it. A reader below 球員 level gets single games only (no season card or season line).
  Planned: step 2 a server-side Claude call for the sentence (key never in the site), step 3 里程碑 and 全隊賽後總結 cards.
- 限時動態編輯器 (2026-11-26, the user's ask: a small design desk): `StoryStyle` in lib/storyImage.ts — 版型 滿版照片／上照片下數據／純數據,
  a background photo (pan, zoom, 變暗, 模糊) and a front photo (`fg`: moved, sized, 白框, 陰影), the colours (主色／文字色／底色, `palettes()`),
  and each block of text (`LAYERS`: shown, size, colour, 字型, moved). drawStory returns the blocks' boxes (`hitTest`) so the preview
  picks and drags them; `guides` draws the picked frame only while editing (IG's covered bands were taken out at the user's ask:
  the layouts still keep their text inside SAFE_TOP / SAFE_BOTTOM). 圖層 (`style.order`, `moveLayer`): the front photos and the
  blocks are queued and drawn in the reader's order over the background, and `hitTest` picks by it. The look is kept on the device
  (`bafin.story.style.v1`, `readStyle` cleans it), the photos never. 自動去背 on the front photo (step 2, same day): `lib/cutout.ts`
  → module worker `lib/cutout.worker.ts` running IS-Net (MIT int8 build, Hugging Face pinned revision, ~44 MB, kept in Cache Storage
  `bafin-cutout-v1`; `refineAlpha` then drops the haze, scraps not touching the subject and fills small holes, so a bat in his hand
  stays; 手動修邊 `CutoutRefine` paints 擦掉／補回 on the kept mask and `cutWith` cuts again. BiRefNet was tried: its browser build is
  224 MB or WebGPU-only, so not used) on ONNX Runtime Web (`onnxruntime-web`, its WebAssembly from jsDelivr at the package.json version; never put
  the wasm or the model in public/: every Vercel deployment and archived version would carry them). `vite.config` worker format 'es'.
- POTG 海報模板 (2026-11-26, from the team's own PLAYER OF THE GAME posts; **this site only** — the user had them taken back out of the
  校隊's and 霸龍's sites): three more layouts in `StoryStyle` — 斜切海報 (darkened
  photo, a slanted concrete `wall()` on the right, the cut-out across the edge, Knewave title, the name in 王漢宗顏楷體), 直排姓名
  (blurred photo, pale panel, Playfair title, the name down the panel) and 左欄數據 (accent column with the title and `card.stats`
  stacked in Anton italic, the photo framed on the right, a name plate). Their blocks are `potg / pname / stats / logo` (`layersFor`);
  `titleLines` (「/」 breaks a custom title), `card.statLine` (batStats 「2-4 1HR 2B 3RBI」 / pitStats 「3.2 IP  3 K  0 BB  0 R」,
  rewordable), up to three front photos (`fgs`, 連續動作; `defaultFg` per layout keeps the feet above the name). The faces load only
  in the dialog (`lib/storyFonts.ts`). One face per script on a card (the user's rule): every word is set in one stack, `cardFace` —
  the card's Latin face, then its CJK face (`style.fonts`, '' = the layout's pair: 數據卡 Barlow + 黑體, 斜切 Knewave + 顏楷,
  直排 Playfair + Noto Serif TC, 左欄 Anton + 黑體); blocks have no face of their own. Where the brush face lacks a character on
  the card all the card's Chinese is set in Noto Serif TC (`drawsAll` compares drawn pixels). The brush Chinese is 王漢宗顏楷體
  (the face of the team's own posts, the user's pick): GPL v2, 13,970 characters, kept as `fonts/HanWangYanKai.woff2` (outside
  web/, so not in every Vercel deployment and archived version) and read from jsDelivr at one pinned commit (`YANKAI_URL`;
  CSP font-src has cdn.jsdelivr.net for it). A new font file means a new commit in that URL.
- 先發陣容 IG 貼文 (2026-11-26, from the team's own STARTING LINEUP posts; **this site only**, like the POTG templates): the 先發陣容
  page's 「IG 貼文」 opens `components/ui/LineupPostDialog.tsx` — `data/lineupPost.ts` (rows in batting order, P for a pitcher who
  bats, SP at the bottom under a DH; 「SUN, 10/18/2026 | 3:00 PM」 and 「@venue」 from the chosen game) and `lib/lineupImage.ts`
  (1080 × 1350: the concrete `wall`, Knewave title / team / positions / date, the names in 王漢宗顏楷體 — every Chinese word in
  Noto Serif TC when it lacks a character —, the player in the photo in red, their badge or a disc with their name, our mark).
  The photo has 自動去背 and 手動修邊 like the story editor; title, team line and colours are kept on the device (`bafin.lineuppost.v1`).
- 複選篩選 (2026-11-25): `Filters.tournament / position / opponent / result` are lists (none = every game; a game passes holding any of
  the values; different filters still narrow together). `components/ui/MultiSelect.tsx` (desktop: checkbox list in a portal, fixed
  widths so the one-row toolbar keeps fitting; the phone sheet: `MultiChips`); the address repeats the key (`?cup=A&cup=B`, old
  one-value / `all` links still read). 主客 and 隊內賽 stay single.
- 犧飛 (2026-11-25, a recorder's report): sending a runner home on a 外飛／界外飛 with fewer than two out turns the result into 犧飛
  (SF_FROM in Record and GameEditor, like FC_FROM's 野選); `data/audit` flags an old 外飛／界外飛 with an RBI as 待核對.
- 失誤只算一次 (2026-11-27 audit; all three sites): a 失誤 result is one error, its 落點's fielder's. 「這次失誤算給」
  (`components/ui/ErrorFielderPicker`, 紀錄比賽 and 修改資料) moves the 落點 to the fielder who erred instead of typing him as a
  second error (the 系隊's 11/13 game read 10 errors that way). 紀錄比賽 writes the result's own position out next to other errors
  (`withOwnListed`: the same count, read one way only); their 落點 fielder picked again for a 失誤進壘 on the play is that same error;
  `ourDoubledResult` makes an old row (落點 SS + 2B listed) 待核對, `theirDoubledResult` is only noted in 修改資料 (their list
  cannot say "twice on purpose"). A caught fly (外飛／內飛／界外飛) never puts the batter on a base (FLY_CAUGHT in Record, GameEditor).
- 看得清楚、按得到＋紀錄比賽球場好用 (2026-11-27, from an impeccable critique; all three sites): text-only colour tokens
  `--accent-text / --good-text / --warning-text / --critical-text` (styles/tokens.css, Tailwind `text-accent-text`…) for small text,
  the fills keep `--accent` etc.; `--accent-text` is the team's `accentText` (teamDefaults, VITE_TEAM_ACCENT_TEXT, written by
  `accentCss` next to the accent): the 系隊's #9a5f0c (5.2:1 on white), the other sites' own accent (it already passes); the dark
  scoreboard keeps the bright ones. Select/Input show the focus ring, Tabs draw it inside; a
  「跳到主要內容」 link (`.skip-link` → `main#main`); Card titles are h2; on touch Button md / Select / Input are 44 px and `.tap-44`
  (index.css) gives smaller controls a 44 px target. 紀錄比賽: PitchPad tiles are filled like the scoreboard's lights (`pitchTone`:
  壞球 BOARD.ball, the strikes BOARD.strike, 擊進場內 BOARD.bg; unavailable = dashed, unfilled), ResultChips tinted per group
  (`GROUP_HUE`; off = dashed), the batting side asked by a big 左打／右打 card (the small chips come back once picked), 必填 落點／軌跡
  a neutral tag and edge (送出 still waits), 結束半局 next to 結束比賽, the record buttons 44 px on touch.
- 2026-11-25 (players' and recorders' asks): 打擊 page's 擊球強度 is a 強擊率 Hard Hit% bar chart (強 ÷ batted balls with a 強度);
  即時比分 shows 球速 (under each pitch of 本打席, the last one, the pitcher's 最快 today) lit 黃 125–134 / 紅 135+ (`speedTone` in
  data/speeds.ts; theme colours `speedClass` in the 文字轉播 and pitch chips); 修改資料 stays open after 儲存修改 (GameView remounts
  it from the saved game via `key`, at the same tab / plate appearance via `view`), and its 取消 reads 結束修改 when nothing is unsaved.
- 2026-11-25 (2): the game page's 逐球紀錄 rows open 修改資料 at that plate appearance for 紀錄員／管理者 (`openPa` in GameView; anyone
  else gets plain rows); the 紀錄比賽 setup form is kept on the device while it is filled in (`SetupSnap`, `bafin.record.setup.v1`, for
  that day, cleared on 開始紀錄) so a phone reloading the page brings it back; each page offers its own filters (`hooks/usePageFilters`:
  總覽／投球／比賽 no 守位, 打擊／守備／球員 all, other pages none) and a filter a page does not offer does not apply there (`useStats`).
- 未完成打席 (2026-11-25): its own panel in 修改資料 (`UnfinishedPanel` in PaEditor: who was up — 打者 on our side, 投手 on theirs —,
  every pitch inserted / changed / deleted / added (no ball in play), 球速, 備註); the runner's out stays on his own row.
- 每個打席換守備 (2026-11-26, the user's ask): 修改資料 → 我隊投球 → 逐打席, each of their plate appearances has a 守備陣容 section
  (`DefenseByInning` with `at={inning,row}`, passed to PaPanel as `defense`): the alignment as it stood for that one
  (`defenseTimeline(inning, half, row)`), and a change starts from it (a DEF sub with `row` = the rows before it in that half);
  the plate appearances before keep the old alignment, errors follow. Not in the live editor (紀錄比賽 has its own 換人).
- 2026-11-25 (3), the look (all three sites: this one, the 校隊's and `alanwu14832-bit/aloongstat`): a `Card`'s `subtitle` folds behind
  the ⓘ beside its title (`components/ui/InfoNote.tsx`; `noteOpen` opens it for a warning; printing shows every note); the stitches
  (`Stitches`) stay on page titles only; 選球紀律 lists batters by 打席 with the numbers on the bars; phones get 區塊快捷鈕 on 打擊, 投球, 守備 and
  球員 (`components/layout/SectionNav.tsx`, targets by id / `<Section>`), a fade on the right edge of a table that scrolls sideways
  (`components/ui/ScrollFade.tsx`, in `DataTable` and the hand-built tables) and dots under 本季看點 (`StoryRow`). 總覽 opens with the
  開場形象區 (`SeasonHero`: the team's name as the page's h1 over its real record; planes in `components/ui/HeroArt.tsx`, the team's own
  art, moved by `--hp` on scroll, still under reduced motion, no scroll cue). The team photo is `web/public/hero.jpg` (+ `hero-m.jpg`
  for phones; `heroPhoto*` in teamDefaults.ts, found at build time by vite.config.ts → `config/hero.ts`); without the file the drawn
  backdrop stands in. The design rules came from the scroll-craft plugin (.claude/settings.json).
- 2026-11-26, more of the look (all three sites): the 球員卡 has planes of its own (`components/ui/PlayerArt.tsx`: the team colour, the
  jersey number drawn huge and faint, the seams) moved by the same `--hp` as 總覽's opening (`hooks/useDepthScroll.ts`, shared by both);
  its three numbers roll when the player changes. 總覽 below the opening reads as stretches (`SummaryHead`: a larger head with a line of
  real numbers and more air above it: 打擊摘要, 投球與守備摘要, 球季走勢) that each arrive differently: the tiles count up when scrolled
  to (`StatTile count` → `RollingNumber onView`), the four charts wipe in from the left (`ChartFrame wipe`), 近期比賽 comes in from the
  side (`Reveal x`). All of it is still under reduced motion.
- Games are written by the `save_games()` RPC, one transaction per batch (`supabase/migrations/2026-10-13_save_games.sql`);
  `pushCloudDataset` queues saves per device and falls back to piecewise writes before that migration. The record page
  syncs every change (record_drafts each time, the game rows only when they changed). Before writing the rows it reads the
  game back (`fetchCloudGame`) and takes in what another device changed since its own last save (`record/outsideEdits`, a
  field-by-field three-way merge against the copy read right after that save; flow changes the live game cannot follow are
  left out and the recorder is told): a 球速 typed in 修改資料 on a second device mid-game used to be written over (2026-11-26).

## Security (docs/SECURITY.md)
- Writes are allowed only for the account bound to an `editors` row (`is_bound_editor()` checks `user_id = auth.uid()`;
  binding by the admin's `admin_bind_editor`, a 邀請碼 or an email code — `supabase/migrations/2026-10-08_security.sql`),
  or for a live 快速登入 session (anonymous sign-in + the shared password checked in the database, `quick_sessions`;
  `supabase/migrations/2026-10-10_quick_login.sql`). `is_editor()` = either; the 紀錄員名單, `audit_log` and the quick
  password itself stay with `is_bound_editor()`. Never check that password in the site.
  身分分層 (`supabase/migrations/2026-11-05_roles.sql`): `editors.role` is player / coach / recorder / admin (教練 `coach` reads like a
  player, `2026-11-12_coach_role.sql`); `is_bound_editor()`
  counts recorders and admins only (so players never write), the account list and `add_member` / `set_member_role` /
  `reset_editor` need `is_admin()`, `my_role()` tells the site. The site gates pages by level (`hooks/useAccess.ts`,
  `components/layout/Gate.tsx`, `level` on the menu items): 0 一般人 (即時比分, 比賽, 紀錄簿, 使用指南, 數據字典, a short
  總覽, 練習紀錄), 1 球員, 2 紀錄員, 3 管理者 (帳號管理 at /accounts, 網站版本). That gate is only what the site shows: the
  plate-appearance rows stay publicly readable because 比賽 and 紀錄簿 are built from them. **This site runs with
  `openStats` on (teamDefaults.ts, 2026-11-17): the 球員 pages are open to everyone, so only 紀錄員 and 管理者 need an
  account; the tests keep the gate on (`VITE_TEAM_OPEN_STATS=0` in vite.config.ts) and the 校隊 keeps it.** 快速登入 is in the sign-in form again
  (2026-11-07) and counts as a 紀錄員 (`my_role()` gives 'recorder'); its settings card is on 資料匯入.
- Never write an email into a public table (`updated_by`/`created_by` are stamped by a trigger with the recorder's name).
- Keep the Content-Security-Policy (`web/src/config/security.ts`, written into index.html at build) and the headers in
  `web/vercel.json`; no inline scripts in index.html (put them in `web/public/boot.js`). Run `npm audit` when adding packages.
