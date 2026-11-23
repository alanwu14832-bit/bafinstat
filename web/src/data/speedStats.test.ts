import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { speedSummary } from './speeds'
import { datasetToWorkbook, parseWorkbook } from './xlsx'
import { SEED_DATASET } from './seed'
import { normalizeDataset } from './normalize'
import { buildFeed, fastestText, pitchList, type FeedItem } from './broadcast'
import { withMirrors, mirrorId } from './intrasquad'
import { toGameEdit } from '../record/model'
import { normalizeGameEdit } from './edit'
import { playGame, POS, roster } from '../test/simGame'
import type { Game, PitchingPA } from './types'

const pa = (gameId: string, inning: number, pitches: string[], speeds?: Array<number | null>) => ({ gameId, inning, pitches, ...(speeds ? { speeds } : {}) })

describe('球速統計 (speedSummary)', () => {
  it('fastest, average and count over every measured pitch; per game in row order, per inning low to high', () => {
    const s = speedSummary([
      pa('G1', 2, ['S', 'B', 'IP'], [130, null, 134]),
      pa('G1', 1, ['B', 'S'], [128, 132]),
      pa('G2', 1, ['SS', 'F', 'B'], [138, 136, null]),
      pa('G2', 3, ['B']),                       // nothing measured: counts as a pitch only
    ])!
    expect([s.max, s.maxGameId, s.n, s.pitches, s.avg]).toEqual([138, 'G2', 6, 9, 133])
    expect(s.byGame).toEqual([{ gameId: 'G1', n: 4, max: 134, avg: 131 }, { gameId: 'G2', n: 2, max: 138, avg: 137 }])
    expect(s.byInning.map((r) => [r.inning, r.n, r.max, r.avg])).toEqual([[1, 4, 138, 133.5], [2, 2, 134, 132]])
  })
  it('null when no pitch was measured (the card stays hidden)', () => {
    expect(speedSummary([pa('G1', 1, ['B', 'S'])])).toBeNull()
    expect(speedSummary([])).toBeNull()
  })
  it('the fastest pitch\'s game is where it was first thrown', () => {
    expect(speedSummary([pa('G1', 1, ['S'], [140]), pa('G2', 1, ['S'], [140])])!.maxGameId).toBe('G1')
  })
})

describe('球速 in Excel', () => {
  const pit = SEED_DATASET.pitching.map((p, i) => (i === 0 ? { ...p, pitches: ['S', 'B', 'IP'], speeds: [132, null, 128] } : p))
  const bat = SEED_DATASET.batting.map((p, i) => (i === 0 ? { ...p, pitches: ['B', 'S'], speeds: [null, 121] } : p))
  const ds = { ...SEED_DATASET, pitching: pit, batting: bat }
  it('survives a backup round trip as the last column; rows without speeds get no key', () => {
    const wb = datasetToWorkbook(ds)
    const ph = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['投球紀錄'], { header: 1 })[0] as string[]
    expect(ph[ph.length - 1]).toBe('球速')
    const back = parseWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer).dataset
    expect(back.pitching[0].speeds).toEqual([132, null, 128])
    expect(back.batting[0].speeds).toEqual([null, 121])
    expect(back.pitching.slice(1).some((p) => 'speeds' in p)).toBe(false)
  })
  it('the single-game template reads its 球速 column: 「132,,128」, a lone number, a full-width comma', () => {
    const wb = XLSX.read(new Uint8Array(readFileSync(resolve(process.cwd(), '..', 'data', 'BAFIN_棒球數據總表.xlsx'))), { type: 'array' })
    const ws = wb.Sheets['單場-投球']
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
    const hr = grid.findIndex((r) => r.some((c) => String(c).trim() === '投手'))
    const head = grid[hr] as unknown[]
    const col = head.findIndex((c) => String(c).trim() === '球速')
    expect(col).toBe(head.findIndex((c) => String(c).trim() === '對方打者左右') + 1)
    const n = (r: number) => (grid[hr + 1 + r] as unknown[]).filter((_, c) => /^球\d+$/.test(String(head[c]).trim())).filter((v) => String(v).trim()).length
    XLSX.utils.sheet_add_aoa(ws, [[n(0) >= 3 ? '132,,128' : '132'], [135], ['120，121']], { origin: XLSX.utils.encode_cell({ r: hr + 1, c: col }) })
    for (const name of wb.SheetNames.filter((x) => !x.startsWith('單場-'))) delete wb.Sheets[name]
    wb.SheetNames = wb.SheetNames.filter((x) => x.startsWith('單場-'))
    const { dataset } = parseWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
    const [a, b, c] = dataset.pitching
    expect(a.speeds?.slice(0, 3)).toEqual(n(0) >= 3 ? [132, null, 128] : [132])
    expect(a.speeds?.length).toBe(a.pitches.length)
    expect(b.speeds?.[0]).toBe(135)
    expect(c.speeds?.slice(0, 2)).toEqual(c.pitches.length >= 2 ? [120, 121] : [120])
  })
})

describe('球速 kept with its pitch', () => {
  it('a blank pitch dropped by the clean-up takes its speed slot with it', () => {
    const p = { ...SEED_DATASET.pitching[0], pitches: ['s', ' ', 'B'], speeds: [130, 999, 126] }
    const { dataset } = normalizeDataset({ ...SEED_DATASET, pitching: [p, ...SEED_DATASET.pitching.slice(1)] })
    expect(dataset.pitching[0].pitches).toEqual(['S', 'B'])
    expect(dataset.pitching[0].speeds).toEqual([130, 126])
  })
  it('the other side of a 隊內賽 sees the same speeds', () => {
    const s = playGame(3)
    const { fragment } = normalizeGameEdit(roster, toGameEdit(s))
    const g = fragment.games[0]
    const game: Game = { ...g, opponent: '白隊', dayRoster: { ...(g.dayRoster ?? { starters: [], bench: [], reentry: false }), intra: { team: '紅隊', opp: { starters: POS.map((pos, i) => ({ name: `B${i + 1}`, pos, order: i + 1 })), bench: [] } } } }
    const batting = fragment.batting.map((p, i) => ({ ...p, oppPitcher: '白投', ...(i === 0 && p.pitches.length ? { speeds: p.pitches.map(() => 125) } : {}) }))
    const pitching = fragment.pitching.map((p, i) => ({ ...p, ...(i === 0 && p.pitches.length ? { speeds: p.pitches.map(() => 131) } : {}) }))
    const full = withMirrors({ roster: [...roster, { name: '白投' }], games: [game], batting, pitching, fielding: fragment.fielding })
    const mid = mirrorId(game.id)
    expect(full.pitching.find((p) => p.gameId === mid)?.speeds).toEqual(batting[0].speeds)
    expect(full.batting.find((p) => p.gameId === mid)?.speeds).toEqual(pitching[0].speeds)
  })
})

describe('球速 in the 文字轉播', () => {
  it('each pitch of the expanded list carries its speed; the summary line says the fastest', () => {
    expect(pitchList(['B', 'S', 'IP'], [null, 133, 129]).map((p) => p.kmh)).toEqual([undefined, 133, 129])
    expect(fastestText([null, 133, 129])).toBe('最快 133 公里')
    expect(fastestText(undefined)).toBe('')
    const pit: PitchingPA = { gameId: 'G1', inning: 1, oppOrder: 1, pitcher: '甲', pitches: ['B', 'SS', 'SS', 'SS'], speeds: [null, 131, 135, 133], result: '三振', code: 'I', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0 }
    const items = buildFeed({ homeAway: '主', opponent: '乙隊', batting: [], pitching: [pit] }).flatMap((h) => h.items)
    const it = items.find((x): x is Extract<FeedItem, { kind: 'pa' }> => x.kind === 'pa')!
    expect(it.meta).toContain('最快 135 公里')
    expect(it.pitches.map((p) => p.kmh)).toEqual([undefined, 131, 135, 133])
  })
  it('the batter at the plate on /live shows the last pitch\'s speed', () => {
    const items = buildFeed({
      homeAway: '主', opponent: '乙隊', batting: [], pitching: [],
      live: { inning: 1, half: 'top', outs: 0, pitches: ['B', 'S'], speeds: [128, 134], plays: [], runners: [], batter: { order: 1, label: '對方第 1 棒' }, pitcher: '甲' },
    }).flatMap((h) => h.items)
    expect(items.find((x) => x.kind === 'live')).toMatchObject({ kmh: 134 })
    const none = buildFeed({
      homeAway: '主', opponent: '乙隊', batting: [], pitching: [],
      live: { inning: 1, half: 'top', outs: 0, pitches: ['B', 'S'], speeds: [128, null], plays: [], runners: [], batter: { order: 1, label: '對方第 1 棒' }, pitcher: '甲' },
    }).flatMap((h) => h.items)
    expect(none.find((x) => x.kind === 'live')).not.toHaveProperty('kmh')
  })
})
