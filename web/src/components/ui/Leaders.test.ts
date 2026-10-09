import { describe, expect, it } from 'vitest'
import { leaderOf, tieNote } from './Leaders'

type B = { name: string; avg: number; slg: number; obp: number; ab: number; rbi: number; hr: number; tb: number }
const b = (name: string, p: Partial<B>): B => ({ name, avg: 0, slg: 0, obp: 0, ab: 0, rbi: 0, hr: 0, tb: 0, ...p })

describe('leaderOf with tie-breaks (大專規程)', () => {
  it('打擊率 tied: 長打率 equal, 上壘率 decides', () => {
    const rows = [b('甲', { avg: 2 / 5, slg: 0.6, obp: 0.45 }), b('乙', { avg: 4 / 10, slg: 0.6, obp: 0.5 })]
    const l = leaderOf(rows, (r) => r.avg, { ties: [{ get: (r) => r.slg, label: '長打率' }, { get: (r) => r.obp, label: '上壘率' }] })
    expect(l).toMatchObject({ names: ['乙'], by: '上壘率', tied: 2 })
    expect(tieNote(l)).toBe('同率 2 人，比上壘率')
  })
  it('防禦率: a float-noise tie is a tie, more outs wins', () => {
    const era = (er: number, outs: number) => (er * 7) / (outs / 3)
    const rows = [{ name: '甲', era: era(3, 30), outs: 30, h: 9 }, { name: '乙', era: era(1, 10), outs: 10, h: 2 }]
    const l = leaderOf(rows, (r) => r.era, { low: true, ties: [{ get: (r) => r.outs, label: '投球局數' }, { get: (r) => r.h, low: true, label: '被安打少' }] })
    expect(l).toMatchObject({ names: ['甲'], by: '投球局數', tied: 2 })
  })
  it('打點 tied: fewer at-bats wins; 全壘打 tied with equal at-bats: more 打點 wins', () => {
    const rbi = leaderOf([b('甲', { rbi: 5, ab: 20, tb: 9 }), b('乙', { rbi: 5, ab: 15, tb: 3 })], (r) => r.rbi, { ties: [{ get: (r) => r.ab, low: true, label: '打數少' }, { get: (r) => r.tb, label: '壘打數' }] })
    expect(rbi).toMatchObject({ names: ['乙'], by: '打數少' })
    const hr = leaderOf([b('甲', { hr: 2, ab: 15, rbi: 4 }), b('乙', { hr: 2, ab: 15, rbi: 7 })], (r) => r.hr, { ties: [{ get: (r) => r.ab, low: true, label: '打數少' }, { get: (r) => r.rbi, label: '打點' }] })
    expect(hr).toMatchObject({ names: ['乙'], by: '打點', tied: 2 })
  })
  it('without ties both names stay (as before), and nobody is the leader of nothing', () => {
    const rows = [b('甲', { rbi: 5, ab: 20 }), b('乙', { rbi: 5, ab: 15 })]
    expect(leaderOf(rows, (r) => r.rbi)).toEqual({ value: 5, names: ['甲', '乙'] })
    expect(tieNote(leaderOf(rows, (r) => r.rbi))).toBe('')
    expect(leaderOf([b('甲', {})], (r) => r.hr)).toBeNull()
  })
})
