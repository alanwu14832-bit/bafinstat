import { cleanup, render, screen } from '@testing-library/react'
import { CompletenessCard } from '../components/ui/CompletenessCard'
import type { BattingPA } from '../data/types'

const bat = (p: Partial<BattingPA>): BattingPA => ({ gameId: 'G', inning: 1, batter: '乙', pitches: ['IP'], result: '一安', traj: 'L', loc: 8, sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })

describe('資料完整度 card', () => {
  afterEach(() => cleanup())
  it('shows each detail with its share, what it shrinks, and who has no 打擊慣用', () => {
    render(<CompletenessCard ds={{ roster: [{ name: '乙' }], batting: [bat({}), bat({ pitches: [] })], pitching: [] }} />)
    expect(screen.getByRole('heading', { name: '資料完整度' })).toBeInTheDocument()
    for (const l of ['逐球', '擊球軌跡', '擊球落點', '擊球強度', '出局(前)', '壘上(前)', '棒次', '對方左右手']) expect(screen.getByText(l)).toBeInTheDocument()
    expect(screen.getByText(/沒填打擊慣用的打者/)).toBeInTheDocument()
    expect(screen.getByText(/乙（2 個擊球）/)).toBeInTheDocument()
  })
})
