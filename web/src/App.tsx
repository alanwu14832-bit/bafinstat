import { lazy, Suspense, useEffect, type ComponentType } from 'react'
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { Skeleton } from './components/ui/Skeleton'
import { PageErrorBoundary } from './components/layout/PageErrorBoundary'

// Each page is its own file to download (the charts, the Excel reader and the recording screen are big), so the first
// page opens sooner. Shortly after the site opens every page is fetched in the background, so moving to another page —
// even after the signal drops at the field — does not wait for the network.
const PAGES = {
  overview: () => import('./pages/Overview'), batting: () => import('./pages/Batting'), pitching: () => import('./pages/Pitching'),
  fielding: () => import('./pages/Fielding'), players: () => import('./pages/Players'), games: () => import('./pages/Games'),
  game: () => import('./pages/GamePage'), live: () => import('./pages/Live'), photos: () => import('./pages/Photos'),
  lineup: () => import('./pages/Lineup'), record: () => import('./pages/Record'), import: () => import('./pages/Import'),
  dictionary: () => import('./pages/Dictionary'), guide: () => import('./pages/Guide'), versions: () => import('./pages/Versions'),
  notFound: () => import('./pages/NotFound'),
  // batch 3: 投手休息表, 紀錄員小抄
  pitcherRest: () => import('./pages/PitcherRest'), cheatSheet: () => import('./pages/CheatSheet'),
}
const page = <M,>(load: () => Promise<M>, name: keyof M) => lazy(() => load().then((m) => ({ default: m[name] as ComponentType })))
const OverviewPage = page(PAGES.overview, 'OverviewPage')
const BattingPage = page(PAGES.batting, 'BattingPage')
const PitchingPage = page(PAGES.pitching, 'PitchingPage')
const FieldingPage = page(PAGES.fielding, 'FieldingPage')
const PlayersPage = page(PAGES.players, 'PlayersPage')
const GamesPage = page(PAGES.games, 'GamesPage')
const GamePage = page(PAGES.game, 'GamePage')
const LivePage = page(PAGES.live, 'LivePage')
const PhotosPage = page(PAGES.photos, 'PhotosPage')
const LineupPage = page(PAGES.lineup, 'LineupPage')
const RecordPage = page(PAGES.record, 'RecordPage')
const ImportPage = page(PAGES.import, 'ImportPage')
const DictionaryPage = page(PAGES.dictionary, 'DictionaryPage')
const GuidePage = page(PAGES.guide, 'GuidePage')
const VersionsPage = page(PAGES.versions, 'VersionsPage')
const NotFoundPage = page(PAGES.notFound, 'NotFoundPage')
const PitcherRestPage = page(PAGES.pitcherRest, 'PitcherRestPage')
const CheatSheetPage = page(PAGES.cheatSheet, 'CheatSheetPage')

/** Fetch every page in the background once the first one has had its turn. */
function usePrefetchPages() {
  useEffect(() => {
    const all = () => { for (const load of Object.values(PAGES)) void load().catch(() => undefined) }
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
    const t = window.setTimeout(() => (idle ? idle(all, { timeout: 4000 }) : all()), 1500)
    return () => window.clearTimeout(t)
  }, [])
}

/** While a page's file arrives (only the first time, usually a blink): the shape of a page. */
function PageLoading() {
  return (
    <div aria-busy="true" aria-label="載入中" className="flex flex-col gap-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

/** GitHub Pages serves from a sub-path; strip the trailing slash for the router basename. */
export const ROUTER_BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '')

export function AppRoutes() {
  usePrefetchPages()
  const { pathname } = useLocation()
  return (
    <AppShell>
      <PageErrorBoundary resetKey={pathname}>
      <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/batting" element={<BattingPage />} />
        <Route path="/pitching" element={<PitchingPage />} />
        <Route path="/pitching/rest" element={<PitcherRestPage />} />
        <Route path="/fielding" element={<FieldingPage />} />
        <Route path="/players" element={<PlayersPage />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/games/:id" element={<GamePage />} />
        <Route path="/live" element={<LivePage />} />
        <Route path="/photos" element={<PhotosPage />} />
        <Route path="/schedule" element={<Navigate to="/games?view=schedule" replace />} />
        <Route path="/lineup" element={<LineupPage />} />
        <Route path="/record" element={<RecordPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/dictionary" element={<DictionaryPage />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/guide/cheatsheet" element={<CheatSheetPage />} />
        <Route path="/versions" element={<VersionsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
      </PageErrorBoundary>
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
