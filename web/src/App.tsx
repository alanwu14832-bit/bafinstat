import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import {
  BattingPage, DictionaryPage, FieldingPage, GamesPage, GuidePage, ImportPage, NotFoundPage, OverviewPage, PitchingPage, PlayersPage, RecordPage, LivePage, LineupPage, PhotosPage, SchedulePage,
} from './pages'

/** GitHub Pages serves from a sub-path; strip the trailing slash for the router basename. */
export const ROUTER_BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '')

export function AppRoutes() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/batting" element={<BattingPage />} />
        <Route path="/pitching" element={<PitchingPage />} />
        <Route path="/fielding" element={<FieldingPage />} />
        <Route path="/players" element={<PlayersPage />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/live" element={<LivePage />} />
        <Route path="/photos" element={<PhotosPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/lineup" element={<LineupPage />} />
        <Route path="/record" element={<RecordPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/dictionary" element={<DictionaryPage />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  )
}

/** The single-file build (Artifact / file://) has no server-side routing, so it uses hash routes. */
const USE_HASH = import.meta.env.VITE_ROUTER === 'hash'

export default function App() {
  if (USE_HASH) return <HashRouter><AppRoutes /></HashRouter>
  return (
    <BrowserRouter basename={ROUTER_BASENAME}>
      <AppRoutes />
    </BrowserRouter>
  )
}
