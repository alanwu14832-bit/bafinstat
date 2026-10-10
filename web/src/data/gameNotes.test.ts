import { describe, expect, it } from 'vitest'
import { gameNotes, pitcherOrder } from './gameNotes'
import { battedOutKind, summarizeGame } from './stats'
import { addPitch, changePitcher, commitPA, defaultPlan, newGame, type RecordState } from '../record/model'
import { SEED_DATASET } from './seed'
import { EMPTY_DATASET, type BattingPA, type Dataset, type Game, type PitchingPA } from './types'

const game: Game = { id: 'G1', date: '2026-03-01', time: '11:40', tournament: 'A', opponent: 'B', homeAway: '主', weather: '晴' }
const b = (p: Partial<BattingPA>): BattingPA => ({ gameId: 'G1', inning: 1, batter: '甲', order: 1, pitches: ['IP'], result: '內滾', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
const p = (x: Partial<PitchingPA>): PitchingPA => ({ gameId: 'G1', inning: 1, pitcher: '甲', pitches: ['IP'], result: '內滾', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...x })
const ds: Dataset = {
  ...EMPTY_DATASET, games: [game],
  batting: [
    b({ result: '一安' }), b({ order: 2, batter: '乙', result: '一安', rbi: 1, outsBefore: 2 }), b({ inning: 2, order: 3, batter: '丙', result: '二安' }),
    b({ inning: 3, order: 4, batter: '丁', result: '全壘打', rbi: 2, outsBefore: 0, run: 1 }), b({ inning: 3, order: 5, batter: '戊', result: '犧飛', rbi: 1, outsBefore: 1 }),
  ],
  pitching: [
    p({ pitches: ['B', 'S', 'IP'], traj: 'G' }), p({ pitches: ['B', 'B', 'S', 'F', 'IP'], result: '外飛', traj: 'F' }), p({ pitches: ['S', 'IP'], result: '一安' }), p({ pitches: ['B', 'IP'] }),
    p({ inning: 2, pitcher: '乙', pitches: ['B', 'S', 'IP'], result: '內飛' }), p({ inning: 2, pitcher: '乙', pitches: ['B', 'IP'] }),
  ],
}
const lineOf = (sections: ReturnType<typeof gameNotes>, title: string, label: string) => sections.find((s) => s.title === title)?.lines.find((l) => l.label === label)?.text

describe('比賽附註', () => {
  it('pitchers in order of appearance', () => {
    expect(pitcherOrder([{ pitcher: '乙' }, { pitcher: '乙' }, { pitcher: '甲' }, { pitcher: '乙' }, { pitcher: '丙' }])).toEqual(['乙', '甲', '丙'])
  })
  it('ground and air outs (stats.battedOutKind)', () => {
    expect(battedOutKind({ result: '內滾' })).toBe('GO')
    expect(battedOutKind({ result: '雙殺', traj: 'G' })).toBe('GO')
    expect(battedOutKind({ result: '雙殺', traj: 'L' })).toBe('AO')
    expect(battedOutKind({ result: '外飛' })).toBe('AO')
    expect(battedOutKind({ result: '界外飛' })).toBe('AO')
    expect(battedOutKind({ result: '犧飛' })).toBe('AO')
    for (const r of ['犧觸', '三振', '一安', '野選', '失誤', '保送']) expect(battedOutKind({ result: r })).toBeNull()
  })
  it('a synthetic game', () => {
    const notes = gameNotes(summarizeGame(ds, game), ds)
    expect(notes.map((s) => s.title)).toEqual(['打擊', '投球', '比賽'])
    expect(lineOf(notes, '投球', '用球數-好球數')).toBe('甲 12-8、乙 5-3')
    expect(lineOf(notes, '投球', '面對打者')).toBe('甲 4、乙 2')
    expect(lineOf(notes, '投球', '滾地－飛球出局')).toBe('甲 2-1、乙 1-1')
    expect(lineOf(notes, '投球', '繼承跑者－回來得分')).toBeUndefined()
    expect(lineOf(notes, '投球', '救援失敗')).toBeUndefined()
    expect(lineOf(notes, '打擊', '二壘安打')).toBe('丙（第 2 局）')
    expect(lineOf(notes, '打擊', '全壘打')).toBe('丁（第 3 局，2 分）')
    expect(lineOf(notes, '打擊', '三壘安打')).toBeUndefined()
    expect(lineOf(notes, '打擊', '打點')).toBe('丁 2、乙 1、戊 1')
    expect(lineOf(notes, '打擊', '兩出局後打點')).toBe('乙 1')
    expect(lineOf(notes, '比賽', '開賽')).toBe('11:40')
    expect(lineOf(notes, '比賽', '比賽時間')).toBeUndefined()
    expect(lineOf(notes, '比賽', '天氣')).toBe('晴')
    const timed = gameNotes(summarizeGame(ds, game), ds, { time: '11:40', endTime: '13:55' })
    expect(lineOf(timed, '比賽', '比賽時間')).toBe('2 小時 15 分（11:40–13:55）')
    expect(lineOf(timed, '比賽', '開賽')).toBeUndefined()
  })
  // home game, 壬 starts: 三振, 保送, 保送; 癸 comes in with two on and lets both score (二安), then 三振, 內滾
  const relief = () => {
    const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))
    let s: RecordState = newGame({ id: 'G2', date: '2026-03-01', tournament: 'A', opponent: 'B', homeAway: '主', innings: 7 }, lineup, '壬')
    const pa = (result: string, pitches: string[], runners: Record<number, 'home'> = {}) => {
      for (const c of pitches) s = addPitch(s, c)
      const plan = defaultPlan(s, result)
      s = commitPA(s, { ...plan, runners: { ...plan.runners, ...runners } })
    }
    pa('三振', ['S', 'S', 'S']); pa('保送', ['B', 'B', 'B', 'B']); pa('保送', ['B', 'B', 'B', 'B'])
    s = changePitcher(s, '癸')
    pa('二安', ['IP'], { 1: 'home', 2: 'home' }); pa('三振', ['S', 'S', 'S']); pa('內滾', ['IP'])
    return s
  }
  const notesOf = (s: RecordState, pitching = s.pitching) => {
    const d: Dataset = { ...EMPTY_DATASET, games: [s.game], batting: s.batting, pitching }
    return gameNotes(summarizeGame(d, s.game), d)
  }
  it('繼承跑者 only for the reliever, in pitchingNotes\' wording', () => {
    const notes = notesOf(relief())
    expect(lineOf(notes, '投球', '繼承跑者－回來得分')).toBe('癸 2-2')
    expect(lineOf(notes, '投球', '滾地－飛球出局')).toBe('癸 1-0')
    expect(lineOf(notes, '投球', '換投紀錄')).toBeUndefined()
    expect(notes.find((x) => x.title === '投球')!.lines.map((l) => l.label)).toEqual(['用球數-好球數', '滾地－飛球出局', '面對打者', '繼承跑者－回來得分'])
  })
  it('a pitching change without the runners recorded: the gap line instead of 繼承跑者', () => {
    const s = relief()
    const notes = notesOf(s, s.pitching.map(({ basesBefore: _b, outsBefore: _o, ...r }) => r as PitchingPA))
    expect(lineOf(notes, '投球', '繼承跑者－回來得分')).toBeUndefined()
    expect(lineOf(notes, '投球', '換投紀錄')).toBe('這場有 1 次換投的跑者紀錄不完整，繼承跑者與救援失敗沒有判斷')
  })
  it('two doubles by one batter, steals and errors', () => {
    const d: Dataset = { ...ds, batting: [b({ result: '二安' }), b({ inning: 5, result: '二安', sb: 2 })], fielding: [{ gameId: 'G1', player: '李', pos: 'SS', po: 0, a: 1, e: 1, dp: 0, pb: 0, sb: 0, cs: 0 }] }
    const notes = gameNotes(summarizeGame(d, game), d)
    expect(lineOf(notes, '打擊', '二壘安打')).toBe('甲 2（第 1、5 局）')
    expect(lineOf(notes, '跑壘', '盜壘')).toBe('甲 2')
    expect(lineOf(notes, '守備', '失誤')).toBe('李')
  })
  it('every seed game gives sections with lines', () => {
    for (const g of SEED_DATASET.games.filter((x) => !x.status)) {
      const notes = gameNotes(summarizeGame(SEED_DATASET, g), SEED_DATASET)
      expect(notes.length).toBeGreaterThan(0)
      for (const s of notes) for (const l of s.lines) expect(l.text).not.toBe('')
    }
  })
})
