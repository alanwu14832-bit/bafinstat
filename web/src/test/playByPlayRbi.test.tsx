import { render, screen } from '@testing-library/react'
import { BattingPlayByPlay } from '../components/ui/PlayByPlay'
import type { BattingPA } from '../data/types'

const row = (p: Partial<BattingPA>): BattingPA => ({ gameId: 'G', inning: 8, order: 1, batter: '甲', pitches: [], result: '一安', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, basesBefore: '無', outsBefore: 0, ...p })

describe('逐打席 on 紀錄比賽: 打點 −／＋', () => {
  it('is on plate appearances but not on a 突破僵局 runner (he never has an RBI)', () => {
    render(<BattingPlayByPlay pas={[row({ batter: '甲', result: '突破僵局' }), row({ batter: '乙', order: 2, basesBefore: '2' })]} onRbi={() => {}} />)
    expect(screen.queryByRole('button', { name: /甲 打點加一/ })).toBeNull()
    expect(screen.getByRole('button', { name: /乙 打點加一/ })).toBeTruthy()
  })
})

describe('逐打席: 代跑 on both sides', () => {
  it('the pitching side marks the opponent pinch runner like ours (named, or just 代跑)', async () => {
    const { PitchingPlayByPlay } = await import('../components/ui/PlayByPlay')
    const prow = { gameId: 'G', inning: 1, pitcher: '壬', oppOrder: 3, oppBatter: '王', pitches: ['IP'], result: '一安', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, basesBefore: '無', outsBefore: 0, code: 'ER' }
    const { container, unmount } = render(<PitchingPlayByPlay pas={[{ ...prow, runner: '12號' }, { ...prow, oppOrder: 4, oppBatter: undefined, runner: '對方代跑' }]} />)
    const text = container.textContent ?? ''
    expect(text).toContain('代跑 12號')
    expect(text).not.toContain('代跑 對方代跑')
    unmount()
    render(<BattingPlayByPlay pas={[row({ inning: 1, runner: '乙', run: 1, code: 'R' })]} />)
    expect(screen.getByText(/代跑 乙/)).toBeTruthy()
  })
})
