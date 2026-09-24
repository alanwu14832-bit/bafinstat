/**
 * Where each 數據字典 term can be seen ranked: the table, tab and sort column (lower-is-better rates sort
 * ascending). Terms with no column on the site (IBB, SH, SF, FC, QS) have no link.
 */
type Link = [page: 'batting' | 'pitching' | 'fielding', view: 'basic' | 'advanced' | 'process' | '', sort: string, dir?: 'asc']

const L: Record<string, Link> = {
  G: ['batting', '', 'g'], PA: ['batting', '', 'pa'], AB: ['batting', '', 'ab'], R: ['batting', '', 'r'], H: ['batting', '', 'h'],
  '2B': ['batting', '', 'h2'], '3B': ['batting', '', 'h3'], HR: ['batting', '', 'hr'], RBI: ['batting', '', 'rbi'], BB: ['batting', '', 'bb'],
  HBP: ['batting', '', 'hbp'], SO: ['batting', '', 'so'], SB: ['batting', '', 'sb'], CS: ['batting', '', 'cs'],
  AVG: ['batting', '', 'avg'], OBP: ['batting', '', 'obp'], SLG: ['batting', '', 'slg'], OPS: ['batting', '', 'ops'], 'OPS+': ['batting', '', 'opsPlus'],
  TB: ['batting', 'advanced', 'tb'], XBH: ['batting', 'advanced', 'xbh'], GIDP: ['batting', 'advanced', 'gidp'], ROE: ['batting', 'advanced', 'roe'],
  'SB%': ['batting', 'advanced', 'sbPct'], ISO: ['batting', 'advanced', 'iso'], BABIP: ['batting', 'advanced', 'babip'], wOBA: ['batting', 'advanced', 'woba'],
  'K%': ['batting', 'advanced', 'kPct', 'asc'], 'BB%': ['batting', 'advanced', 'bbPct'], 'BB/K': ['batting', 'advanced', 'bbK'],
  RISP_AVG: ['batting', 'advanced', 'rispAvg'], 'QAB%': ['batting', 'advanced', 'qabPct'],
  'P/PA': ['batting', 'process', 'pPerPA'], 'Swing%': ['batting', 'process', 'swingPct'], 'Whiff%': ['batting', 'process', 'whiffPct', 'asc'],
  'Contact%': ['batting', 'process', 'contactPct'], 'FirstPitchSwing%': ['batting', 'process', 'fpsPct'], 'GB%': ['batting', 'process', 'gbPct'],
  'FB%': ['batting', 'process', 'fbPct'], 'LD%': ['batting', 'process', 'ldPct'], 'Hard%': ['batting', 'process', 'hardPct'],
  'Pull%': ['batting', 'process', 'pullPct'], 'Oppo%': ['batting', 'process', 'oppoPct'],
  pG: ['pitching', '', 'g'], GS: ['pitching', '', 'gs'], W: ['pitching', '', 'w'], L: ['pitching', '', 'l'], SV: ['pitching', '', 'sv'], HLD: ['pitching', '', 'hld'],
  IP: ['pitching', '', 'outs'], BF: ['pitching', '', 'bf'], PC: ['pitching', '', 'pc'], pK: ['pitching', '', 'k'], pBB: ['pitching', '', 'bb'],
  pHBP: ['pitching', '', 'hbp'], pH: ['pitching', '', 'h'], pHR: ['pitching', '', 'hr'], pR: ['pitching', '', 'r'], ER: ['pitching', '', 'er'],
  ERA: ['pitching', '', 'era', 'asc'], WHIP: ['pitching', '', 'whip', 'asc'],
  WP: ['pitching', 'advanced', 'wp'], PK: ['pitching', 'advanced', 'pk'], SBA: ['pitching', 'advanced', 'sba'],
  'K/9': ['pitching', 'advanced', 'k9'], 'BB/9': ['pitching', 'advanced', 'bb9', 'asc'], 'H/9': ['pitching', 'advanced', 'h9', 'asc'],
  'K/BB': ['pitching', 'advanced', 'kbb'], 'pK%': ['pitching', 'advanced', 'kPct'], 'pBB%': ['pitching', 'advanced', 'bbPct', 'asc'],
  OppAVG: ['pitching', 'advanced', 'oppAvg', 'asc'], OppOBP: ['pitching', 'advanced', 'oppObp', 'asc'], pBABIP: ['pitching', 'advanced', 'babip', 'asc'],
  FIP: ['pitching', 'advanced', 'fip', 'asc'], 'LOB%': ['pitching', 'advanced', 'lobPct'],
  'Strike%': ['pitching', 'process', 'strikePct'], 'FStrike%': ['pitching', 'process', 'fStrikePct'], 'CSW%': ['pitching', 'process', 'cswPct'],
  'pWhiff%': ['pitching', 'process', 'whiffPct'], 'pGB%': ['pitching', 'process', 'gbPct'],
  'P/IP': ['pitching', 'process', 'pPerIP', 'asc'], 'P/BF': ['pitching', 'process', 'pPerBF', 'asc'],
  fG: ['fielding', '', 'g'], Inn: ['fielding', '', 'innings'], PO: ['fielding', '', 'po'], A: ['fielding', '', 'a'], E: ['fielding', '', 'e'],
  DP: ['fielding', '', 'dp'], TC: ['fielding', '', 'tc'], FPCT: ['fielding', '', 'fpct'], 'RF/G': ['fielding', '', 'rfg'], PB: ['fielding', '', 'pb'],
  cSB: ['fielding', '', 'sb'], cCS: ['fielding', '', 'cs'], 'CS%': ['fielding', '', 'csPct'],
}
const TEAM: Record<string, string> = { WinPct: '/games?view=results', RunDiff: '/', LOB: '/games?view=results' }

export function statLink(key: string): string | null {
  if (TEAM[key]) return TEAM[key]
  const l = L[key]
  if (!l) return null
  const [page, view, sort, dir] = l
  const q = new URLSearchParams()
  if (view) q.set('view', view)
  q.set('sort', sort)
  if (dir) q.set('dir', dir)
  return `/${page}?${q.toString()}`
}
