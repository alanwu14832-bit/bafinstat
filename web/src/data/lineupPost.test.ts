import { describe, expect, it } from 'vitest'
import { lineupPostDate, lineupPostRows, lineupPostVenue } from './lineupPost'
import { emptyLineup } from '../record/lineup'

describe('先發陣容 IG 貼文', () => {
  it('the rows follow the batting order with the positions; under a DH the pitcher is SP at the bottom', () => {
    const l = { ...emptyLineup(), field: { P: '投', C: '捕', SS: '游' }, dh: '指', order: ['游', '指', '捕', '', '', '', '', '', ''] }
    expect(lineupPostRows(l)).toEqual([{ pos: 'SS', name: '游' }, { pos: 'DH', name: '指' }, { pos: 'C', name: '捕' }, { pos: 'SP', name: '投' }])
    // no DH: the pitcher bats, written P in his slot
    const n = { ...emptyLineup(), field: { P: '投', C: '捕' }, order: ['捕', '投', '', '', '', '', '', '', ''] }
    expect(lineupPostRows(n)).toEqual([{ pos: 'C', name: '捕' }, { pos: 'P', name: '投' }])
  })
  it('the date line and the venue', () => {
    expect(lineupPostDate({ date: '2026-10-18', time: '15:00' })).toBe('SUN, 10/18/2026 | 3:00 PM')
    expect(lineupPostDate({ date: '2026-10-18', time: '09:30' })).toBe('SUN, 10/18/2026 | 9:30 AM')
    expect(lineupPostDate({ date: '2026-10-18' })).toBe('SUN, 10/18/2026')
    expect(lineupPostDate(undefined)).toBe('')
    expect(lineupPostVenue({ venue: ' 台大棒球場 ' })).toBe('@台大棒球場')
    expect(lineupPostVenue({})).toBe('')
  })
})
