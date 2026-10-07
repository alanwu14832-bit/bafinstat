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
  merge into `main`); Vercel serves `main` at bafinstat.vercel.app.
- `supabase/schema.sql` + `supabase/migrations/` — the database; the site keeps working (and warns) before a migration runs.
- `tools/build_workbook.py` builds `data/BAFIN_棒球數據總表.xlsx`, the Excel template the site hands out.
- `record/sim.test.ts` plays 150 random games through the recording model: keep it green when touching recording or the
  runner timeline.

## Security (docs/SECURITY.md)
- Writes are allowed only for the account bound to an `editors` row (`is_editor()` checks `user_id = auth.uid()`;
  binding by the admin's `admin_bind_editor`, a 邀請碼 or an email code — `supabase/migrations/2026-10-08_security.sql`).
- Never write an email into a public table (`updated_by`/`created_by` are stamped by a trigger with the recorder's name).
- Keep the Content-Security-Policy (`web/src/config/security.ts`, written into index.html at build) and the headers in
  `web/vercel.json`; no inline scripts in index.html (put them in `web/public/boot.js`). Run `npm audit` when adding packages.
