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
