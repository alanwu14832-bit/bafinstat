import { describe, expect, it } from 'vitest'
import { addPitch, canSwitchHomeAway, commitPA, defaultPlan, newGame, offense, switchHomeAway } from './model'

const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
const game = { id: 'G20261118-07', date: '2026-11-18', tournament: '練習', opponent: '練習對手', homeAway: '主' as const }

describe('切換主客場 (set wrong at the start)', () => {
  it('flips who bats first and clears the pitches of the batter up', () => {
    const s = addPitch(addPitch(newGame(game, lineup, '甲'), 'B'), 'S')
    expect(offense(s)).toBe('opp')
    const n = switchHomeAway(s)
    expect([n.game.homeAway, offense(n), n.pitches, n.inning, n.half]).toEqual(['客', 'us', [], 1, 'top'])
    expect(switchHomeAway(n).game.homeAway).toBe('主')
  })
  it('only before the first plate appearance is sent', () => {
    let s = newGame(game, lineup, '甲')
    s = commitPA(['B', 'B', 'B', 'B'].reduce((x, p) => addPitch(x, p), s), defaultPlan(s, '保送'))
    expect(canSwitchHomeAway(s)).toBe(false)
    expect(switchHomeAway(s)).toBe(s)
  })
})
