import { describe, expect, it } from 'vitest'
import { applyGameEdit, extractGame, normalizeGameEdit, removeGame } from './edit'
import { SEED_DATASET } from './seed'
import { summarizeGame } from './stats'

describe('in-app game corrections', () => {
  it('round-trips a game unchanged', () => {
    const edit = extractGame(SEED_DATASET, 'G20251010-01')!
    const { fragment } = normalizeGameEdit(SEED_DATASET.roster, edit)
    const next = applyGameEdit(SEED_DATASET, fragment)
    expect(next.games.length).toBe(SEED_DATASET.games.length)
    expect(next.batting.length).toBe(SEED_DATASET.batting.length)
    const a = summarizeGame(next, next.games.find((g) => g.id === 'G20251010-01')!)
    const b = summarizeGame(SEED_DATASET, SEED_DATASET.games.find((g) => g.id === 'G20251010-01')!)
    expect([a.runsUs, a.runsOpp, a.hitsUs, a.lineUs]).toEqual([b.runsUs, b.runsOpp, b.hitsUs, b.lineUs])
  })

  it('applies a corrected result and a new player, re-deriving innings from codes', () => {
    const edit = extractGame(SEED_DATASET, 'G20251010-01')!
    const batting = edit.batting.map((p) => ({ ...p, inning: 0 })) // wipe innings: normalize must restore them
    batting[2] = { ...batting[2], result: '二安', batter: '新球員' }
    const { fragment, warnings } = normalizeGameEdit(SEED_DATASET.roster, { ...edit, game: { ...edit.game, opponent: '群風（修正）' }, batting })
    expect(fragment.batting[2].inning).toBe(1)
    expect(fragment.batting[2].result).toBe('二安')
    expect(warnings.some((w) => w.message.includes('新球員'))).toBe(true)
    const next = applyGameEdit(SEED_DATASET, fragment)
    expect(next.games.find((g) => g.id === 'G20251010-01')?.opponent).toBe('群風（修正）')
    expect(next.roster.some((p) => p.name === '新球員')).toBe(true)
    expect(next.batting.filter((p) => p.gameId === 'G20251010-01').map((p) => p.inning)).toEqual(edit.batting.map((p) => p.inning))
  })

  it('removes a game and all of its rows', () => {
    const next = removeGame(SEED_DATASET, 'G20251222-01')
    expect(next.games.some((g) => g.id === 'G20251222-01')).toBe(false)
    expect(next.batting.some((p) => p.gameId === 'G20251222-01')).toBe(false)
    expect(next.pitching.some((p) => p.gameId === 'G20251222-01')).toBe(false)
  })
})
