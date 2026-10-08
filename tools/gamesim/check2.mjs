// the answer key for gamesim.mjs (what the video shows), compared with what the site displayed
import { readFileSync } from 'node:fs'
const s = JSON.parse(readFileSync(process.argv[2] ?? 'game2-shown.json', 'utf8'))
const N = s.N
// 打者: PA AB R H 2B HR RBI BB SO SB
const BAT = {
  S1: [3, 2, 2, 2, 1, 0, 0, 1, 0, 0], S2: [3, 2, 1, 1, 0, 0, 0, 0, 0, 0], S3: [3, 2, 2, 0, 0, 0, 0, 1, 1, 0], S4: [3, 3, 1, 2, 2, 0, 4, 0, 0, 0],
  S5: [2, 1, 1, 0, 0, 0, 0, 0, 1, 0], S6: [1, 1, 0, 0, 0, 0, 1, 0, 0, 0], B3: [1, 1, 1, 1, 0, 0, 0, 0, 0, 0], S7: [2, 2, 0, 0, 0, 0, 0, 0, 0, 0],
  S8: [2, 1, 0, 1, 0, 0, 2, 1, 0, 0], S9: [2, 2, 0, 1, 0, 0, 0, 0, 0, 1],
}
// 投手: IP BF PC 好球 K BB HBP H R ER ERA(7 局制)
const PIT = { S9: ['3.0', 12, 27, 17, 2, 1, 0, 5, 3, 2, '4.67'], B4: ['1.0', 7, 11, 9, 1, 0, 0, 4, 4, 4, '28.00'] }
const LINE = { us: '5 0 1 2 8 8 1', opp: '0 1 0 6 7 9 1' }
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
const line = s.lineText.match(/模擬隊二\t([\d\t]+)\n喝FIN就好BA\t([\d\t]+)/)
cmp('局分表 我隊', line?.[2].trim().split('\t').join(' '), LINE.us)
cmp('局分表 對手', line?.[1].trim().split('\t').join(' '), LINE.opp)
cmp('紀錄時的提醒', s.notes.length, 0)
console.log(bad ? `共 ${bad} 處不符` : `全部相符：打者 ${Object.keys(BAT).length} 人 × ${batCols.length} 項、投手 2 人 × ${pitCols.length} 項、局分表`)
