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

// iOS Safari applies :active (our pressed states) only when a touch listener exists up the tree.
document.addEventListener('touchstart', () => undefined, { passive: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
