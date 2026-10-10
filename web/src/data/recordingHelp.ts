/**
 * How to record, in words shared by the 使用指南 and the printable 紀錄員小抄 (/guide/cheatsheet): change a definition
 * here and both follow.
 */
import { isPA, type Dataset } from './types'

/** 打擊結果: what each result button means (the guide's 「打擊結果怎麼填」 card and the cheat sheet). */
export const RESULT_HELP: Array<[string, string]> = [
  ['一安 / 二安 / 三安 / 全壘打', '安打'], ['內安', '內野安打：球沒出內野就安全上壘，算一壘安打；預設只有被迫的跑者進壘'], ['場地二安', '球落地後彈出全壘打牆或卡在牆上：算二壘安打，所有跑者都只能進兩個壘'], ['保送 / 故四 / 觸身', '四壞、故意四壞、觸身球（不算打數）'], ['三振', '含不死三振'],
  ['內滾 / 內飛 / 外飛', '出局；軌跡欄填 G 滾地、F 飛球、L 平飛'], ['界外飛', '界外飛球被接殺；落點填接球的守備員，最後一球記 IP'], ['野選', '野手選擇，讓壘上跑者出局'], ['失誤', '靠對方失誤上壘（不算安打）'],
  ['犧觸 / 犧飛', '犧牲觸擊、犧牲飛球（不算打數）'], ['雙殺', '打成雙殺打（這一列算 2 個出局）'], ['妨礙', '捕手妨礙上壘'],
  ['突破僵局', '延長賽照規則放上壘的跑者，不是打席（不算打席、打數）'],
]

/** 強／中／弱: how hard the ball left the bat. */
export const CONTACT_HELP: Array<[string, string]> = [
  ['強', '球離棒又快又直、聲音扎實——穿過內野的平飛球、內野手來不及動的強勁滾地球、讓外野手往後退很多的深遠飛球。'],
  ['中', '一般的擊球，守備員正常移動就能處理。'],
  ['弱', '沒打好——打到球棒前端或根部、軟弱滾地、觸擊、高高的內野飛球、運氣好落地的小飛球。'],
]
/** The rule of thumb under the three. */
export const CONTACT_RULE = '只看球離開球棒時有多強，不看結果：被接殺的強勁平飛仍是強，德州安打是弱。不確定時選中，但真的很強、很軟的球要記出來——全記中的話 Hard%、優質打席就沒有意義。'

/** 落點: the fielder who handled the ball, or the gap a ball nobody touched went through. */
export const LOC_HELP = {
  rule: '記處理球的人（接到、撿到或第一個碰到球的守備員）；沒人碰到的安打記縫隙。',
  fielders: [[1, '投手 P'], [2, '捕手 C'], [3, '一壘 1B'], [4, '二壘 2B'], [5, '三壘 3B'], [6, '游擊 SS'], [7, '左外野 LF'], [8, '中外野 CF'], [9, '右外野 RF']] as Array<[number, string]>,
  holes: [[56, '三游'], [46, '二游'], [34, '一二'], [78, '左中'], [89, '右中']] as Array<[number, string]>,
}

/** 軌跡 */
export const TRAJ_HELP: Array<[string, string]> = [['G', '滾地'], ['F', '飛球'], ['L', '平飛'], ['P', '內野飛球（高高的小飛球，算飛球的一種）']]

/** 結果代碼 (the 代碼 column): filled in by the site on 紀錄比賽. */
export const CODE_HELP: Array<[string, string]> = [
  ['I／II／III', '這個打席造成這半局第 1／2／3 個出局'], ['L', '殘壘'], ['R', '得分；投球表是非自責失分'], ['ER', '投球表：自責分'],
]

/** Results with no batted ball (no 落點／軌跡／強度). */
const NO_BALL = new Set(['三振', '保送', '故四', '觸身', '妨礙'])

/** How the team has been calling 強／中／弱 so far: shares of the balls in play that have one (both sides). */
export function contactShare(ds: Pick<Dataset, 'batting' | 'pitching'>): { 強: number; 中: number; 弱: number; n: number } {
  const c = { 強: 0, 中: 0, 弱: 0 }
  for (const r of [...ds.batting, ...ds.pitching]) {
    if (!isPA(r) || NO_BALL.has(r.result)) continue
    if (r.quality === '強' || r.quality === '中' || r.quality === '弱') c[r.quality] += 1
  }
  const n = c.強 + c.中 + c.弱
  return n ? { 強: c.強 / n, 中: c.中 / n, 弱: c.弱 / n, n } : { 強: 0, 中: 0, 弱: 0, n: 0 }
}
