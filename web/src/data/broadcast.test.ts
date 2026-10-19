import { describe, expect, it } from 'vitest'
import {
  basesLine, batterLabel, boardInning, buildFeed, countText, halfSummary, halfTitle, itemText, latestItem, liveSourceOf, oppPinchHitSub, oppPinchRunSub, oppPitcherToday,
  oppPitchSub, oppStintRows, paSentence, pitcherToday, pitchList, pitchTokens, playPhrase, playsSentence, resultText, subText, upList, zhInning,
  type FeedHalf, type FeedItem, type FeedSource,
} from './broadcast'
import { PA_RESULTS, PLAY_EVENT_LABELS, isPA, type BattingPA, type Game, type PitchingPA } from './types'
import {
  addPitch, changePitcher, commitPA, defaultPlan, newGame, oppPitchCount, pinchHitOpp, pinchRunOpp, runnerEvent, score, setOppBats, setOppPitcher, substitute, correctOppPitcher,
  type PAPlan, type RecordState,
} from '../record/model'
import { placeTiebreak } from '../record/tiebreak'
import { playGame, playGameWith } from '../test/simGame'

const B = (x: Partial<BattingPA> = {}): BattingPA => ({ gameId: 'g', inning: 1, batter: '王小明', order: 3, pitches: ['IP'], result: '一安', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...x })
const P = (x: Partial<PitchingPA> = {}): PitchingPA => ({ gameId: 'g', inning: 1, pitcher: '投', oppOrder: 3, pitches: ['IP'], result: '一安', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...x })

const LINEUP = ['林昱丞', '陳威任', '劉哲宏', '蘇柏愷', '吳藹倫', '謝昊瑾', '劉品辰', '梁睿至', '蔡奇霖']
const POS = ['CF', 'SS', 'LF', '1B', 'RF', '3B', '2B', 'P', 'C']
const GAME: Game = { id: 'G20261020-01', date: '2026-10-20', tournament: '系際盃', opponent: '模擬隊', homeAway: '客', innings: 7 }
const start = (g: Partial<Game> = {}, opts: Parameters<typeof newGame>[3] = {}) => newGame({ ...GAME, ...g }, LINEUP.map((name, i) => ({ name, pos: POS[i] })), '梁睿至', { bench: ['王大同', '許振謙', '謝小明'], ...opts })
const pitch = (s: RecordState, ps: string[]) => ps.reduce((a, p) => addPitch(a, p), s)
const pa = (s: RecordState, ps: string[], result: string, edit?: (plan: PAPlan, s: RecordState) => void) => {
  s = pitch(s, ps)
  const plan = defaultPlan(s, result)
  edit?.(plan, s)
  return commitPA(s, plan)
}
const feed = (s: RecordState, live = false): FeedHalf[] => buildFeed({ homeAway: s.game.homeAway, opponent: s.game.opponent, batting: s.batting, pitching: s.pitching, subs: s.subs, ...(live ? { live: liveSourceOf(s) } : {}) })
const all = (h: FeedHalf[]) => h.flatMap((x) => x.items)
const pas = (h: FeedHalf[]) => all(h).filter((i): i is Extract<FeedItem, { kind: 'pa' }> => i.kind === 'pa')
const texts = (h: FeedHalf[]) => all(h).map(itemText)
const runner = (s: RecordState, name: string) => s.runners.find((r) => r.name === name)!.row
const at = (s: RecordState, base: number) => s.runners.find((r) => r.base === base)!.row
/** the running score of the last scoring item (0:0 without one) */
const lastScore = (h: FeedHalf[]) => { const sc = all(h).filter((i) => (i.kind === 'pa' || i.kind === 'event' || i.kind === 'live') && i.score).at(-1) as { score?: { away: number; home: number } } | undefined; return sc?.score ?? { away: 0, home: 0 } }
const expected = (s: RecordState) => { const sc = score(s); return s.game.homeAway === '客' ? { away: sc.us, home: sc.opp } : { away: sc.opp, home: sc.us } }

describe('formats', () => {
  it('innings, count, summary, pitches', () => {
    expect([1, 3, 9, 10, 12, 13].map(zhInning)).toEqual(['一', '三', '九', '十', '十二', '13'])
    expect(boardInning(5, 'top')).toBe('5局上')
    expect(halfTitle(3, 'bottom', 'opp')).toBe('三局下 對方進攻')
    expect(halfTitle(1, 'top', 'us')).toBe('一局上 我隊進攻')
    expect(halfSummary({ r: 2, h: 3, e: 0, lob: 1 })).toBe('2 分・3 安打・0 失誤・1 殘壘')
    expect(countText({ balls: 1, strikes: 2 })).toBe('1-2')
    expect(pitchTokens(['B', 'CS', 'S', 'SS', 'F', 'IP', 'X'])).toBe('壞 好 好 空 界 擊 X')
    expect(pitchList(['B', 'CS', 'SS', 'F', 'IP']).map((p) => `${p.n} ${p.word} ${p.count}`)).toEqual(['1 壞球 1-0', '2 好球沒揮棒 1-1', '3 揮棒落空 1-2', '4 擊出界外球 1-2', '5 擊出 1-2'])
  })
  it('the board lines', () => {
    expect(basesLine([{ base: 1, name: '陳威任' }, { base: 3, name: '林昱丞' }])).toBe('三壘 林昱丞・一壘 陳威任')
    expect(basesLine([])).toBe('無人')
    expect(upList([{ us: true, order: 7, name: '謝昊瑾', avg: '.250' }, { us: true, order: 8, name: '劉哲宏' }])).toBe('7 謝昊瑾 .250・8 劉哲宏')
    expect(upList([{ us: false, order: 8, name: '' }, { us: false, order: 9, name: '' }])).toBe('第 8、9 棒')
    expect(upList([{ us: false, order: 4, name: '' }, { us: false, order: 5, name: '' }, { us: false, order: 6, name: '' }], { opp: true })).toBe('對方第 4、5、6 棒')
    expect(upList([{ us: false, order: 4, name: '陳' }, { us: false, order: 5, name: '' }])).toBe('4 陳・第 5 棒')
  })
})

describe('3.1 every result, both sides', () => {
  const RESULTS = [...PA_RESULTS, '犧牲'] as string[]
  const LOCS: Record<string, number> = { 一安: 8, 內安: 5, 二安: 7, 場地二安: 7, 三安: 9, 全壘打: 8, 內滾: 6, 內飛: 4, 外飛: 8, 界外飛: 3, 雙殺: 6, 犧觸: 1, 犧牲: 1, 犧飛: 9, 野選: 5, 失誤: 6 }
  const variants = (r: string) => [{ loc: LOCS[r] ?? 8, traj: 'L' }, { loc: LOCS[r] ?? 8 }, {}]
  it.each(RESULTS)('%s: a clean sentence with the batter in it', (r) => {
    for (const v of variants(r)) {
      const pitches = r === '三振' ? ['S', 'S', 'SS'] : r === '保送' ? ['B', 'B', 'B', 'B'] : ['B', 'IP']
      const rows: Array<[BattingPA | PitchingPA, 'us' | 'opp', string]> = [
        [B({ result: r, pitches, ...v, rbi: 1 }), 'us', '王小明'],
        [P({ result: r, pitches, ...v, oppBatter: '陳大文' }), 'opp', '陳大文'],
        [P({ result: r, pitches, ...v }), 'opp', '對方第 3 棒'],
        [P({ result: r, pitches, ...v, oppBatter: '代打 99號' }), 'opp', '99號'],
        [P({ result: r, pitches, ...v, oppBatter: '對方代打' }), 'opp', '對方第 3 棒'],
      ]
      for (const [row, side, who] of rows) {
        const t = paSentence(row, side)
        expect(t, `${r} ${JSON.stringify(v)}`).toMatch(/。$/)
        expect(t.startsWith(`${who} `)).toBe(true)
        expect(t).not.toMatch(/undefined|NaN| {2}|，，|null/)
        expect(t.length).toBeGreaterThan(who.length + 2)
      }
    }
  })
  const t = (r: string, x: Partial<BattingPA> = {}) => resultText(B({ result: r, ...x }), 'us')
  const o = (r: string, x: Partial<PitchingPA> = {}) => resultText(P({ result: r, ...x }), 'opp')
  it('hits', () => {
    expect(t('一安', { loc: 8, traj: 'L' })).toBe('擊出中外野平飛球，一壘安打')
    expect(t('一安', { loc: 8 })).toBe('擊出中外野方向一壘安打')
    expect(t('一安')).toBe('一壘安打')
    expect(o('一安', { loc: 6, traj: 'G' })).toBe('擊出游擊方向滾地球，一壘安打')
    expect(t('內安', { loc: 5, traj: 'G' })).toBe('擊出三壘方向內野安打')
    expect(o('內安')).toBe('內野安打')
    expect(t('二安', { loc: 7, traj: 'F' })).toBe('擊出左外野高飛球，二壘安打')
    expect(o('二安', { loc: 7 })).toBe('擊出左外野方向二壘安打')
    expect(t('二安')).toBe('二壘安打')
    expect(t('場地二安', { loc: 7, traj: 'F' })).toBe('擊出左外野高飛球，二壘場地安打')
    expect(o('場地二安')).toBe('二壘場地安打')
    expect(t('三安', { loc: 9, traj: 'L' })).toBe('擊出右外野平飛球，三壘安打')
    expect(o('三安')).toBe('三壘安打')
    expect(t('全壘打', { loc: 8, traj: 'F' })).toBe('擊出中外野高飛球，全壘打')
    expect(resultText(B({ result: '全壘打', loc: 8, traj: 'F' }), 'us', { hrNo: 3 })).toBe('擊出中外野高飛球，全壘打（本季第 3 支）')
    expect(o('全壘打')).toBe('全壘打')
    expect(t('二安', { loc: 89, traj: 'L', rbi: 2 })).toBe('擊出右中間平飛球，二壘安打，2 分打點')
  })
  it('outs on balls in play', () => {
    expect(t('內滾', { loc: 6, traj: 'G' })).toBe('擊出游擊方向滾地球，出局')
    expect(o('內滾')).toBe('擊出內野滾地球，出局')
    expect(t('內飛', { loc: 4, traj: 'P' })).toBe('擊出二壘方向內野高飛球，接殺出局')
    expect(o('內飛', { loc: 4, traj: 'L' })).toBe('擊出二壘方向平飛球，接殺出局')
    expect(t('內飛')).toBe('擊出內野高飛球，接殺出局')
    expect(t('外飛', { loc: 8, traj: 'F' })).toBe('擊出中外野高飛球，接殺出局')
    expect(o('外飛', { loc: 8, traj: 'L' })).toBe('擊出中外野平飛球，接殺出局')
    expect(o('外飛')).toBe('擊出外野高飛球，接殺出局')
    expect(t('界外飛', { loc: 3 })).toBe('擊出一壘方向界外飛球，接殺出局')
    expect(o('界外飛')).toBe('擊出界外飛球，接殺出局')
    expect(t('雙殺', { loc: 6, traj: 'G' })).toBe('擊出游擊方向滾地球，雙殺打')
    // (a line drive caught with a runner doubled off: a double play, not the batter's 雙殺打)
    expect(o('雙殺', { loc: 4, traj: 'L' })).toBe('擊出二壘方向平飛球，被接殺，跑者回不去形成雙殺')
    expect(t('雙殺')).toBe('擊出內野滾地球，雙殺打')
    expect(t('犧觸', { loc: 1 })).toBe('擊出投手方向觸擊球，犧牲短打')
    expect(o('犧牲', { loc: 1 })).toBe('擊出投手方向觸擊球，犧牲短打')
    expect(o('犧觸')).toBe('犧牲短打')
    expect(t('犧飛', { loc: 9, traj: 'F', rbi: 1 })).toBe('擊出右外野高飛球，犧牲飛球，1 分打點')
    expect(o('犧飛')).toBe('犧牲飛球')
    expect(t('野選', { loc: 5, traj: 'G' })).toBe('擊出三壘方向滾地球，野手選擇上壘')
    expect(o('野選')).toBe('野手選擇上壘')
  })
  it('失誤: who erred', () => {
    expect(t('失誤', { loc: 6, traj: 'G' })).toBe('擊出游擊方向滾地球，游擊手失誤上壘')
    expect(o('失誤', { loc: 6, traj: 'G' })).toBe('擊出游擊方向滾地球，游擊手失誤上壘')
    // (no 落點: the row's list — theirs on our row, ours on theirs)
    expect(t('失誤', { errors: ['2B'] })).toBe('二壘手失誤上壘')
    expect(o('失誤', { errors: ['SS'] })).toBe('游擊手失誤上壘')
    expect(t('失誤', { errors: ['?'] })).toBe('野手失誤上壘')
    expect(o('失誤')).toBe('野手失誤上壘')
    // (the 落點 is the result's own error: a gap has no fielder, the list then tells)
    expect(t('失誤', { loc: 9 })).toBe('右外野手失誤上壘')
    expect(t('失誤', { loc: 56, traj: 'G', errors: ['3B'] })).toBe('擊出三游間方向滾地球，三壘手失誤上壘')
  })
  it('三振: how it ended, and 不死三振', () => {
    expect(t('三振', { pitches: ['B', 'S', 'F', 'SS'] })).toBe('揮棒落空，三振出局')
    expect(o('三振', { pitches: ['CS', 'S', 'CS'] })).toBe('好球沒揮棒，三振出局')
    expect(t('三振', { pitches: ['S', 'F', 'S'] })).toBe('好球沒揮棒，三振出局')
    expect(o('三振', { pitches: [] })).toBe('三振出局')
    expect(t('三振', { pitches: ['S', 'S', 'SS'], code: 'L' })).toBe('揮棒落空，不死三振上壘')
    expect(o('三振', { pitches: ['S', 'S', 'SS'], code: 'R' })).toBe('揮棒落空，不死三振上壘')
    expect(o('三振', { pitches: ['S', 'S', 'SS'], code: 'II' })).toBe('揮棒落空，三振出局')
  })
  it('the rest', () => {
    expect(t('保送', { pitches: ['B', 'B', 'B', 'B'] })).toBe('四壞球上壘')
    expect(o('故四', { pitches: [] })).toBe('故意四壞球上壘')
    expect(t('觸身')).toBe('觸身死球上壘')
    expect(o('妨礙')).toBe('捕手妨礙打擊上壘')
    expect(paSentence(B({ result: '舊代號' }), 'us')).toBe('王小明 舊代號。')
    expect(paSentence(B({ result: '' }), 'us')).toBe('')
    expect(batterLabel(P({ oppOrder: undefined }), 'opp')).toBe('對方打者')
  })
})

describe('3.3 runner plays and 3.5 substitutions', () => {
  it('every play kind with each place it can end', () => {
    const want: Record<string, Partial<Record<'2' | 'home' | 'out', string>>> = {
      sb: { 2: '盜壘上二壘', home: '盜壘回本壘得分' }, cs: { out: '盜壘刺出局' }, wp: { 2: '投手暴投上二壘', home: '投手暴投回本壘得分' },
      pb: { 2: '捕手捕逸上二壘', home: '捕手捕逸回本壘得分' }, bk: { 2: '投手犯規上二壘', home: '投手犯規回本壘得分' }, err: { 2: '因失誤上二壘', home: '因失誤回本壘得分' },
      throw: { 2: '趁傳上二壘', home: '趁傳回本壘得分' }, pk: { out: '遭牽制出局' }, tag: { out: '被刺殺出局' }, advance: { 2: '上二壘', home: '回本壘得分' }, di: { 2: '在守備無視下上二壘', home: '在守備無視下回本壘得分' }, pocs: { out: '遭牽制後盜壘失敗出局' }, hbb: { out: '被擊出的球打到出局' }, score: { 2: '上二壘', home: '回本壘得分' }, out: { out: '跑壘出局' }, outPlay: { out: '出局' },
    }
    for (const kind of Object.keys(PLAY_EVENT_LABELS).filter((k) => k !== 'pkSafe')) {
      expect(want[kind], kind).toBeTruthy()
      for (const [to, text] of Object.entries(want[kind])) {
        const dest = to === '2' ? 2 : (to as 'home' | 'out')
        expect(playPhrase(kind, dest)).toBe(text)
        // (the battery's plays read cause first, so 「對方第 3 棒投手暴投」 never reads as their pitcher)
        const cause = ({ wp: '投手暴投', pb: '捕手捕逸', bk: '投手犯規' } as Record<string, string>)[kind]
        expect(playsSentence(kind, [{ name: '林昱丞', to: dest }])).toBe(cause ? `${cause}，林昱丞${text.slice(cause.length)}` : `林昱丞${text}`)
      }
    }
    expect(playPhrase('wp', 3)).toBe('投手暴投上三壘')
    expect(playsSentence('wp', [{ name: '對方第 3 棒', to: 'home' }])).toBe('投手暴投，對方第 3 棒回本壘得分')
    expect(playsSentence('wp', [{ name: '林昱丞', to: 'home' }, { name: '陳威任', to: 3 }])).toBe('投手暴投：林昱丞回本壘得分，陳威任上三壘')
    expect(playsSentence('sb', [{ name: '林昱丞', to: 3 }, { name: '陳威任', to: 2 }])).toBe('盜壘：林昱丞上三壘，陳威任上二壘')
    expect(playsSentence('bk', [{ name: 'A', to: 'home' }, { name: 'B', to: 3 }, { name: 'C', to: 2 }])).toBe('投手犯規：A回本壘得分，B上三壘，C上二壘')
  })
  it('substitution lines', () => {
    expect(subText({ kind: 'P', out: '許振謙', in: '梁睿至', pos: 'P' })).toBe('更換投手：許振謙 → 梁睿至')
    expect(subText({ kind: 'PH', out: '蔡奇霖', in: '謝昊瑾', pos: 'PH' })).toBe('更換代打：蔡奇霖 → 謝昊瑾')
    expect(subText({ kind: 'PR', out: '劉品辰', in: '劉哲宏', pos: 'PR' })).toBe('更換代跑：劉品辰 → 劉哲宏')
    expect(subText({ kind: 'DEF', out: 'A', in: 'B', pos: 'CF' })).toBe('更換守備：A → B（中外野手）')
    expect(subText({ kind: 'DEF', out: 'A', in: 'B', pos: 'DH' })).toBe('更換守備：A → B')
    expect(oppPitchSub('右投 王', '左投 林')).toBe('對方更換投手：右投 王 → 左投 林')
    expect(oppPinchHitSub('第 3 棒', '99號')).toBe('對方更換代打：第 3 棒 → 99號')
    expect(oppPinchHitSub('第 3 棒', '')).toBe('對方更換代打：第 3 棒 → 代打')
    expect(oppPinchRunSub('第 3 棒', '12號')).toBe('對方更換代跑：第 3 棒 → 12號')
    expect(oppPinchRunSub('第 3 棒', '對方代跑')).toBe('對方更換代跑：第 3 棒 → 代跑')
  })
})

describe('buildFeed: one game, both sides', () => {
  // 1▲ (we are away): single, steal, RBI double, two strikeouts, a fly out
  const top1 = () => {
    let s = start()
    s = pa(s, ['B', 'CS', 'IP'], '一安', (p) => { p.loc = 8; p.traj = 'L' })
    s = pitch(s, ['B', 'B'])
    s = runnerEvent(s, runner(s, '林昱丞'), 'us', 'sb')
    s = pa(s, ['S', 'IP'], '二安', (p) => { p.loc = 7; p.traj = 'F' })
    s = pa(s, ['S', 'S', 'SS'], '三振')
    s = pa(s, ['B', 'CS', 'S', 'CS'], '三振')
    s = pa(s, ['IP'], '外飛', (p) => { p.loc = 9 })
    return s
  }
  it('sentences, plays, outs, score and the half summary', () => {
    const s = top1()
    const h = feed(s)
    expect(h.map((x) => x.title)).toEqual(['一局上 我隊進攻'])
    expect(texts(h)).toEqual([
      '林昱丞 擊出中外野平飛球，一壘安打。',
      '陳威任 擊出左外野高飛球，二壘安打，1 分打點；林昱丞回本壘得分。',
      '劉哲宏 揮棒落空，三振出局。',
      '蘇柏愷 好球沒揮棒，三振出局。',
      '吳藹倫 擊出右外野高飛球，接殺出局。',
    ])
    const p = pas(h)
    expect(p[1].plays).toEqual(['第 2 球 林昱丞盜壘上二壘'])
    expect(p[1].moves).toEqual([{ at: 2, text: '林昱丞盜壘上二壘' }])
    expect(p[1].score).toEqual({ away: 1, home: 0 })
    expect(p[0].score).toBeUndefined()
    expect(p.map((x) => x.outs)).toEqual([undefined, undefined, 1, 2, 3])
    expect(p[0].meta).toBe('1-1 後・壞 好 擊')
    expect(p[2].meta).toBe('3 球・好 好 空')
    expect(p[1].pitches.map((x) => `${x.word} ${x.count}`)).toEqual(['壞球 1-0', '壞球 2-0', '好球 2-1', '擊出 2-1'])
    expect(h[0].summary).toBe('1 分・2 安打・0 失誤・1 殘壘')
    expect(h[0].done).toBe(true)
  })
  it('row 最新 when we are the away team: the opponent in the bottom half is newer (bug 1)', () => {
    let s = top1()
    s = pa(s, ['B', 'IP'], '內滾', (p) => { p.loc = 6 })
    s = pitch(s, ['B'])
    const h = feed(s, true)
    expect(h.map((x) => x.title)).toEqual(['一局上 我隊進攻', '一局下 對方進攻'])
    expect(itemText(latestItem(h)!)).toBe('對方第 1 棒 擊出游擊方向滾地球，出局。')
    const lv = all(h).at(-1)!
    expect(lv).toMatchObject({ kind: 'live', who: '對方第 2 棒', count: '1-0', tokens: '壞' })
    expect(h[1]).toMatchObject({ done: false, pitcher: '投手 梁睿至' })
    expect(h[1].summary).toBeUndefined()
  })
  it('row 最新 when we are at home: their top half, then ours', () => {
    let s = start({ homeAway: '主' })
    s = pa(s, ['IP'], '一安', (p) => { p.loc = 7; p.traj = 'G' })
    expect(itemText(latestItem(feed(s, true))!)).toBe('對方第 1 棒 擊出左外野滾地球，一壘安打。')
    s = pa(s, ['IP'], '雙殺', (p) => { p.loc = 6 })
    s = pa(s, ['S', 'S', 'S'], '三振')
    s = pa(s, ['IP'], '一安', (p) => { p.loc = 9 })
    const h = feed(s, true)
    expect(h.map((x) => x.title)).toEqual(['一局上 對方進攻', '一局下 我隊進攻'])
    expect(itemText(latestItem(h)!)).toBe('林昱丞 擊出右外野方向一壘安打。')
    // the double play: lead runner out on the play, two outs at once
    expect(texts(h)[1]).toBe('對方第 2 棒 擊出游擊方向滾地球，雙殺打；對方第 1 棒在二壘被封殺。')
    expect(pas(h)[1].outs).toBe(2)
  })
  it('the plate appearance in progress: its plays name the runners, runs and outs count', () => {
    let s = start({ homeAway: '主' })
    s = pa(s, ['IP'], '一安', (p) => { p.loc = 8 })
    s = pa(s, ['IP'], '一安', (p) => { p.loc = 8 })
    s = pitch(s, ['B'])
    s = runnerEvent(s, at(s, 2), 'opp', 'wp')
    s = runnerEvent(s, at(s, 1), 'opp', 'sb')
    s = pitch(s, ['S'])
    s = runnerEvent(s, at(s, 3), 'opp', 'wp')
    const h = feed(s, true)
    const lv = all(h).at(-1) as Extract<FeedItem, { kind: 'live' }>
    expect(lv.plays).toEqual(['第 1 球 投手暴投，對方第 1 棒上三壘', '第 1 球 對方第 2 棒盜壘上二壘', '第 2 球 投手暴投，對方第 1 棒回本壘得分'])
    expect(lv).toMatchObject({ who: '對方第 3 棒', count: '1-1', tokens: '壞 好', runs: 1, score: { away: 1, home: 0 } })
    expect(itemText(latestItem(h)!)).toBe('投手暴投，對方第 1 棒回本壘得分。')
    expect(lastScore(h)).toEqual(expected(s))
    // the finished plate appearances keep their own ends (the run is not counted twice)
    expect(pas(h).every((p) => !p.runs)).toBe(true)
    // a pickoff for an out
    s = runnerEvent(s, at(s, 2), 'opp', 'pk')
    const h2 = feed(s, true)
    expect((all(h2).at(-1) as Extract<FeedItem, { kind: 'live' }>).plays.at(-1)).toBe('第 2 球 對方第 2 棒遭牽制出局')
    expect(all(h2).filter((i) => i.kind === 'event').at(-1)).toMatchObject({ text: '對方第 2 棒遭牽制出局。', outs: 1, during: true })
  })
  it('a new half before anything happened: 準備上場 on its header', () => {
    const s = top1()
    const h = buildFeed({ homeAway: '客', opponent: '模擬隊', batting: s.batting, pitching: s.pitching, subs: s.subs, live: liveSourceOf(s, '對方第 1、2、3 棒') })
    // (nobody 打擊中 yet: the header already says who is up)
    expect(h[1]).toMatchObject({ title: '一局下 對方進攻', dueUp: '對方第 1、2、3 棒', items: [] })
    // the first pitch: the plate appearance in progress shows, 準備上場 goes
    const s2 = pitch(s, ['B'])
    const h2 = buildFeed({ homeAway: '客', opponent: '模擬隊', batting: s2.batting, pitching: s2.pitching, subs: s2.subs, live: liveSourceOf(s2, '對方第 1、2、3 棒') })
    expect(h2[1].dueUp).toBeUndefined()
    expect(h2[1].items).toMatchObject([{ kind: 'live', who: '對方第 1 棒', count: '1-0' }])
  })
})

describe('runner clauses on the batted ball', () => {
  it('scorers first and grouped, then the others lead runner first; runners who stayed are not named', () => {
    let s = start()
    s = pa(s, [], '保送')
    s = pa(s, [], '保送')
    s = pa(s, [], '保送')
    s = pa(s, ['IP'], '二安', (p) => { p.loc = 7; p.traj = 'F'; p.runners[runner(s, '陳威任')] = 'home'; p.runners[runner(s, '林昱丞')] = 'home'; p.runners[runner(s, '劉哲宏')] = 3; p.rbi = 2 })
    expect(texts(feed(s)).at(-1)).toBe('蘇柏愷 擊出左外野高飛球，二壘安打，2 分打點；林昱丞、陳威任回本壘得分，劉哲宏上三壘。')
    s = pa(s, ['IP'], '內滾', (p) => { p.loc = 5 })
    // (the man on second stays, the one on third stays: nobody named)
    expect(texts(feed(s)).at(-1)).toBe('吳藹倫 擊出三壘方向滾地球，出局。')
  })
  it('趁傳 and 失誤 on the ball, the batter too', () => {
    let s = start()
    s = pa(s, [], '保送')
    s = pa(s, ['IP'], '一安', (p) => { p.loc = 9; p.traj = 'G'; p.runners[runner(s, '林昱丞')] = 3; p.throws = [runner(s, '林昱丞')] })
    expect(texts(feed(s)).at(-1)).toBe('陳威任 擊出右外野滾地球，一壘安打；林昱丞趁傳上三壘。')
    s = pa(s, ['IP'], '一安', (p) => { p.loc = 8; p.traj = 'L'; p.batter = 2; p.errAdv = ['batter']; p.runners[runner(s, '林昱丞')] = 'home'; p.runners[runner(s, '陳威任')] = 'home'; p.errAdv = ['batter', runner(s, '陳威任')]; p.rbi = 1 })
    expect(texts(feed(s)).at(-1)).toBe('劉哲宏 擊出中外野平飛球，一壘安打，1 分打點；林昱丞回本壘得分，陳威任因失誤回本壘得分，打者因失誤上二壘。')
  })
  it('a pinch runner is named after his line, the batter before it', () => {
    let s = start()
    s = pa(s, ['IP'], '一安', (p) => { p.loc = 8 })
    s = substitute(s, 0, '王大同', 'PR')
    s = pa(s, ['IP'], '一安', (p) => { p.loc = 9 })
    const t = texts(feed(s))
    expect(t).toEqual(['林昱丞 擊出中外野方向一壘安打。', '更換代跑：林昱丞 → 王大同', '陳威任 擊出右外野方向一壘安打；王大同上二壘。'])
  })
  it('their pinch runner the same way', () => {
    let s = start({ homeAway: '主' })
    s = pa(s, ['IP'], '一安', (p) => { p.loc = 8 })
    s = pinchRunOpp(s, 0, '12號')
    s = pa(s, ['IP'], '一安', (p) => { p.loc = 9 })
    expect(texts(feed(s))).toEqual(['對方第 1 棒 擊出中外野方向一壘安打。', '對方更換代跑：第 1 棒 → 12號', '對方第 2 棒 擊出右外野方向一壘安打；12號上二壘。'])
    let u = start({ homeAway: '主' })
    u = pa(u, ['IP'], '一安')
    u = pinchRunOpp(u, 0, '')
    u = pitch(u, ['B'])
    u = runnerEvent(u, runner(u, '對方代跑'), 'opp', 'sb')
    expect(texts(feed(u, true))).toContain('對方更換代跑：第 1 棒 → 代跑')
    expect((all(feed(u, true)).at(-1) as Extract<FeedItem, { kind: 'live' }>).plays).toEqual(['第 1 球 代跑盜壘上二壘'])
  })
  it('a runner put out after the batter: the third out on the bases is its own line', () => {
    let s = start()
    s = pa(s, ['IP'], '一安')
    s = pa(s, ['S', 'S', 'SS'], '三振')
    s = pa(s, ['S', 'S', 'SS'], '三振')
    s = pitch(s, ['B'])
    s = runnerEvent(s, runner(s, '林昱丞'), 'us', 'cs')
    const h = feed(s, true)
    expect(texts([h[0]])).toEqual(['林昱丞 一壘安打。', '陳威任 揮棒落空，三振出局。', '劉哲宏 揮棒落空，三振出局。', '林昱丞盜壘刺出局。'])
    expect(h[0].items.at(-1)).toMatchObject({ kind: 'event', outs: 3 })
    expect(h[0].summary).toBe('0 分・1 安打・0 失誤・0 殘壘')
  })
  it('the batter himself put out on the bases for the third out after he reached: his own line, both sides', () => {
    for (const [ha, kind, end] of [['客', 'cs', '盜壘刺出局'], ['客', 'pk', '遭牽制出局'], ['主', 'cs', '盜壘刺出局'], ['主', 'pk', '遭牽制出局']] as const) {
      let s = start({ homeAway: ha })
      s = pa(s, ['S', 'S', 'SS'], '三振')
      s = pa(s, ['S', 'S', 'SS'], '三振')
      s = pa(s, ['IP'], '一安', (p) => { p.loc = 8; p.traj = 'L' })
      const who = ha === '客' ? '劉哲宏' : '對方第 3 棒'
      s = pitch(s, ['B'])
      s = runnerEvent(s, s.runners[0].row, s.runners[0].side, kind)
      expect(s.half, `${ha} ${kind}`).toBe('bottom')
      const h = feed(s, true)
      expect(texts([h[0]]).slice(2), `${ha} ${kind}`).toEqual([`${who} 擊出中外野平飛球，一壘安打。`, `${who}${end}。`])
      expect(h[0].items.at(-2)).toMatchObject({ kind: 'pa' })
      expect((h[0].items.at(-2) as { outs?: number }).outs).toBeUndefined()
      expect(h[0].items.at(-1)).toMatchObject({ kind: 'event', outs: 3 })
      expect(itemText(latestItem([h[0]])!)).toBe(`${who}${end}。`)
      expect(h[0].summary).toBe('0 分・1 安打・0 失誤・0 殘壘')
    }
  })
  it('rows without plays: a runner caught stealing before the batter struck out is the runner\'s out, both sides', () => {
    // (a hand-filled workbook or an older game: 壘上／出局 and the codes, no runner plays; theirs count the CS on the row)
    const bat = [
      B({ result: '外飛', batter: 'A', order: 1, code: 'I', basesBefore: '無', outsBefore: 0 }),
      B({ result: '一安', batter: 'Bb', order: 2, cs: 1, code: 'II', basesBefore: '無', outsBefore: 1 }),
      B({ result: '三振', batter: 'C', order: 3, pitches: ['S', 'S', 'SS'], code: 'III', basesBefore: '1', outsBefore: 1 }),
    ]
    const pit = [
      P({ result: '外飛', oppOrder: 1, code: 'I', basesBefore: '無', outsBefore: 0 }),
      P({ result: '一安', oppOrder: 2, code: 'II', basesBefore: '無', outsBefore: 1 }),
      P({ result: '三振', oppOrder: 3, pitches: ['S', 'S', 'SS'], cs: 1, code: 'III', basesBefore: '1', outsBefore: 1 }),
    ]
    for (const ha of ['客', '主'] as const) {
      const h = buildFeed({ homeAway: ha, opponent: '模擬隊', batting: bat, pitching: pit })
      for (const [side, who] of [['us', (n: number) => ['A', 'Bb', 'C'][n - 1]], ['opp', (n: number) => `對方第 ${n} 棒`]] as const) {
        const half = h.find((x) => x.side === side)!
        expect(texts([half]), `${ha} ${side}`).toEqual([`${who(1)} 擊出外野高飛球，接殺出局。`, `${who(2)} 一壘安打。`, `${who(3)} 揮棒落空，三振出局；${who(2)}盜壘刺出局。`])
        expect(half.items.map((i) => (i as { outs?: number }).outs)).toEqual([1, undefined, 3])
      }
    }
    // the same rows with the struck-out batter reaching and nobody else put out: still his own later line
    const k3 = [P({ result: '三振', oppOrder: 1, pitches: ['S', 'S', 'SS'], code: 'I', basesBefore: '無', outsBefore: 0 }), P({ result: '三振', oppOrder: 2, pitches: ['S', 'S', 'SS'], code: 'II', basesBefore: '無', outsBefore: 1 }), P({ result: '三振', oppOrder: 3, pitches: ['S', 'S', 'SS'], cs: 1, code: 'III', basesBefore: '無', outsBefore: 2 })]
    expect(texts(buildFeed({ homeAway: '主', opponent: '模擬隊', batting: [], pitching: k3 })).slice(2)).toEqual(['對方第 3 棒 揮棒落空，不死三振上壘。', '對方第 3 棒盜壘刺出局。'])
  })
  it('a 不死三振 batter put out on the bases afterwards still reads 上壘; a batter thrown out on his own hit reads 打者出局', () => {
    let s = start()
    s = pa(s, ['S', 'S', 'SS'], '三振')
    s = pa(s, ['S', 'S', 'SS'], '三振')
    s = pa(s, ['S', 'S', 'SS'], '三振', (p) => { p.batter = 1 })
    expect(s.runners).toHaveLength(1)
    s = pitch(s, ['B'])
    s = runnerEvent(s, s.runners[0].row, 'us', 'cs')
    expect(texts([feed(s)[0]]).slice(2)).toEqual(['劉哲宏 揮棒落空，不死三振上壘。', '劉哲宏盜壘刺出局。'])
    let u = start()
    u = pa(u, ['IP'], '一安', (p) => { p.loc = 8; p.batter = 'out' })
    expect(texts(feed(u))).toEqual(['林昱丞 擊出中外野方向一壘安打；打者在二壘被刺殺。'])   // (the mark says where: the base after the single)
    expect(pas(feed(u))[0].outs).toBe(1)
  })
})

describe('突破僵局', () => {
  it('one line for the placed runners, lead first; a placed runner who scores', () => {
    let s = start({}, { tiebreak: { from: 1, bases: [2, 1] } })
    s = placeTiebreak(s)
    s = pa(s, ['IP'], '二安', (p, x) => { p.loc = 7; p.traj = 'F'; for (const r of x.runners) p.runners[r.row] = 'home'; p.rbi = 2 })
    const h = feed(s)
    expect(texts(h)).toEqual(['突破僵局：梁睿至上二壘、蔡奇霖上一壘', '林昱丞 擊出左外野高飛球，二壘安打，2 分打點；梁睿至、蔡奇霖回本壘得分。'])
    expect(pas(h)[0].score).toEqual({ away: 2, home: 0 })
    expect(pas(h)).toHaveLength(1)
  })
  it('one runner, and three of theirs without names', () => {
    let s = start({}, { tiebreak: { from: 1, bases: [2] } })
    s = placeTiebreak(s)
    expect(texts(feed(s, true))[0]).toBe('突破僵局：蔡奇霖上二壘')
    let o = start({ homeAway: '主' }, { tiebreak: { from: 1, bases: [3, 2, 1] } })
    o = placeTiebreak(o)
    expect(texts(feed(o, true))[0]).toBe('突破僵局：對方第 7 棒上三壘、對方第 8 棒上二壘、對方第 9 棒上一壘')
  })
})

describe('where substitutions go', () => {
  it('PH before his plate appearance; DEF at the start of the half', () => {
    let s = start()
    s = pa(s, ['IP'], '一安')
    s = substitute(s, 1, '謝小明', 'PH')
    s = pa(s, ['IP'], '內滾', (p, x) => { p.loc = 6; p.runners[at(x, 1)] = 2 })
    s = substitute(s, 5, '王大同', 'CF')
    s = pa(s, ['IP'], '內滾', (p) => { p.loc = 6 })
    expect(texts(feed(s))).toEqual(['更換守備：謝昊瑾 → 王大同（中外野手）', '林昱丞 一壘安打。', '更換代打：陳威任 → 謝小明', '謝小明 擊出游擊方向滾地球，出局；林昱丞上二壘。', '劉哲宏 擊出游擊方向滾地球，出局。'])
  })
  it('P: a change in the middle of a plate appearance goes before it; one between innings at the top of their next half', () => {
    let s = start({ homeAway: '主' })
    s = pitch(s, ['B'])
    s = changePitcher(s, '許振謙')
    s = pa(s, ['S', 'IP'], '外飛', (p) => { p.loc = 8 })
    expect(texts(feed(s))).toEqual(['更換投手：梁睿至 → 許振謙', '對方第 1 棒 擊出中外野高飛球，接殺出局。'])
    expect(pas(feed(s))[0].pitcher).toBe('許振謙')
    s = pa(s, ['IP'], '外飛')
    s = pa(s, ['IP'], '外飛')
    // we bat 1▼; the change is made now, he pitches from 2▲
    s = changePitcher(s, '謝小明')
    s = pa(s, ['IP'], '外飛')
    // (until he pitches it waits at the end of the half it was made in)
    expect(feed(s, true).map((x) => x.items.filter((i) => i.kind === 'sub').map(itemText))).toEqual([['更換投手：梁睿至 → 許振謙'], ['更換投手：許振謙 → 謝小明']])
    s = pa(s, ['IP'], '外飛')
    s = pa(s, ['IP'], '外飛')
    s = pa(s, ['IP'], '外飛')
    const h = feed(s, true)
    expect(h[2]).toMatchObject({ title: '二局上 對方進攻', pitcher: '投手 謝小明' })
    expect(h[1].items.filter((i) => i.kind === 'sub')).toEqual([])
    expect(h[2].items.map(itemText).slice(0, 2)).toEqual(['更換投手：許振謙 → 謝小明', '對方第 4 棒 擊出外野高飛球，接殺出局。'])
  })
  it('PR before the next plate appearance, or before the one in progress; a sub with nothing to go before at the end of its half', () => {
    let s = start()
    s = pa(s, ['IP'], '一安')
    s = substitute(s, 0, '王大同', 'PR')
    expect(texts(feed(s, true))).toEqual(['林昱丞 一壘安打。', '更換代跑：林昱丞 → 王大同', '陳威任 打擊中'])
    const src: FeedSource = { homeAway: '客', opponent: '模擬隊', batting: s.batting, pitching: [], subs: [{ kind: 'PH', in: '沒上場', out: '劉哲宏', pos: 'PH', inning: 1, half: 'top' }] }
    expect(buildFeed(src)[0].items.map(itemText)).toEqual(['林昱丞 一壘安打。', '更換代打：劉哲宏 → 沒上場'])
  })
  it('the opponent: 換投 from the pitcher on our rows (the first one is on the header), 代打 and 代跑', () => {
    let s = start()
    s = setOppPitcher(s, { hand: 'R', name: '王' })
    s = pa(s, ['IP'], '一安')
    s = setOppPitcher(s, { hand: 'L', name: '林' })
    s = pa(s, ['IP'], '內滾', (p, x) => { p.runners[at(x, 1)] = 2 })
    let h = feed(s, true)
    expect(h[0].pitcher).toBe('對方投手 右投 王')
    expect(texts(h)).toEqual(['林昱丞 一壘安打。', '對方更換投手：右投 王 → 左投 林', '陳威任 擊出內野滾地球，出局；林昱丞上二壘。', '劉哲宏 打擊中'])
    // a change during the plate appearance in progress
    s = pitch(s, ['B'])
    s = setOppPitcher(s, { hand: 'R', name: '陳' })
    h = feed(s, true)
    expect(texts(h).slice(-2)).toEqual(['對方更換投手：左投 林 → 右投 陳', '劉哲宏 打擊中'])
    let o = start({ homeAway: '主' })
    o = pa(o, ['IP'], '外飛')
    o = pa(o, ['IP'], '外飛')
    o = pinchHitOpp(o, '99號')
    o = pa(o, ['IP'], '一安')
    o = pinchHitOpp(o, '')
    expect(texts(feed(o, true)).slice(-4)).toEqual(['對方更換代打：第 3 棒 → 99號', '99號 一壘安打。', '對方更換代打：第 4 棒 → 代打', '對方第 4 棒 打擊中'])
  })
})

describe('the board facts', () => {
  it('our pitcher today counts every pitch (the ball put in play too — bug 2) and his line', () => {
    let s = start({ homeAway: '主' })
    s = pa(s, ['B', 'S', 'IP'], '一安')
    s = pa(s, ['S', 'S', 'SS'], '三振')
    s = pa(s, ['B', 'B', 'B', 'B'], '保送')
    s = pa(s, ['IP'], '雙殺')
    s = pitch(s, ['B', 'S'])
    const t = pitcherToday(s.pitching, '梁睿至', s.pitches.length)
    expect(t.pc).toBe(13)
    // the 紀錄比賽 rule (Record.tsx: every pitch of his rows plus the plate appearance in progress)
    expect(t.pc).toBe(s.pitching.filter((p) => p.pitcher === s.pitcher).reduce((a, p) => a + p.pitches.length, 0) + s.pitches.length)
    expect(t.line).toBe('1.0 局 1 安 0 失分 1 四死 1 三振')
  })
  it('their pitcher: the stint on the mound now', () => {
    let s = start()
    s = setOppPitcher(s, { hand: 'R' })
    s = pa(s, ['IP'], '一安')
    s = pa(s, [], '保送')
    s = setOppPitcher(s, { hand: 'L' })
    s = pa(s, ['S', 'S', 'S'], '三振')
    s = pitch(s, ['B'])
    const rows = oppStintRows(s.batting, s.oppPitcher, s.oppPitcherFrom)
    expect(oppPitcherToday(rows)).toBe('被安 0・四死 0・三振 1')
    expect(rows.reduce((a, b) => a + b.pitches.length, s.pitches.length)).toBe(oppPitchCount(s))
    expect(oppPitcherToday(s.batting)).toBe('被安 1・四死 1・三振 1')
  })
  it('batch 15: 更正這位投手 (左投 → 右投) keeps one stint: his line, his count and the feed say no 換投', () => {
    let s = start()
    s = setOppPitcher(s, { hand: 'L' })
    s = pa(s, ['B', 'IP'], '一安')
    s = pa(s, ['S', 'S', 'S'], '三振')
    s = pitch(s, ['B'])
    const count = oppPitchCount(s)
    s = correctOppPitcher(s, { hand: 'R' })
    expect(oppPitchCount(s)).toBe(count)
    const rows = oppStintRows(s.batting, s.oppPitcher, s.oppPitcherFrom)
    expect(rows).toHaveLength(2)
    expect(oppPitcherToday(rows)).toBe('被安 1・四死 0・三振 1')
    const h = feed(s, true)
    expect(h[0].pitcher).toBe('對方投手 右投')
    expect(texts(h).some((t) => t.startsWith('對方更換投手'))).toBe(false)
  })
})

describe('150 random games', () => {
  const seeds = Array.from({ length: 150 }, (_, i) => i + 1)
  it.each(seeds)('game %i: every plate appearance once, a header per half, the score and the box score add up', (seed) => {
    const s = playGame(seed)
    const h = feed(s)
    const keys = pas(h).map((p) => p.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(keys)).toEqual(new Set([...s.batting.flatMap((b, i) => (isPA(b) ? [`us:${i}`] : [])), ...s.pitching.flatMap((p, i) => (isPA(p) ? [`opp:${i}`] : []))]))
    const halves = new Set([...s.batting.map((b) => `${b.inning}us`), ...s.pitching.map((p) => `${p.inning}opp`)])
    expect(h.length).toBe(halves.size)
    for (const x of h) { expect(x.title).toMatch(/^.+局[上下] (我隊|對方)進攻$/); expect(x.summary).toMatch(/^\d+ 分・\d+ 安打・\d+ 失誤・\d+ 殘壘$/) }
    expect(lastScore(h)).toEqual(expected(s))
    const sum = (side: 'us' | 'opp', k: number) => h.filter((x) => x.side === side).reduce((a, x) => a + Number(x.summary!.split('・')[k].match(/\d+/)![0]), 0)
    const sc = score(s)
    expect([sum('us', 0), sum('opp', 0)]).toEqual([sc.us, sc.opp])
    expect(sum('us', 1)).toBe(s.batting.filter((b) => ['一安', '內安', '二安', '場地二安', '三安', '全壘打'].includes(b.result)).length)
    expect(sum('opp', 1)).toBe(s.pitching.filter((b) => ['一安', '內安', '二安', '場地二安', '三安', '全壘打'].includes(b.result)).length)
    for (const t of texts(h)) expect(t).not.toMatch(/undefined|NaN| {2}|，，|null/)
  })
  it.each(seeds.slice(0, 40))('game %i, live: before every plate appearance the running score is the scoreboard', (seed) => {
    playGameWith(seed, (s) => {
      if (s.finished) return
      const h = feed(s, true)
      expect(lastScore(h), `${s.inning}${s.half}`).toEqual(expected(s))
      expect(all(h).at(-1)?.kind === 'live' || all(h).at(-1)?.kind === 'sub').toBe(true)
    })
  })
  it('a half the timeline cannot follow (no 壘上(前)): sentences without runner clauses, outs from the codes, no wrong names', () => {
    const s = playGame(4)
    const strip = (rows: Array<BattingPA | PitchingPA>) => rows.map((r) => (r.inning === 2 ? { ...r, basesBefore: undefined } : r))
    const h = buildFeed({ homeAway: s.game.homeAway, opponent: s.game.opponent, batting: strip(s.batting) as BattingPA[], pitching: strip(s.pitching) as PitchingPA[], subs: s.subs })
    const two = h.filter((x) => x.inning === 2)
    expect(two).toHaveLength(2)
    for (const x of two) {
      for (const it of x.items) if (it.kind === 'pa') { expect(it.text).not.toContain('；'); expect(it.score).toBeUndefined() }
      const outs = x.items.flatMap((it) => (it.kind === 'pa' && it.outs ? [it.outs] : []))
      expect(outs.every((n) => n >= 1 && n <= 3)).toBe(true)
    }
    expect(lastScore(h)).toEqual(expected(s))
  })
  it('a half the timeline cannot follow: the plate appearance that drove the runs in scores, not the batter who crossed later; theirs too', () => {
    const bat = [
      B({ result: '保送', pitches: ['B', 'B', 'B', 'B'], run: 1, batter: 'A', order: 1 }),
      B({ result: '一安', run: 1, batter: 'C', order: 2 }),
      B({ result: '三安', rbi: 2, run: 0, batter: 'D', order: 3, code: 'L' }),
      B({ result: '外飛', batter: 'E', order: 4, code: 'I' }),
    ]
    const pit = [
      P({ result: '一安', code: 'ER', oppOrder: 1 }),
      P({ result: '失誤', code: 'R', oppOrder: 2 }),
      P({ result: '二安', rbi: 1, oppOrder: 3, code: 'L' }),
      P({ result: '全壘打', code: 'ER', oppOrder: 4 }),
    ]
    const h = buildFeed({ homeAway: '客', opponent: '模擬隊', batting: bat, pitching: pit })
    const runs = (side: 'us' | 'opp') => pas(h).filter((p) => p.side === side).map((p) => p.runs)
    // ours: the triple's 2 RBI, not the walk and the single whose batters scored on it
    expect(runs('us')).toEqual([0, 0, 2, 0])
    // theirs: the double's RBI and the home run (the run on the error is only in the summary)
    expect(runs('opp')).toEqual([0, 0, 1, 1])
    expect(h.map((x) => [x.followed, x.runs])).toEqual([[false, 2], [false, 3]])
    expect(h[1].summary).toBe('3 分・3 安打・1 失誤・1 殘壘')
    expect(pas(h).every((p) => !p.score)).toBe(true)
  })
})

describe('對方打者左打／右打 (batch 18)', () => {
  it('a play of theirs carries 左打 / 右打 next to the batter when recorded (the sentence is unchanged); the live one too', () => {
    const h = buildFeed({ homeAway: '主', opponent: '模擬隊', batting: [], pitching: [P({ oppBats: 'L' }), P({ oppOrder: 4 })] })
    const items = pas(h)
    expect(items.map((i) => i.bats)).toEqual(['左打', undefined])
    expect(itemText(items[0])).toBe(itemText(items[1]).replace('對方第 4 棒', '對方第 3 棒'))
    let s = start({ homeAway: '主' })
    s = setOppBats(s, 'R')
    const lv = all(feed(s, true)).find((i) => i.kind === 'live') as Extract<FeedItem, { kind: 'live' }>
    expect(lv.bats).toBe('右打')
    // a draft saved while 不知道 still existed ('?'): no side is shown
    expect(liveSourceOf({ ...start({ homeAway: '主' }), oppBatsBySlot: { 1: '?' } }).batter.bats).toBeUndefined()
  })
})
