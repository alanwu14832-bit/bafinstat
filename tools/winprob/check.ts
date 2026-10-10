// 獲勝機率模型的檢查（開發用，不在 CI）：讀一份 dataset JSON（網站存在瀏覽器的格式，或 { base: dataset }），印出
// RE24（模型對照實際、各格 n）、每半局得分分佈、校準表（打席開始時的預測，每 10% 一段，對照實際勝率）與 Brier score
// （對照只看局數與比分的基準）。用 web/ 的 esbuild 打包，做法和 tools/gamesim/sitestats.ts 一樣：
//   cd web && npx esbuild ../tools/winprob/check.ts --bundle --platform=node --format=esm --outfile=/tmp/check.mjs \
//     '--define:import.meta.env={"BASE_URL":"/"}' --define:__TEAM_SEED__=false && node /tmp/check.mjs dataset.json [局數] [突破僵局壘包]
import { readFileSync } from 'node:fs'
import { summarizeGame } from '../../web/src/data/stats'
import type { Dataset } from '../../web/src/data/types'
import { defaultWinRules, stateOf } from '../../web/src/data/winModel'
import { buildWinData } from '../../web/src/data/winTimeline'

const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const ds: Dataset = raw.base ?? raw
const rules = defaultWinRules(Number(process.argv[3]) || 7, process.argv[4] ?? '12')
const t0 = performance.now()
const win = buildWinData(ds, rules)
const ms = performance.now() - t0
const { run } = win.model
const s = run.sample
const f2 = (v: number | null) => (v === null ? '  —  ' : v.toFixed(2).padStart(5))

console.log(`比賽 ${ds.games.length} 場；建模 ${win.coverage.trainGames} 場、${win.coverage.trainPas} 個打席；推估打席 ${win.coverage.approxPas}/${win.coverage.pas}；計算 ${ms.toFixed(1)} ms`)
console.log(`規則：${rules.innings} 局，突破僵局 ${rules.tiebreakFrom ? `第 ${rules.tiebreakFrom} 局起 ${rules.tiebreakBases.join('')}` : '不採用'}`)
console.log('\nRE24：模型 / 實際（n）')
console.log('壘上      0 出局               1 出局               2 出局')
for (const [b, label] of [[0, '無人'], [1, '一壘'], [2, '二壘'], [4, '三壘'], [3, '一二'], [5, '一三'], [6, '二三'], [7, '滿壘']] as const) {
  const cells = [0, 1, 2].map((o) => { const st = stateOf(o, b); return `${f2(run.re[st])} / ${f2(s.empiricalRe[st])} (${String(s.n[st]).padStart(4)})` })
  console.log(`${label}  ${cells.join('  ')}`)
}
const pc = (d: number[]) => d.map((x) => `${(x * 100).toFixed(0)}%`.padStart(4)).join(' ')
console.log(`\n每半局平均得分：模型 ${s.runsPerHalfModel.toFixed(2)}、實際 ${s.runsPerHalfActual === null ? '—' : s.runsPerHalfActual.toFixed(2)}（${s.halves} 個完整半局）`)
console.log(`得分分佈 0/1/2/3+：模型 ${pc(s.runDist.model)}；實際 ${s.runDist.actual ? pc(s.runDist.actual) : '—'}`)

// calibration at every real plate appearance's start (ties excluded)
const buckets = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }))
let n = 0, brier = 0, base = 0
for (const g of ds.games) {
  if (g.isDemo || g.status) continue
  const r = summarizeGame(ds, g).result
  if (r === 'T') continue
  const y = r === 'W' ? 1 : 0
  const home = g.homeAway === '主'
  for (const e of win.events.get(g.id) ?? []) {
    if (e.kind !== 'pa') continue
    const p = e.weBefore
    const d = home ? e.us - e.opp : e.opp - e.us
    const w0 = win.model.we(e.inning, e.half, 0, d)
    const q = home ? w0 : 1 - w0
    const k = Math.min(9, Math.floor(p * 10))
    buckets[k].n++; buckets[k].p += p; buckets[k].y += y
    brier += (p - y) ** 2; base += (q - y) ** 2; n++
  }
}
console.log('\n校準（打席開始時的預測 → 實際勝率）')
buckets.forEach((b, i) => { if (b.n) console.log(`${String(i * 10).padStart(3)}–${String(i * 10 + 10).padStart(3)}%  n ${String(b.n).padStart(5)}  預測 ${(b.p / b.n * 100).toFixed(1).padStart(5)}%  實際 ${(b.y / b.n * 100).toFixed(1).padStart(5)}%`) })
if (n) console.log(`\nBrier score：模型 ${(brier / n).toFixed(4)}；只看局數與比分 ${(base / n).toFixed(4)}；擲硬幣 0.2500（${n} 個打席）`)
