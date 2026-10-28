import { describe, expect, it } from 'vitest'
import { commitPA, defaultPlan, newGame, oppCycle, otherSide, reentryMode, setOppSlots, setReentryMode, subCandidates, substitute, toGameEdit, type RecordState } from './model'
import { onDeckOf } from './upNext'
import { blankBattingAt, blankPitchingAt, shiftOrders } from './paEdit'
import { auditGame } from '../data/audit'
import { orderCycle, type BattingPA } from '../data/types'

// 友誼賽 with players short: a batting order of 8 (ours) and of 8 (theirs)
const game = { id: 'G20260501-01', date: '2026-05-01', tournament: '友誼賽', opponent: '測試隊', homeAway: '客' as const, innings: 7 }
const eight = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '壬'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'P'][i] }))
const k = (s: RecordState) => commitPA(s, defaultPlan(s, '三振'))
const halves = (s: RecordState, n: number) => { for (let i = 0; i < n * 3; i++) s = k(s); return s }

describe('友誼賽: a batting order of 7 to 12', () => {
  it('turns over after the last batter, ours and theirs, and the saved game reads as in order', () => {
    let s = newGame(game, eight, '壬', { oppSlots: 8 })
    expect(oppCycle(s)).toBe(8)
    s = halves(s, 4)                    // two innings: 6 of ours, 6 of theirs
    s = k(s); s = k(s)                  // our 7th and 8th
    expect(s.slot).toBe(0)              // back to the leadoff man
    s = k(s)
    s = k(s); s = k(s)                  // their 7th and 8th
    expect(s.oppOrder).toBe(1)
    expect(s.batting.map((p) => p.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 1])
    expect(s.pitching.map((p) => p.oppOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    // the next ones up wrap the same way
    const atEight = { ...s, oppOrder: 8, half: s.half }
    expect(onDeckOf({ ...atEight, inning: 3, half: 'bottom' }).onDeck?.order).toBe(1)
    // 修改資料's check: 8 → 1 is in order
    const edit = toGameEdit(s)
    expect(auditGame(edit.batting, edit.pitching, 'editor').filter((i) => i.message.includes('棒次接不上'))).toEqual([])
  })

  it('a slot skipped is still flagged in a lineup of 9', () => {
    const rows = [1, 2, 4].map((order) => ({ gameId: 'g', inning: 1, order, batter: `b${order}`, pitches: [], result: '三振', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, code: order === 4 ? 'III' : order === 2 ? 'II' : 'I' })) as BattingPA[]
    expect(auditGame([...rows, { ...rows[0], order: 9 }], [], 'editor').some((i) => i.message.includes('棒次接不上'))).toBe(true)
  })

  it('修改資料: a row added after the 8th is the 1st, and a deleted row moves the order along 8 slots', () => {
    const s = halves(newGame(game, eight, '壬', { oppSlots: 8 }), 6)
    const bat = s.batting
    expect(blankBattingAt(bat, bat.length, game.id).order).toBe((bat[bat.length - 1].order! % 8) + 1)
    const shifted = shiftOrders(bat, 1, -1)
    expect(shifted.slice(1).map((p) => p.order)).toEqual(bat.slice(1).map((p) => ((p.order! - 2 + 8) % 8) + 1))
    expect(blankPitchingAt(s.pitching, s.pitching.length, game.id).oppOrder).toBe((s.pitching[s.pitching.length - 1].oppOrder! % 8) + 1)
  })

  it('their order can be set to 7 or 8 in the middle of the game; a 隊內賽 side of 7 turns over at 7', () => {
    const s = { ...newGame(game, eight, '壬'), oppOrder: 9 }
    expect(setOppSlots(s, 8)).toEqual(expect.objectContaining({ oppSlots: 8, oppOrder: 1 }))
    expect(setOppSlots(setOppSlots(s, 8), 9).oppSlots).toBeUndefined()
    const intra = newGame(game, eight, '壬', { intra: { team: '紅隊', lineup: ['子', '丑', '寅', '卯', '辰', '巳', '午'].map((name) => ({ name, pos: '' })), pitcher: '午' } })
    expect(oppCycle(intra)).toBe(7)
  })

  it('an order of 11 (ours) and 12 (theirs) turns over after the 11th and the 12th', () => {
    const eleven = [...eight, ...['癸', '子', '丑'].map((name) => ({ name, pos: 'DH' }))]
    let s = newGame(game, eleven, '壬', { oppSlots: 12 })
    expect(oppCycle(s)).toBe(12)
    s = halves(s, 8)                    // four innings: 12 of ours, 12 of theirs
    expect(s.batting.map((p) => p.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 1])
    s = halves(s, 1); s = k(s)          // their 13th is the 1st again
    expect(s.pitching.slice(0, 13).map((p) => p.oppOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1])
    expect(orderCycle(s.batting.map((p) => p.order))).toBe(11)
    // before it turns over, the highest slot up so far (a row added after the 10th is the 11th)
    expect(orderCycle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(10)
    expect(setOppSlots(s, 13).oppSlots).toBe(12)
    const edit = toGameEdit(s)
    expect(auditGame(edit.batting, edit.pitching, 'editor').filter((i) => i.message.includes('棒次接不上'))).toEqual([])
  })

  it('被換下的球員: 不能再上場, 依大專規則 or 自由替換 (a 隊內賽 is always 自由替換)', () => {
    let s = newGame(game, eight, '壬', { bench: ['癸'], freeReentry: true })
    expect(reentryMode(s)).toBe('free')
    s = substitute(s, 0, '癸', 'C')                   // 甲 leaves for 癸
    s = substitute(s, 0, '甲', 'C')                   // and comes back
    s = substitute(s, 0, '癸', 'C')                   // 癸 (not a starter) comes back too
    expect(s.lineup[0].name).toBe('癸')
    const free = subCandidates(s, ['甲', '癸'], 'batter')
    expect(free.disabled.size).toBe(0)
    expect(free.tag('甲')).toBe('（已下場・可再上場）')
    const college = subCandidates(setReentryMode(s, 'college'), ['甲', '癸'], 'batter')
    expect(college.tag('甲')).toContain('已經再上場過一次')
    const none = setReentryMode(s, 'none')
    expect(reentryMode(none)).toBe('none')
    expect(subCandidates(none, ['甲'], 'batter').disabled.has('甲')).toBe(true)
    expect(reentryMode(setReentryMode(none, 'free'))).toBe('free')
    const intra = newGame(game, eight, '壬', { intra: { team: '紅隊', lineup: Array.from({ length: 12 }, (_, i) => ({ name: `白${i + 1}`, pos: '' })), pitcher: '白12' } })
    expect(reentryMode(intra)).toBe('free')
    expect(oppCycle(intra)).toBe(12)
    expect(otherSide(intra).lineup).toHaveLength(12)
    expect(reentryMode(otherSide(intra))).toBe('free')
  })
})
