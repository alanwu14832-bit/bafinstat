import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { LineupPostDialog } from '../components/ui/LineupPostDialog'
import { emptyLineup } from '../record/lineup'

const lineup = { ...emptyLineup(), field: { P: '蔡奇霖', C: '吳沛衡', '1B': '陳奎佑', '3B': '王廷宇' }, dh: '黃穎晟', order: ['王廷宇', '陳奎佑', '吳沛衡', '黃穎晟', '', '', '', '', ''] }
const game = { id: 'G20261018-01', date: '2026-10-18', time: '15:00', tournament: '新生盃', opponent: 'SSWINDS', homeAway: '主' as const, venue: 'NTU BASEBALL FIELD' }

describe('先發陣容 IG 貼文', () => {
  beforeAll(() => { HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext })
  afterEach(() => cleanup())
  it('the batting order and the SP under a DH; the player in the photo picked from them; the date and the field from the game', () => {
    render(<LineupPostDialog open onClose={() => undefined} lineup={lineup} game={game} />)
    const dlg = screen.getByRole('dialog', { name: '先發陣容 IG 貼文' })
    expect(within(dlg).getByRole('img').getAttribute('aria-label')).toBe('先發陣容貼文預覽：王廷宇、陳奎佑、吳沛衡、黃穎晟、蔡奇霖')
    const who = within(dlg).getByLabelText('照片裡的球員') as HTMLSelectElement
    expect([...who.options].map((o) => o.value)).toEqual(['', '王廷宇', '陳奎佑', '吳沛衡', '黃穎晟', '蔡奇霖'])
    fireEvent.change(who, { target: { value: '吳沛衡' } })
    expect(who.value).toBe('吳沛衡')
    expect((within(dlg).getByLabelText('日期時間') as HTMLInputElement).value).toBe('SUN, 10/18/2026 | 3:00 PM')
    expect((within(dlg).getByLabelText('場地') as HTMLInputElement).value).toBe('@NTU BASEBALL FIELD')
    expect(within(dlg).getByLabelText('選球員照片')).toHaveAttribute('accept', 'image/*')
    expect(within(dlg).getByRole('button', { name: '下載圖片' })).toBeEnabled()
  })
  it('says so when the order is empty', () => {
    render(<LineupPostDialog open onClose={() => undefined} lineup={emptyLineup()} />)
    expect(screen.getByText('打序還沒排：先在「打序」排好再來做貼文。')).toBeInTheDocument()
  })
})
