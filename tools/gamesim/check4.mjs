// the answer key for game4.mjs (代打之後改守位, batch 17), compared with what the site saved and displayed
import { readFileSync } from 'node:fs'
const s = JSON.parse(readFileSync(process.argv[2] ?? 'game4-shown.json', 'utf8'))
const N = s.N
let bad = 0
const cmp = (what, got, want) => { if (String(got) !== String(want)) { bad++; console.log(`✗ ${what}: 網站 ${got}，正確 ${want}`) } }
// each error to whoever stood at that position in that half-inning: S1 at SS in the 1st, B1 at SS and S1 at 1B in the 2nd
const E = (player, pos) => s.fielding.filter((f) => f.player === player && f.pos === pos).reduce((a, f) => a + f.e, 0)
cmp(`${N.S1} 游擊 E`, E(N.S1, 'SS'), 1)
cmp(`${N.B1} 游擊 E`, E(N.B1, 'SS'), 1)
cmp(`${N.S1} 一壘 E`, E(N.S1, '1B'), 1)
cmp(`${N.S3} E（他在 1 下就被代打換下）`, s.fielding.filter((f) => f.player === N.S3).reduce((a, f) => a + f.e, 0), 0)
cmp('全隊 E', s.fielding.reduce((a, f) => a + f.e, 0), 3)
// 守備局數: S1 played SS in the 1st and 1B in the 2nd; B1 SS in the 2nd; S3 1B in the 1st
const inn = (player, pos) => s.fielding.find((f) => f.player === player && f.pos === pos)?.innings
cmp(`${N.S1} 游擊 局數`, inn(N.S1, 'SS'), 1)
cmp(`${N.S1} 一壘 局數`, inn(N.S1, '1B'), 1)
cmp(`${N.B1} 游擊 局數`, inn(N.B1, 'SS'), 1)
cmp(`${N.S3} 一壘 局數`, inn(N.S3, '1B'), 1)
cmp(`${N.S2} 捕手 局數`, inn(N.S2, 'C'), 2)
// the 當日登錄名單 logged both position changes
const moves = (s.game?.dayRoster?.subs ?? []).filter((x) => x.in === x.out).map((x) => `${x.in} ${x.pos} ${x.inning}${x.half === 'top' ? '上' : '下'}`)
cmp('守備調動', moves.join('、'), `${N.B1} SS 2上、${N.S1} 1B 2上`)
// the game page says so: 比賽附註 失誤, 逐局表 代打-SS, 登錄名單 換守位, 文字轉播 守備異動
cmp('比賽附註 失誤', /失誤\s*([^ ]+、?[^ ]*)/.test(s.boxText) && s.boxText.includes(`${N.S1} 2`) && s.boxText.includes(N.B1), true)
cmp(`逐局表 ${N.B1} 代打-SS`, s.gridText.includes('代打-SS'), true)
cmp(`逐局表 ${N.S1} SS-1B`, s.gridText.includes('SS-1B'), true)
cmp('登錄名單 換守位', s.rosterText.includes('換守位') && s.rosterText.includes('改守 SS') && s.rosterText.includes('改守 1B'), true)
cmp('文字轉播 守備異動', s.feedText.includes(`守備異動：${N.B1} 改守游擊手`) && s.feedText.includes(`守備異動：${N.S1} 改守一壘手`), true)
cmp('紀錄時的提醒', s.notes.length, 0)
if (s.notes.length) console.log(s.notes.join('\n'))
cmp('網頁錯誤', s.errs.length, 0)
console.log(bad ? `共 ${bad} 處不符` : '全部相符：失誤歸屬（游擊 2 人、一壘 1 人）、守備局數、守備調動、比賽附註、逐局表、登錄名單、文字轉播')
process.exitCode = bad ? 1 : 0
