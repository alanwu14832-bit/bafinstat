import { useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { GameView, type GameTab } from './GameView'
import { useStats } from '../hooks/useStats'
import { summarizeGame } from '../data/stats'

const TABS: GameTab[] = ['summary', 'box', 'bat', 'pit', 'roster']

/**
 * The full game page (/games/:id): the same game as the quick view on 比賽, on its own page so it can be read at
 * length, shared, and linked straight to a tab or a half-inning (?tab=bat&inning=3). Closing returns to the list.
 */
export function GamePage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const s = useStats()
  const game = s.dataset.games.find((g) => g.id === id)
  const summary = useMemo(() => (game ? summarizeGame(s.dataset, game) : null), [game, s.dataset])
  const tab = params.get('tab') as GameTab | null
  const inning = Number(params.get('inning')) || undefined
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/games?view=results'))
  if (!summary) return <Card><EmptyState title="找不到這場比賽" description={`比賽 ID ${id} 不在目前的資料裡。`} action={<Button size="sm" variant="outline" to="/games?view=results">回比賽列表</Button>} /></Card>
  return <GameView key={id} summary={summary} mode="page" onClose={back} initialTab={tab && TABS.includes(tab) ? tab : inning ? 'bat' : 'summary'} inning={inning} />
}
