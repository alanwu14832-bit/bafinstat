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
- Deploys: pushing `claude/baseball-stats-platform-avxula` runs `.github/workflows/auto-deploy.yml` (tests + build, then
  merge into `main`); Vercel serves `main` at bafinstat.vercel.app. Vercel builds `main` only (`web/vercel.json`
  `git.deploymentEnabled`): every deployment carries the saved versions and counts against the 10 GB Deployment Storage.
- `supabase/schema.sql` + `supabase/migrations/` — the database; the site keeps working (and warns) before a migration runs.
  `supabase/tests/run.sh` (also in auto-deploy) loads them into a plain Postgres and runs `permissions.sql`: add a check
  there for every new table, policy or function.
- `tools/build_workbook.py` builds `data/BAFIN_棒球數據總表.xlsx`, the Excel template the site hands out.
- 網站版本: `auto-deploy.yml` builds each live version as a read-only copy (VITE_ARCHIVE_ID, base /v/<id>/) into the
  `site-archive` branch (last 30); `web/scripts/archive.mjs` (postbuild) serves them at /v/<id>/; `public/boot.js` hands
  deep links into a copy over to it. Archived copies never sign in (config/archive.ts).
- `record/sim.test.ts` plays 150 random games through the recording model: keep it green when touching recording or the
  runner timeline. `tools/gamesim/` plays two scripted games through the real 紀錄比賽 screen (Playwright, local mode)
  and checks the box score against a hand-scored answer key: rerun it after changes to recording or stats.
- Games are written by the `save_games()` RPC, one transaction per batch (`supabase/migrations/2026-10-13_save_games.sql`);
  `pushCloudDataset` queues saves per device and falls back to piecewise writes before that migration. The record page
  syncs every change (record_drafts each time, the game rows only when they changed).

## Security (docs/SECURITY.md)
- Writes are allowed only for the account bound to an `editors` row (`is_bound_editor()` checks `user_id = auth.uid()`;
  binding by the admin's `admin_bind_editor`, a 邀請碼 or an email code — `supabase/migrations/2026-10-08_security.sql`),
  or for a live 快速登入 session (anonymous sign-in + the shared password checked in the database, `quick_sessions`;
  `supabase/migrations/2026-10-10_quick_login.sql`). `is_editor()` = either; the 紀錄員名單, `audit_log` and the quick
  password itself stay with `is_bound_editor()`. Never check that password in the site.
- Never write an email into a public table (`updated_by`/`created_by` are stamped by a trigger with the recorder's name).
- Keep the Content-Security-Policy (`web/src/config/security.ts`, written into index.html at build) and the headers in
  `web/vercel.json`; no inline scripts in index.html (put them in `web/public/boot.js`). Run `npm audit` when adding packages.
