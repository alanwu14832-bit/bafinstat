import { describe, expect, it } from 'vitest'
import { addDays, attendanceRate, canVote, examBreak, expandSeries, isLateReply, tally, voteDeadline, weekdayOf, type Practice, type RollCall, type Vote } from './practice'

const p = (id: string, date: string, status: Practice['status'] = 'scheduled', time = '18:30'): Practice => ({ id, series_id: 's1', date, time, place: null, status, note: null, notified_at: null })

describe('練球 helpers', () => {
  it('addDays and weekdayOf work in UTC regardless of the local zone', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(weekdayOf('2026-09-12')).toBe('六')
  })

  it('the deadline is 09:00 Taipei on the day of practice', () => {
    const x = p('a', '2026-09-15')
    expect(voteDeadline(x).toISOString()).toBe('2026-09-15T01:00:00.000Z')
    expect(isLateReply(x, new Date('2026-09-15T00:59:00Z'))).toBe(false)
    expect(isLateReply(x, new Date('2026-09-15T01:00:01Z'))).toBe(true)
  })

  it('voting stays open until the practice starts, never on a cancelled one', () => {
    const x = p('a', '2026-09-15')
    expect(canVote(x, new Date('2026-09-15T10:00:00Z'))).toBe(true) // 18:00 Taipei
    expect(canVote(x, new Date('2026-09-15T10:31:00Z'))).toBe(false) // 18:31 Taipei
    expect(canVote(p('b', '2026-09-15', 'cancelled'), new Date('2026-09-01T00:00:00Z'))).toBe(false)
  })

  it('an exam break starts seven days before the exam week', () => {
    expect(examBreak('2026-11-09', '2026-11-13')).toEqual({ start_date: '2026-11-02', end_date: '2026-11-13' })
  })

  it('expandSeries produces one row per weekday, skipping breaks and the series bounds', () => {
    const series = [
      { id: 's1', weekday: 2, time: '18:30', place: '台大棒球場', start_date: '2026-09-01', end_date: '2026-09-30', note: null },
      { id: 's2', weekday: 5, time: '17:00', place: null, start_date: '2026-09-10', end_date: '2026-12-31', note: null },
    ]
    const breaks = [{ id: 'b1', label: '期中考', ...examBreak('2026-09-21', '2026-09-25') }]
    const rows = expandSeries(series, breaks, '2026-09-01', '2026-10-05')
    expect(rows.map((r) => `${r.date} ${r.series_id}`)).toEqual([
      '2026-09-01 s1', '2026-09-08 s1', '2026-09-11 s2', '2026-09-29 s1', '2026-10-02 s2',
    ])
    // 09-15 and 09-22 (s1), 09-18 and 09-25 (s2) fall in the break; s1 ends 09-30 so 10-06 is out; s2 starts 09-10 so 09-04 is out
  })

  it('tally counts each active player once', () => {
    const x = p('a', '2026-09-15')
    const votes: Vote[] = [
      { practice_id: 'a', player_name: '甲', status: 'yes', late_reply: false, updated_at: '' },
      { practice_id: 'a', player_name: '乙', status: 'late', late_reply: true, updated_at: '' },
      { practice_id: 'a', player_name: '丙', status: 'no', late_reply: false, updated_at: '' },
      { practice_id: 'other', player_name: '丁', status: 'yes', late_reply: false, updated_at: '' },
    ]
    expect(tally(x, votes, ['甲', '乙', '丙', '丁'])).toEqual({ yes: 1, late: 1, no: 1, none: 1 })
  })

  it('attendanceRate: roll call wins, 小遲 attends, 請假 is excused, silence is an absence, future and cancelled are skipped', () => {
    const now = new Date('2026-09-20T00:00:00Z')
    const practices = [p('p1', '2026-09-01'), p('p2', '2026-09-08'), p('p3', '2026-09-15'), p('p4', '2026-09-10', 'cancelled'), p('p5', '2026-09-29')]
    const votes: Vote[] = [
      { practice_id: 'p1', player_name: '甲', status: 'yes', late_reply: false, updated_at: '' },
      { practice_id: 'p2', player_name: '甲', status: 'late', late_reply: false, updated_at: '' },
      { practice_id: 'p3', player_name: '甲', status: 'no', late_reply: false, updated_at: '' },
      { practice_id: 'p5', player_name: '甲', status: 'yes', late_reply: false, updated_at: '' },
      { practice_id: 'p1', player_name: '乙', status: 'yes', late_reply: false, updated_at: '' },
    ]
    const rolls: RollCall[] = [{ practice_id: 'p1', player_name: '乙', present: false }]
    expect(attendanceRate('甲', practices, votes, rolls, now)).toEqual({ attended: 2, excused: 1, absent: 0, rate: 1 })
    // 乙 said yes but the roll call says absent; no answer on p2/p3 counts as absent
    expect(attendanceRate('乙', practices, votes, rolls, now)).toEqual({ attended: 0, excused: 0, absent: 3, rate: 0 })
    expect(attendanceRate('丙', [], [], [], now).rate).toBeNull()
  })
})
