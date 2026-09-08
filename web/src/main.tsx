import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// Use the team logo as the tab icon when web/public/logo.png exists; otherwise keep the inline SVG monogram.
const logo = new Image()
logo.onload = () => {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (link) link.href = logo.src
}
logo.src = `${import.meta.env.BASE_URL}logo.png`

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
