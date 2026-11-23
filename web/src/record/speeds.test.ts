import { describe, expect, it } from 'vitest'
import { addPitch, commitPA, defaultPlan, newGame, setSpeed, setSpeedOn, speedAsked, undoPitch } from './model'
import { alignSpeeds, parseSpeedsText, speedsText } from '../data/speeds'
import { rowsToDataset, toBattingRow, toPitchingRow } from '../data/supabase'

const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
const game = { id: 'G20261123-01', date: '2026-11-23', tournament: '練習', opponent: '練習對手', homeAway: '主' as const }

describe('球速', () => {
  it('asked for our pitcher while we field, theirs while we bat — each switch on its own', () => {
    let s = newGame(game, lineup, '甲')
    expect(speedAsked(s)).toBe(false)
    s = setSpeedOn(s, 'opp', true)
    expect(speedAsked(s)).toBe(false)   // we field (主: they bat first): our pitcher's switch is off
    s = setSpeedOn(s, 'us', true)
    expect(speedAsked(s)).toBe(true)
  })
  it('one per pitch, null when not measured; an undone pitch takes its speed; the row gets them lined up', () => {
    let s = setSpeedOn(newGame(game, lineup, '甲'), 'us', true)
    s = setSpeed(addPitch(s, 'S'), 0, 132)
    s = addPitch(s, 'B')                       // skipped
    s = setSpeed(addPitch(s, 'S'), 2, 135)
    expect(s.speeds).toEqual([132, null, 135])
    s = undoPitch(s)
    expect(s.speeds).toEqual([132, null])
    s = setSpeed(addPitch(s, 'SS'), 2, 999)    // out of range: not kept
    s = setSpeed(addPitch(s, 'SS'), 3, 138)
    s = commitPA(s, defaultPlan(s, '三振'))
    expect(s.pitching[0].speeds).toEqual([132, null, null, 138])
    expect(s.speeds).toBeUndefined()
    // a plate appearance with none measured carries none
    s = commitPA(addPitch(addPitch(addPitch(s, 'S'), 'S'), 'S'), defaultPlan(s, '三振'))
    expect(s.pitching[1].speeds).toBeUndefined()
  })
  it('the cloud row: pitch_speeds only when one was measured, and read back lined up', () => {
    const pit = { gameId: 'G', inning: 1, pitcher: '甲', pitches: ['S', 'B', 'IP'], result: '一安', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, speeds: [132, null, 130] }
    expect(toPitchingRow(pit, 1).pitch_speeds).toEqual([132, null, 130])
    expect('pitch_speeds' in toPitchingRow({ ...pit, speeds: undefined }, 1)).toBe(false)
    const bat = { gameId: 'G', inning: 1, batter: '乙', pitches: ['B'], result: '保送', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, speeds: [121] }
    const ds = rowsToDataset({ players: [], games: [], fielding: [], batting: [{ ...toBattingRow(bat, 1) }], pitching: [{ ...toPitchingRow(pit, 1), pitch_speeds: [132, null] } as never] })
    expect(ds.batting[0].speeds).toEqual([121])
    expect(ds.pitching[0].speeds).toEqual([132, null, null])
  })
  it('修改資料 text: 「132,,128」 both ways', () => {
    expect(parseSpeedsText('132,,128', 3)).toEqual([132, null, 128])
    expect(parseSpeedsText(' ', 3)).toBeUndefined()
    expect(speedsText([132, null, 128])).toBe('132,,128')
    expect(alignSpeeds([132], 3)).toEqual([132, null, null])
  })
})
