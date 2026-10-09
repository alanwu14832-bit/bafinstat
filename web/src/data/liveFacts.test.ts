import { describe, expect, it } from 'vitest'
import { commitPA, defaultPlan, newGame, type RecordState } from '../record/model'
import { currentHalfCard, halfCandidates, halfCardKey, halfCards, liveContext, seasonLine } from './liveFacts'
import { f2, f3 } from '../lib/fmt'
import { DEFAULT_PARAMS, EMPTY_DATASET, TIEBREAK, type BattingPA, type Dataset, type Game, type PitchingPA } from './types'

const LIVE: Game = { id: 'G20261020-01', date: '2026-10-20', tournament: '系際盃', opponent: '對手', homeAway: '客', innings: 7 }
const NAMES = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬']
const PITCHES: Record<string, string[]> = { 三振: ['S', 'CS', 'SS'], 保送: ['B', 'B', 'B', 'B'] }
const game = (id: string, date: string, extra: Partial<Game> = {}): Game => ({ id, date, tournament: '系際盃', opponent: '別隊', homeAway: '主', innings: 7, ...extra })
const bat = (gameId: string, batter: string, result: string, extra: Partial<BattingPA> = {}): BattingPA => ({
  gameId, inning: 1, batter, order: NAMES.indexOf(batter) + 1, pitches: PITCHES[result] ?? (result === TIEBREAK ? [] : ['IP']), result, sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...extra,
})
const pit = (gameId: string, inning: number, pitcher: string, result: string, code?: string, extra: Partial<PitchingPA> = {}): PitchingPA => ({
  gameId, inning, pitcher, oppOrder: 1, pitches: PITCHES[result] ?? (result === TIEBREAK ? [] : ['IP']), result, sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...(code ? { code } : {}), ...extra,
})
const ds = (games: Game[], batting: BattingPA[] = [], pitching: PitchingPA[] = []): Dataset => ({ ...EMPTY_DATASET, games, batting, pitching })
const start = (patch: Partial<RecordState> = {}, g: Game = LIVE): RecordState => ({ ...newGame(g, NAMES.map((name) => ({ name, pos: 'DH' })), '丁'), ...patch })
const texts = (cards: Array<{ text: string; figure?: string; kicker: string } | null>) => cards.flatMap((c) => (c ? [c.text, c.figure ?? '', c.kicker] : [])).join('|')

describe('本季 line on the live board', () => {
  const G1 = game('G20260912-01', '2026-09-12'), G2 = game('G20261001-01', '2026-10-01')
  const spring = game('G20260301-01', '2026-03-01'), old = game('G20250501-01', '2025-05-01')
  const sched = game('G20261005-01', '2026-10-05', { status: 'scheduled' })
  const rows = [
    ...['一安', '一安', '內滾', '三振', '外飛'].map((r) => bat(G1.id, '甲', r)),
    ...['二安', '內滾', '三振', '外飛', '保送'].map((r) => bat(G2.id, '甲', r)),
    ...['一安', '一安', '一安'].map((r) => bat(spring.id, '甲', r)),
    ...['一安', '一安', '一安'].map((r) => bat(old.id, '甲', r)),
    bat(sched.id, '甲', '一安'),
  ]
  const synced = bat(LIVE.id, '甲', '全壘打')
  const today = [bat(LIVE.id, '甲', '一安'), bat(LIVE.id, '甲', '三振')]

  it('學年 (start 8): earlier games of the season plus today, never the live game twice', () => {
    for (const base of [ds([G1, G2, spring, old, sched, LIVE], [...rows, synced]), ds([G1, G2, spring, old, sched], rows)]) {
      const l = seasonLine(liveContext(base, LIVE, DEFAULT_PARAMS, 8), today, '甲')!
      expect([l.pa, l.ab, l.h]).toEqual([12, 11, 4])
      expect([f3(l.avg), f3(l.obp), f3(l.slg), f3(l.ops)]).toEqual(['.364', '.417', '.455', '.871'])
    }
  })
  it('calendar year (the default): the spring game of the same year counts too', () => {
    const l = seasonLine(liveContext(ds([G1, G2, spring, old, sched, LIVE], [...rows, synced]), LIVE, DEFAULT_PARAMS), today, '甲')!
    expect([l.pa, l.ab, l.h]).toEqual([15, 14, 7])
  })
  it('null without an earlier plate appearance this season; tie-break runners are no plate appearances', () => {
    const ctx = liveContext(ds([G1, G2], rows), LIVE, DEFAULT_PARAMS, 8)
    expect(seasonLine(ctx, [bat(LIVE.id, '乙', '一安')], '乙')).toBeNull()
    expect(seasonLine(liveContext(ds([G1], [bat(G1.id, '乙', TIEBREAK, { run: 1 })]), LIVE, DEFAULT_PARAMS), [], '乙')).toBeNull()
    expect(seasonLine(ctx, [...today, bat(LIVE.id, '甲', TIEBREAK, { inning: 8 })], '甲')!.pa).toBe(12)
  })
})

describe('本半局看點', () => {
  it('得點圈打擊率 needs 5 at bats with runners in scoring position', () => {
    const G1 = game('G20261001-01', '2026-10-01')
    const risp = (n: number) => [...['一安', '二安', '內滾', '外飛', '三振'].slice(0, n).map((r) => bat(G1.id, '甲', r, { basesBefore: '2' })), bat(G1.id, '甲', '外飛')]
    const card = currentHalfCard(start(), liveContext(ds([G1], risp(5)), LIVE, DEFAULT_PARAMS))!
    expect(card).toMatchObject({ kicker: '得點圈打擊率', figure: '.400', subject: '甲', order: 1, inning: 1, half: 'top' })
    expect(card.text).toBe('1 棒 甲 本季得點圈 5 打數 2 安')
    const four = halfCandidates(liveContext(ds([G1], risp(4)), LIVE, DEFAULT_PARAMS), start(), { inning: 1, half: 'top' })
    expect(four.some((c) => c.kicker === '得點圈打擊率')).toBe(false)
  })

  it('連續安打: earlier games, then with today\'s hit', () => {
    const games = ['2026-09-01', '2026-09-08', '2026-09-15'].map((d, i) => game(`G${d.replace(/-/g, '')}-01`, d, { opponent: `隊${i}` }))
    const ctx = liveContext(ds(games, games.flatMap((g) => [bat(g.id, '甲', '一安'), bat(g.id, '甲', '外飛')])), LIVE, DEFAULT_PARAMS)
    expect(currentHalfCard(start(), ctx)).toMatchObject({ id: 'streak:甲', figure: '3', text: '1 棒 甲 前 3 場出賽都有安打' })
    // 甲 hit in the 1st; our half of the 3rd, 甲 batting third in it
    const inn = (inning: number, rs: Array<[string, string, string]>) => rs.map(([b, r, code]) => bat(LIVE.id, b, r, { inning, code }))
    const s = start({
      inning: 3, half: 'top', slot: 7,
      batting: [...inn(1, [['甲', '一安', 'L'], ['乙', '外飛', 'I'], ['丙', '內滾', 'II'], ['丁', '三振', 'III']]), ...inn(2, [['戊', '外飛', 'I'], ['己', '外飛', 'II'], ['庚', '外飛', 'III']])],
      pitching: [1, 2].flatMap((i) => ['I', 'II', 'III'].map((c) => pit(LIVE.id, i, '丁', '內滾', c))),
    })
    const c = halfCandidates(ctx, s, { inning: 3, half: 'top' }).find((x) => x.id === 'streak:甲')!
    // (辛 壬 甲 lead off the 3rd: 甲 is our 1st batter)
    expect(c).toMatchObject({ figure: '4', text: '1 棒 甲 連續 4 場出賽有安打（含今天）', order: 1 })
    // the streak card already went to 1▲, so it does not come back
    const cards = halfCards(s, ctx)
    expect(cards).toHaveLength(5)
    expect(cards[0]?.id).toBe('streak:甲')
    expect(cards.slice(1).some((x) => x?.id === 'streak:甲')).toBe(false)
  })

  it('連續安打: a game with no at bat (only walks) neither extends nor breaks it; a 犧飛 with no hit breaks it', () => {
    const dates = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22']
    const games = dates.map((d, i) => game(`G${d.replace(/-/g, '')}-01`, d, { opponent: `隊${i}` }))
    const hit = (g: Game) => [bat(g.id, '甲', '一安'), bat(g.id, '甲', '外飛')]
    const walks = ds(games, [...hit(games[0]), ...hit(games[1]), bat(games[2].id, '甲', '保送'), bat(games[2].id, '甲', '保送'), ...hit(games[3])])
    expect(currentHalfCard(start(), liveContext(walks, LIVE, DEFAULT_PARAMS))).toMatchObject({ id: 'streak:甲', figure: '3', text: '1 棒 甲 前 3 場出賽都有安打' })
    const sf = ds(games, [...hit(games[0]), ...hit(games[1]), bat(games[2].id, '甲', '犧飛', { rbi: 1 }), ...hit(games[3])])
    expect(halfCandidates(liveContext(sf, LIVE, DEFAULT_PARAMS), start(), { inning: 1, half: 'top' }).some((c) => c.id === 'streak:甲')).toBe(false)
  })

  it('連續解決: our pitcher, counting back over today\'s batters (a 不死三振 who reached ends it)', () => {
    const home = { ...LIVE, homeAway: '主' as const }
    const rows = (k2: string) => [
      pit(LIVE.id, 1, '丁', '一安', 'L'), pit(LIVE.id, 1, '丁', '三振', 'I'), pit(LIVE.id, 1, '丁', '內滾', 'II'), pit(LIVE.id, 1, '丁', '外飛', 'III'),
      pit(LIVE.id, 2, '丁', '三振', k2), pit(LIVE.id, 2, '丁', '內飛', 'II'), pit(LIVE.id, 2, '丁', '三振', 'III'),
    ]
    const ctx = liveContext(ds([]), home, DEFAULT_PARAMS)
    const s = start({ inning: 3, half: 'top', pitching: rows('I') }, home)
    expect(currentHalfCard(s, ctx)).toMatchObject({ id: 'retired:丁', figure: '6', text: '丁 已連續解決 6 名打者' })
    const dropped = start({ inning: 3, half: 'top', pitching: rows('L') }, home)
    expect(halfCandidates(ctx, dropped, { inning: 3, half: 'top' }).some((c) => c.id.startsWith('retired'))).toBe(false)
  })

  it('連續解決: a batter safe on a 雙殺 (both runners out, he reached: code L) breaks the run', () => {
    const home = { ...LIVE, homeAway: '主' as const }
    const ctx = liveContext(ds([]), home, DEFAULT_PARAMS)
    // 2▲ 一安, 內飛 I, 雙殺 with the batter safe, 三振 III; 3▲ 外飛 I, 內滾 II, 外飛 III: only the last 4 in a row
    const rows = (dp: string) => [
      pit(LIVE.id, 2, '丁', '一安', 'II'), pit(LIVE.id, 2, '丁', '內飛', 'I'), pit(LIVE.id, 2, '丁', '雙殺', dp), pit(LIVE.id, 2, '丁', '三振', 'III'),
      pit(LIVE.id, 3, '丁', '外飛', 'I'), pit(LIVE.id, 3, '丁', '內滾', 'II'), pit(LIVE.id, 3, '丁', '外飛', 'III'),
    ]
    const at4 = (dp: string) => halfCandidates(ctx, start({ inning: 4, half: 'top', pitching: rows(dp) }, home), { inning: 4, half: 'top' })
    expect(at4('L').some((c) => c.id.startsWith('retired'))).toBe(false)
    // (the same plays with the batter put out on the 雙殺: 6 in a row)
    expect(at4('II').find((c) => c.id.startsWith('retired'))).toMatchObject({ figure: '6' })
    // in the real model: runners on first and second, both out on the 雙殺 and the batter safe at first
    let s = start({ inning: 2, half: 'top' }, home)
    s = commitPA(s, defaultPlan(s, '一安'))
    s = commitPA(s, defaultPlan(s, '一安'))
    s = commitPA(s, { ...defaultPlan(s, '雙殺'), batter: 1, runners: s.runners.map(() => 'out' as const) })
    s = commitPA(s, defaultPlan(s, '三振'))
    expect(s.pitching.find((p) => p.result === '雙殺')).toMatchObject({ code: 'L' })
  })

  it('里程碑: career hits from every earlier season', () => {
    const old = game('G20240501-01', '2024-05-01')
    const ctx = (n: number) => liveContext(ds([old], Array.from({ length: n }, () => bat(old.id, '甲', '一安'))), LIVE, DEFAULT_PARAMS)
    expect(currentHalfCard(start(), ctx(48))).toMatchObject({ id: 'milestone:甲', kicker: '里程碑', figure: '50', text: '1 棒 甲 再 2 支安打就生涯 50 安' })
    expect(currentHalfCard(start(), ctx(46))).toBeNull()
  })

  it('one card per half, never the same one twice in a game', () => {
    const home = { ...LIVE, homeAway: '主' as const }
    const games = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'].map((d) => game(`G${d.replace(/-/g, '')}-01`, d))
    const pitching = games.flatMap((g) => [1, 2, 3].flatMap((i) => ['I', 'II', 'III'].map((c) => pit(g.id, i, '丁', '三振', c))))
    // (戊 qualifies too, with a worse ERA: a leader needs someone to beat)
    pitching.push(...games.slice(0, 2).flatMap((g) => [1, 2, 3].flatMap((i) => [pit(g.id, i, '戊', '一安', 'ER'), ...['I', 'II', 'III'].map((c) => pit(g.id, i, '戊', '外飛', c))])))
    const ctx = liveContext(ds(games, [], pitching), home, DEFAULT_PARAMS)
    const s = start({
      inning: 3, half: 'top',
      pitching: [1, 2].flatMap((i) => [pit(LIVE.id, i, '丁', '內滾', 'I'), pit(LIVE.id, i, '丁', '外飛', 'II'), pit(LIVE.id, i, '丁', '內飛', 'III')]),
      batting: [1, 2].flatMap((i) => [bat(LIVE.id, '甲', '外飛', { inning: i, code: 'I' }), bat(LIVE.id, '乙', '外飛', { inning: i, code: 'II' }), bat(LIVE.id, '丙', '外飛', { inning: i, code: 'III' })]),
    }, home)
    const cards = halfCards(s, ctx)
    expect(cards).toHaveLength(5)
    expect([cards[0]?.id, cards[2]?.id, cards[4]?.id]).toEqual(['era1:丁', 'k1:丁', 'retired:丁'])
    const ids = cards.flatMap((c) => (c ? [c.id] : []))
    expect(new Set(ids).size).toBe(ids.length)
    expect(cards[0]!.text).toBe('丁 本季投 12.0 局')
    expect(cards[2]!.text).toBe('丁 本季投 13.0 局送出 36 次三振，全隊最多')
  })

  it('stays the same inside a half while plate appearances come in', () => {
    const games = ['2026-09-01', '2026-09-08', '2026-09-15'].map((d) => game(`G${d.replace(/-/g, '')}-01`, d))
    const ctx = liveContext(ds(games, games.flatMap((g) => NAMES.map((n) => bat(g.id, n, '一安')))), LIVE, DEFAULT_PARAMS)
    let s = start()
    const out = () => { s = commitPA(s, defaultPlan(s, '外飛')) }
    for (let i = 0; i < 12; i++) out()
    expect([s.inning, s.half, s.slot]).toEqual([3, 'top', 6])
    const before = currentHalfCard(s, ctx)
    expect(before).toMatchObject({ id: 'streak:庚', text: '7 棒 庚 前 3 場出賽都有安打' })
    const key = halfCardKey(s)
    s = commitPA(s, defaultPlan(s, '一安'))
    out()
    expect(halfCardKey(s)).not.toBe(key)
    expect(currentHalfCard(s, ctx)).toEqual(before)
  })

  it('a tie for the best OPS is no card', () => {
    const G1 = game('G20261001-01', '2026-10-01')
    const ten = (name: string) => [...Array(3).fill('一安'), ...Array(7).fill('外飛')].map((r) => bat(G1.id, name, r))
    const tied = halfCandidates(liveContext(ds([G1], [...ten('甲'), ...ten('乙')]), LIVE, DEFAULT_PARAMS), start(), { inning: 1, half: 'top' })
    expect(tied.some((c) => c.kicker === 'OPS 全隊第一' || c.kicker === '打擊率全隊第一')).toBe(false)
    const ahead = halfCandidates(liveContext(ds([G1], [...ten('甲'), ...ten('乙'), bat(G1.id, '甲', '二安')]), LIVE, DEFAULT_PARAMS), start(), { inning: 1, half: 'top' })
    expect(ahead.filter((c) => c.kicker === 'OPS 全隊第一').map((c) => c.subject)).toEqual(['甲'])
  })

  it('nothing to say: null, and never undefined or NaN in a text', () => {
    const ctx = liveContext(EMPTY_DATASET, LIVE, DEFAULT_PARAMS)
    expect(currentHalfCard(start(), ctx)).toBeNull()
    // the opponent known only by batting order, a nameless opponent, a game without a date
    const s = start({ inning: 2, half: 'bottom', pitching: [pit(LIVE.id, 1, '丁', '一安', 'L', { oppOrder: 1 }), pit(LIVE.id, 1, '丁', '三振', 'I', { oppOrder: 2 })] })
    for (const g of [LIVE, { ...LIVE, opponent: '' }, { ...LIVE, date: '' }]) {
      const all = halfCards(s, liveContext(ds([game('G20261001-01', '2026-10-01', { opponent: '' })], [bat('G20261001-01', '甲', '一安')]), g, DEFAULT_PARAMS))
      expect(texts(all)).not.toMatch(/undefined|NaN|對方 undefined/)
    }
  })

  it('突破僵局 runners are no plate appearances: not a batter of the half, not a batter retired', () => {
    const G1 = game('G20261001-01', '2026-10-01')
    const ctx = liveContext(ds([G1], ['一安', '二安', '外飛', '內滾', '三振'].map((r) => bat(G1.id, '乙', r, { basesBefore: '2' }))), LIVE, DEFAULT_PARAMS)
    // 8▲ under the tie-break: 甲 was put on second, 乙 is up
    const s = start({ inning: 8, half: 'top', slot: 1, batting: [bat(LIVE.id, '甲', TIEBREAK, { inning: 8 })] })
    const c = halfCandidates(ctx, s, { inning: 8, half: 'top' })
    expect(c.map((x) => x.subject)).not.toContain('甲')
    expect(c[0]).toMatchObject({ id: 'risp:乙', order: 2 })
    // their tie-break runner in the middle of 丁's six straight outs does not break the run
    const home = { ...LIVE, homeAway: '主' as const }
    const outs = (inning: number) => ['I', 'II', 'III'].map((code) => pit(LIVE.id, inning, '丁', '內滾', code))
    const t = start({ inning: 10, half: 'top', pitching: [...outs(8), pit(LIVE.id, 9, '丁', TIEBREAK, 'L'), ...outs(9)] }, home)
    expect(currentHalfCard(t, liveContext(ds([]), home, DEFAULT_PARAMS))).toMatchObject({ id: 'retired:丁', figure: '6' })
  })

  it('the varsity\'s 9-inning ERA', () => {
    const home = { ...LIVE, homeAway: '主' as const }
    const G1 = game('G20261001-01', '2026-10-01')
    const rows = [1, 2, 3].flatMap((i) => [pit(G1.id, i, '丁', '一安', i === 1 ? 'ER' : 'L'), ...['I', 'II', 'III'].map((c) => pit(G1.id, i, '丁', '外飛', c))])
    rows.push(pit(G1.id, 3, '丁', '二安', 'ER'))
    // (戊 qualifies too, with a worse ERA)
    rows.push(...[1, 2, 3].flatMap((i) => [pit(G1.id, i, '戊', '全壘打', 'ER'), ...['I', 'II', 'III'].map((c) => pit(G1.id, i, '戊', '外飛', c))]))
    for (const n of [9, 7]) {
      const card = currentHalfCard(start({}, home), liveContext(ds([G1], [], rows), home, { ...DEFAULT_PARAMS, inningsPerGame: n }))
      expect(card).toMatchObject({ id: 'era1:丁', figure: f2((2 * n) / 3) })
    }
  })

  it('全隊第一／最低 needs someone to beat: two qualified players and an earlier game this season', () => {
    const home = { ...LIVE, homeAway: '主' as const }
    const NEW_YEAR = { ...home, id: 'G20260101-01', date: '2026-01-01' }
    // 壬 the only pitcher; earlier games only last year; 3 innings today with 7 earned runs
    const last = game('G20250501-01', '2025-05-01')
    const today = [1, 2, 3].flatMap((i) => [pit(NEW_YEAR.id, i, '壬', '全壘打', 'ER'), ...(i < 3 ? [] : Array.from({ length: 4 }, () => pit(NEW_YEAR.id, i, '壬', '全壘打', 'ER'))), ...['I', 'II', 'III'].map((c) => pit(NEW_YEAR.id, i, '壬', '外飛', c))])
    const ctx = liveContext(ds([last], [], [1, 2, 3].flatMap((i) => ['I', 'II', 'III'].map((c) => pit(last.id, i, '壬', '外飛', c)))), NEW_YEAR, DEFAULT_PARAMS)
    const s = start({ inning: 4, half: 'top', pitcher: '壬', pitching: today }, NEW_YEAR)
    expect(halfCandidates(ctx, s, { inning: 4, half: 'top' }).some((c) => c.id.startsWith('era1'))).toBe(false)
    // an earlier game this season but still one qualified pitcher: none either
    const G1 = game('G20261001-01', '2026-10-01')
    const one = [1, 2, 3].flatMap((i) => ['I', 'II', 'III'].map((c) => pit(G1.id, i, '丁', '外飛', c)))
    const only = halfCandidates(liveContext(ds([G1], [], one), home, DEFAULT_PARAMS), start({}, home), { inning: 1, half: 'top' })
    expect(only.some((c) => c.id.startsWith('era1'))).toBe(false)
    // one qualified batter: no 打擊率／OPS 全隊第一
    const ten = [...Array(4).fill('一安'), ...Array(6).fill('外飛')].map((r) => bat(G1.id, '甲', r))
    const solo = halfCandidates(liveContext(ds([G1], ten), LIVE, DEFAULT_PARAMS), start(), { inning: 1, half: 'top' })
    expect(solo.some((c) => c.id.startsWith('avg1') || c.id.startsWith('ops1'))).toBe(false)
  })

  it('a half\'s subjects follow one rule while it is played and afterwards (a 突破僵局 half with 2 plate appearances)', () => {
    // 丙 has 48 career hits; 8▲: 壬 placed on second, 甲 犧觸 I, 乙 三振 III; 丙 leads off 9▲
    const old = game('G20240501-01', '2024-05-01')
    const ctx = liveContext(ds([old], Array.from({ length: 48 }, () => bat(old.id, '丙', '一安'))), LIVE, DEFAULT_PARAMS)
    const eighth = [bat(LIVE.id, '壬', TIEBREAK, { inning: 8, code: 'II' }), bat(LIVE.id, '甲', '犧觸', { inning: 8, code: 'I' })]
    const top8 = { inning: 8, half: 'top' as const }
    const during = start({ inning: 8, half: 'top', slot: 1, batting: eighth })
    const after = start({ inning: 9, half: 'top', slot: 2, batting: [...eighth, bat(LIVE.id, '乙', '三振', { inning: 8, code: 'III' })] })
    const batted = { ...after, slot: 3, batting: [...after.batting, bat(LIVE.id, '丙', '外飛', { inning: 9, code: 'I' })] }
    for (const s of [during, after, batted]) expect(halfCandidates(ctx, s, top8)[0]).toMatchObject({ id: 'milestone:丙', inning: 8 })
    // so 9▲ does not show the same card again
    const cards = halfCards(after, ctx)
    expect(cards.filter((c) => c?.id === 'milestone:丙')).toHaveLength(1)
  })
})
