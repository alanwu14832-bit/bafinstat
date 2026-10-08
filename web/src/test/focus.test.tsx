/** Keyboard focus in the filter sheet and the sign-in dialog. */
import { describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { Sheet } from '../components/ui/Sheet'
import { AuthDialog } from '../components/ui/AuthDialog'

const frame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())))

function Filters() {
  const [from, setFrom] = useState('')
  // an inline onClose, a new function on every render, like the top bar's filter sheet
  return <Sheet open onClose={() => undefined} ariaLabel="篩選"><input aria-label="開始日期" value={from} onChange={(e) => setFrom(e.target.value)} /></Sheet>
}

describe('focus', () => {
  it('typing in the filter sheet keeps the focus in the field', async () => {
    render(<Filters />)
    await frame()
    const input = screen.getByLabelText('開始日期')
    input.focus()
    fireEvent.change(input, { target: { value: '2026-10-01' } })
    await frame(); await frame()
    expect(document.activeElement).toBe(input)
    cleanup()
  })
  it('the sign-in dialog keeps Tab inside, makes the page inert, and gives the focus back', async () => {
    const root = document.createElement('div'); root.id = 'root'
    const opener = document.createElement('button'); opener.textContent = '登入'
    root.appendChild(opener); document.body.appendChild(root)
    opener.focus()
    const { rerender } = render(<AuthDialog open onClose={() => undefined} />)
    expect(root.hasAttribute('inert')).toBe(true)
    const close = screen.getByRole('button', { name: '關閉' })
    close.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(close)
    rerender(<AuthDialog open={false} onClose={() => undefined} />)
    expect(root.hasAttribute('inert')).toBe(false)
    expect(document.activeElement).toBe(opener)
    cleanup(); root.remove()
  })
})
