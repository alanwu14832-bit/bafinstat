import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { NAV_ITEMS } from '../components/layout/nav'
import { useUiStore } from '../store/ui'

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AppShell>
        <div>content</div>
      </AppShell>
    </MemoryRouter>,
  )
}

describe('AppShell', () => {
  beforeEach(() => {
    useUiStore.setState({ sidebarCollapsed: false, mobileNavOpen: false })
  })

  it('renders every nav link with the correct href', () => {
    renderShell()
    const nav = screen.getAllByRole('navigation', { name: '主選單' })[0]
    for (const item of NAV_ITEMS) {
      const link = nav.querySelector(`a[href="${item.to}"]`)
      expect(link, `link for ${item.label}`).not.toBeNull()
      expect(link).toHaveAttribute('aria-label', item.label)
    }
  })

  it('toggles the sidebar collapsed state and width', () => {
    renderShell()
    const sidebar = screen.getByTestId('sidebar')
    expect(sidebar).toHaveAttribute('data-collapsed', 'false')
    expect(sidebar.style.width).toBe('248px')

    fireEvent.click(screen.getByRole('button', { name: '收合側邊欄' }))
    expect(useUiStore.getState().sidebarCollapsed).toBe(true)
    expect(sidebar).toHaveAttribute('data-collapsed', 'true')

    // Ctrl+B expands it again.
    act(() => {
      fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
    })
    expect(useUiStore.getState().sidebarCollapsed).toBe(false)
    expect(sidebar).toHaveAttribute('data-collapsed', 'false')
  })
})
