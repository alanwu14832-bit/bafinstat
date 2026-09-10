/**
 * One- or two-sentence explanations shown when the pointer rests on a stat name. Keyed by the label as it
 * appears in the UI (abbreviation or Chinese header); `hintFor` normalises composite labels like "團隊 K / BB".
 * Formulas live in stat_dictionary.json; this is the plain-language layer on top of it.
 */
export interface Hint { title: string; text: string }

const H: Record<string, Hint> = {
  G: { title: '出賽數', text: '有打席紀錄的比賽場數。' },
  PA: { title: '打席', text: '站上打擊區的次數，四壞、觸身、犧牲打都算。' },
  AB: { title: '打數', text: '打席扣掉四壞、觸身、犧牲打與妨礙；打擊率的分母。' },
  R: { title: '得分', text: '跑回本壘的次數。' },
  H: { title: '安打', text: '一安、二安、三安與全壘打的總數。' },
  '2B': { title: '二壘安打', text: '靠自己的擊球跑上二壘的安打。' },
  '3B': { title: '三壘安打', text: '靠自己的擊球跑上三壘的安打。' },
  HR: { title: '全壘打', text: '一棒繞回本壘的安打。' },
  TB: { title: '壘打數', text: '安打換算的壘包數：一安 1、二安 2、三安 3、全壘打 4。' },
  XBH: { title: '長打', text: '二安、三安與全壘打的總數。' },
  RBI: { title: '打點', text: '因這個打席而回來的分數，失誤與雙殺打不計。' },
  BB: { title: '四壞球', text: '保送上壘的次數，含故意四壞。' },
  IBB: { title: '故意四壞', text: '對方刻意投出的四壞球保送。' },
  HBP: { title: '觸身球', text: '被投球打到而上壘的次數。' },
  SO: { title: '三振', text: '三好球出局的次數，含不死三振。' },
  K: { title: '三振', text: '投手三振打者的次數。' },
  SH: { title: '犧牲觸擊', text: '用觸擊讓跑者推進、自己出局的打席，不算打數。' },
  SF: { title: '犧牲飛球', text: '飛球出局但讓三壘跑者回來得分，不算打數。' },
  GIDP: { title: '雙殺打', text: '一球造成兩個出局的打席。' },
  SB: { title: '盜壘', text: '盜壘成功的次數。' },
  CS: { title: '盜壘失敗', text: '盜壘被觸殺出局的次數。' },
  'SB%': { title: '盜壘成功率', text: '盜壘成功 ÷（成功 + 失敗）。' },
  AVG: { title: '打擊率', text: '安打 ÷ 打數。業餘球隊 .300 以上算穩定的打者。' },
  OBP: { title: '上壘率', text: '安打、四壞、觸身加總後，除以所有算進去的打席；衡量「不出局」的能力。' },
  SLG: { title: '長打率', text: '壘打數 ÷ 打數，一支全壘打抵四支一安；衡量長打火力。' },
  OPS: { title: '整體攻擊指數', text: '上壘率 + 長打率，最常用的一個數字看打者綜合攻擊力。' },
  'OPS+': { title: '調整後攻擊指數', text: '把 OPS 和同一篩選範圍的全隊比較：100 是隊平均，120 代表高出兩成。' },
  ISO: { title: '純長打率', text: '長打率減打擊率，只看額外壘包的能力。' },
  BABIP: { title: '場內球安打率', text: '扣掉全壘打與三振後，打進場內的球形成安打的比率；偏高或偏低常有運氣成分。' },
  wOBA: { title: '加權上壘率', text: '每種上壘方式依實際得分價值加權（全壘打比保送重得多），比 OPS 更準確。' },
  'K%': { title: '三振率', text: '三振 ÷ 打席（投手則 ÷ 面對打者）。' },
  'BB%': { title: '保送率', text: '四壞球 ÷ 打席（投手則 ÷ 面對打者）。' },
  'BB/K': { title: '保送三振比', text: '四壞球 ÷ 三振，看選球與擊球紀律。' },
  'K/BB': { title: '三振保送比', text: '三振 ÷ 四壞球，投手的控球與壓制力。' },
  'K / BB': { title: '三振保送比', text: '三振 ÷ 四壞球，投手的控球與壓制力。' },
  RISP_AVG: { title: '得點圈打擊率', text: '打席開始時二、三壘有跑者的打擊率，看關鍵時刻的發揮。' },
  'RISP AVG': { title: '得點圈打擊率', text: '打席開始時二、三壘有跑者的打擊率，看關鍵時刻的發揮。' },
  '得點圈 AVG': { title: '得點圈打擊率', text: '打席開始時二、三壘有跑者的打擊率，看關鍵時刻的發揮。' },
  'QAB%': { title: '優質打席率', text: '安打、上壘、有打點、纏鬥到 6 球以上或強勁擊球的打席比率；不看結果看過程。' },
  'P/PA': { title: '每打席用球數', text: '平均每個打席讓投手投幾球，越高越能消耗對方。' },
  'Swing%': { title: '揮棒率', text: '揮棒的球數 ÷ 總球數。' },
  'Whiff%': { title: '揮空率', text: '揮棒落空 ÷ 揮棒次數；打者越低越好，投手越高越好。' },
  'Contact%': { title: '擊球率', text: '揮棒時碰到球的比率。' },
  'FirstPitchSwing%': { title: '首球揮棒率', text: '第一球就出棒的打席比率。' },
  'GB%': { title: '滾地球率', text: '場內球中滾地球的比率。' },
  'FB%': { title: '飛球率', text: '場內球中飛球的比率。' },
  'LD%': { title: '平飛球率', text: '場內球中平飛球的比率；平飛球最容易變成安打。' },
  'Hard%': { title: '強勁擊球率', text: '紀錄為「強」的場內球比率，近似 Statcast 的 Hard-Hit%。' },
  'Pull%': { title: '拉打率', text: '打向慣用手同側（右打往左半邊）的場內球比率。' },
  'Oppo%': { title: '反方向率', text: '推打到反方向的場內球比率。' },
  GS: { title: '先發', text: '擔任該場第一位投手的次數。' },
  W: { title: '勝投', text: '取得勝投的場數。' },
  L: { title: '敗投', text: '承擔敗投的場數。' },
  SV: { title: '救援成功', text: '守住領先到比賽結束的次數。' },
  HLD: { title: '中繼成功', text: '中繼登板守住領先的次數。' },
  IP: { title: '投球局數', text: '製造的出局數 ÷ 3；x.1 表示多一個出局，x.2 多兩個。' },
  BF: { title: '面對打者', text: '投手面對的打席數。' },
  PC: { title: '用球數', text: '投出的球數，含好球、界外、壞球。' },
  'Strike%': { title: '好球率', text: '好球與界外 ÷ 用球數。' },
  ER: { title: '責失分', text: '不是因守備失誤造成的失分，防禦率只算這個。' },
  WP: { title: '暴投', text: '投手投得太偏讓跑者推進的次數。' },
  PK: { title: '牽制出局', text: '牽制把跑者抓出局的次數。' },
  SBA: { title: '被盜壘', text: '對方在這位投手面前盜壘成功的次數。' },
  ERA: { title: '防禦率', text: '責失分換算成每場（預設 7 局）的失分，越低越好。' },
  WHIP: { title: '每局被上壘率', text: '（被安打 + 四壞）÷ 局數，看投手每局讓多少人上壘。' },
  'K/9': { title: '每九局三振', text: '三振數換算成 9 局的比率。' },
  'BB/9': { title: '每九局保送', text: '四壞球換算成 9 局的比率，越低控球越好。' },
  'H/9': { title: '每九局被安打', text: '被安打換算成 9 局的比率。' },
  OppAVG: { title: '被打擊率', text: '對方打者面對這位投手的打擊率。' },
  被打擊率: { title: '被打擊率', text: '對方打者面對這位投手的打擊率。' },
  OppOBP: { title: '被上壘率', text: '對方打者面對這位投手的上壘率。' },
  FIP: { title: '獨立防禦率', text: '只用三振、四壞、觸身、全壘打算出的防禦率，排除守備與運氣的影響。' },
  'CSW%': { title: '好球＋揮空率', text: '（未揮好球 + 揮空）÷ 用球數，投手壓制力的核心過程指標，30% 以上很好。' },
  'FStrike%': { title: '首球好球率', text: '第一球就搶到好球的打席比率。' },
  首球好球率: { title: '首球好球率', text: '第一球就搶到好球的打席比率。' },
  'P/IP': { title: '每局用球數', text: '平均每局投幾球，看投手效率。' },
  'P/BF': { title: '每打席用球數', text: '平均對每位打者投幾球。' },
  'LOB%': { title: '殘壘率', text: '上壘的跑者中沒有回來得分的比率。' },
  QS: { title: '優質先發', text: '先發投滿規定局數且責失分不超過 3 分。' },
  Inn: { title: '守備局數', text: '在該守位守了幾局。' },
  PO: { title: '刺殺', text: '直接讓跑者或打者出局：接殺、踩壘、觸殺、捕手接三振。' },
  A: { title: '助殺', text: '傳球給隊友完成出局，例如游擊手傳一壘。' },
  E: { title: '失誤', text: '本來能出局卻沒成功，讓對方上壘或推進。' },
  失誤: { title: '失誤', text: '本來能出局卻沒成功，讓對方上壘或推進。' },
  DP: { title: '雙殺', text: '參與完成雙殺的次數。' },
  雙殺: { title: '雙殺', text: '參與完成雙殺的次數。' },
  TC: { title: '守備機會', text: '刺殺 + 助殺 + 失誤，也就是處理過幾次球。' },
  FPCT: { title: '守備率', text: '（刺殺 + 助殺）÷ 守備機會，成功處理的比率。' },
  團隊守備率: { title: '守備率', text: '（刺殺 + 助殺）÷ 守備機會，全隊成功處理球的比率。' },
  'RF/G': { title: '守備範圍因子', text: '每場（刺殺 + 助殺），看守備員實際處理了多少球。' },
  PB: { title: '捕逸', text: '捕手該接住卻漏掉，讓跑者推進的次數。' },
  'CS%': { title: '阻殺率', text: '捕手抓到盜壘 ÷（被盜壘 + 阻殺）。' },
  捕手阻殺率: { title: '阻殺率', text: '捕手抓到盜壘 ÷（被盜壘 + 阻殺）。' },
  阻殺: { title: '阻殺', text: '捕手把盜壘跑者傳殺出局的次數。' },
  被盜: { title: '被盜壘', text: '對方盜壘成功的次數。' },
  被安打: { title: '被安打', text: '投手被擊出的安打數。' },
  用球: { title: '用球數', text: '這場投出或讓對方投出的球數。' },
  投手用球: { title: '投手用球', text: '我隊投手這場的總用球數。' },
  好球: { title: '好球數', text: '好球與界外的合計。' },
  安打: { title: '安打', text: '一安、二安、三安與全壘打的總數。' },
  殘壘: { title: '殘壘', text: '半局結束時還留在壘上、沒有回來得分的跑者。' },
  '單場 AVG': { title: '單場打擊率', text: '這一場的安打 ÷ 打數。' },
  勝率: { title: '勝率', text: '勝場 ÷（勝 + 敗），和局不計。' },
  '戰績（勝-敗-和）': { title: '戰績', text: '目前篩選範圍內的勝、敗、和場數。' },
  得失分差: { title: '得失分差', text: '總得分減總失分，正數代表淨勝分。' },
  每場得分: { title: '每場得分', text: '平均每場比賽得幾分。' },
  團隊打擊率: { title: '團隊打擊率', text: '全隊安打 ÷ 全隊打數。' },
  'K% / BB%': { title: '三振率／保送率', text: '三振與四壞球各佔打席的比率。' },
  'Whiff% / Hard%': { title: '揮空率／強勁擊球率', text: '揮空 ÷ 揮棒，以及紀錄為「強」的場內球比率。' },
}

const STRIP = [/^團隊\s*/, /^單場\s*/]
const ALIASES: Record<string, string> = { 防禦率: 'ERA', 打擊率: 'AVG', 上壘率: 'OBP', 長打率: 'SLG', 打點: 'RBI', 三振: 'SO', 保送: 'BB', 盜壘: 'SB', 得分: 'R', 打席: 'PA', 打數: 'AB', 全壘打: 'HR', 局數: 'IP' }

/** Hint for a label as shown in the UI, or null when we have nothing short to say about it. */
export function hintFor(label: unknown): Hint | null {
  if (typeof label !== 'string') return null
  const raw = label.trim()
  if (!raw) return null
  if (H[raw]) return H[raw]
  let t = raw
  for (const re of STRIP) t = t.replace(re, '')
  if (H[t]) return H[t]
  // "打擊率 AVG" / "上壘率 OBP" → last token
  const last = t.split(/\s+/).pop() ?? ''
  if (H[last]) return H[last]
  if (ALIASES[t]) return H[ALIASES[t]]
  return null
}
