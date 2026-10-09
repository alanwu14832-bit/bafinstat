// the answer key for game3.mjs (延長賽突破僵局與投手犯規), compared with what the site displayed
import { readFileSync } from 'node:fs'
const s = JSON.parse(readFileSync(process.argv[2] ?? 'game3-shown.json', 'utf8'))
const N = s.N
// 打者: PA AB R H 2B HR RBI BB SO SB — the tie-break runners (S5, S6 in the 3rd) score but get no plate appearance
const BAT = {
  S1: [2, 2, 0, 0, 0, 0, 0, 0, 1, 0], S2: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0], S3: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0], S4: [1, 1, 0, 0, 0, 0, 0, 0, 1, 0],
  S5: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0], S6: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0], S7: [1, 1, 0, 1, 1, 0, 2, 0, 0, 0], S8: [1, 1, 0, 0, 0, 0, 0, 0, 1, 0],
  S9: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
}
// 投手: IP BF PC 好球 K BB HBP H R ER ERA(7 局制) — B4 pitched the 3rd: the placed runner's run is his, unearned
const PIT = { S9: ['2.0', 6, 12, 12, 3, 0, 0, 0, 0, 0, '0.00'], B4: ['1.0', 3, 7, 7, 2, 0, 0, 0, 1, 0, '0.00'] }
// R H E after the innings; we are 客, so our row comes first
const LINE = { us: '0 0 2 2 1 0', opp: '0 0 1 1 0 0' }
let bad = 0
const cmp = (what, got, want) => { if (String(got) !== String(want)) { bad++; console.log(`✗ ${what}: 網站 ${got}，正確 ${want}`) } }
const batCols = ['PA', 'AB', 'R', 'H', '2B', 'HR', 'RBI', 'BB', 'SO', 'SB']
for (const [k, want] of Object.entries(BAT)) {
  const r = s.bat.rows.find((x) => x[0] === N[k]); if (!r) { bad++; console.log(`✗ 打者 ${N[k]} 沒出現在 Box Score`); continue }
  batCols.forEach((c, i) => cmp(`${N[k]} ${c}`, r[s.bat.heads.indexOf(c)], want[i]))
}
const pitCols = ['IP', 'BF', 'PC', '好球', 'K', 'BB', 'HBP', 'H', 'R', 'ER', 'ERA']
for (const [k, want] of Object.entries(PIT)) {
  const r = s.pit.rows.find((x) => x[0] === N[k]); if (!r) { bad++; console.log(`✗ 投手 ${N[k]} 沒出現`); continue }
  pitCols.forEach((c, i) => cmp(`${N[k]} ${c}`, r[s.pit.heads.indexOf(c)], want[i]))
}
const line = s.lineText.match(/喝FIN就好BA\t([\d\t]+)\n模擬隊三\t([\d\t]+)/)
cmp('局分表 我隊', line?.[1].trim().split('\t').join(' '), LINE.us)
cmp('局分表 對手', line?.[2].trim().split('\t').join(' '), LINE.opp)
// 投球 page, 進階: BK for the pitcher who balked (the opponent's balk counts for nobody)
{
  const col = s.adv.heads.indexOf('BK')
  const row = (name) => s.adv.rows.find((x) => x.some((c) => c === name || c.startsWith(`${name} `) || c.startsWith(name)))
  cmp('投球 進階 BK 欄', col >= 0, true)
  cmp(`${N.B4} BK`, row(N.B4)?.[col], 1)
  cmp(`${N.S9} BK`, row(N.S9)?.[col] ?? '0', '0')
}
// the play-by-play says what happened
for (const [tab, words] of [['逐球・打擊', ['突破僵局', '投手犯規', '不算打席']], ['逐球・投球', ['突破僵局', '投手犯規', '投手犯規 1']]]) {
  for (const w of words) cmp(`${tab} 有「${w}」`, (s.pbp[tab] ?? '').includes(w), true)
}
cmp('紀錄時的提醒', s.notes.length, 0)
if (s.notes.length) console.log(s.notes.join('\n'))
cmp('網頁錯誤', s.errs.length, 0)
console.log(bad ? `共 ${bad} 處不符` : `全部相符：打者 ${Object.keys(BAT).length} 人 × ${batCols.length} 項、投手 2 人 × ${pitCols.length} 項、局分表、BK、逐球`)
process.exitCode = bad ? 1 : 0
