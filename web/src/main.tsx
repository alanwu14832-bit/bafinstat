import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// Use the team logo as the tab icon when web/public/mark.png exists; otherwise keep the inline SVG monogram.
const logo = new Image()
logo.onload = () => {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (link) link.href = logo.src
}
logo.src = `${import.meta.env.BASE_URL}mark.png`

// The practice reminders are gone; remove the service worker they needed from anyone who already has it.
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister())).catch(() => undefined)
}

// Pressed states. A mouse gets :active; a finger does not reliably (iOS needs a touch listener, Android
// delays it to rule out a scroll), so touches mark the element with data-pressed from the moment they land.
// A scroll takes the pointer over (pointercancel), which lifts the mark so a swiped-past card never sinks.
document.addEventListener('touchstart', () => undefined, { passive: true })
const PRESSABLE = 'button, [role="button"], [role="tab"], summary, .press, .lift'
let pressed: Element | null = null
const release = () => { pressed?.removeAttribute('data-pressed'); pressed = null }
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') return
  release()
  const el = (e.target as Element | null)?.closest?.(PRESSABLE)
  if (!el || el.matches(':disabled')) return
  pressed = el
  el.setAttribute('data-pressed', '')
}, { passive: true })
for (const type of ['pointerup', 'pointercancel', 'dragstart'] as const) document.addEventListener(type, release, { passive: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
