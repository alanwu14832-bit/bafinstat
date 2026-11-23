import type { ReactNode } from 'react'
import { Card } from './Card'
import { LineChartCard } from '../charts/LineChartCard'
import type { SpeedSummary } from '../../data/speeds'
import { zhInning } from '../../data/broadcast'

/** The pitcher's games, oldest first. */
export interface SpeedGame { id: string; date: string; opponent: string }

const shortDate = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(m)}/${Number(d)}` }
const one = (v: number) => v.toFixed(1)

function Figure({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-sm)] bg-surface-2/70 px-3 py-2.5">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="figure text-[22px] font-bold text-ink tnum leading-tight">{value}</div>
      {note && <div className="text-[11.5px] text-muted truncate">{note}</div>}
    </div>
  )
}

/**
 * 球速 on a pitcher's page: the fastest, the average and how many pitches were measured, by inning, and (two games or
 * more) a line per game. Nothing is shown for a pitcher with no measured pitch.
 */
export function SpeedCard({ summary, games, onGame }: { summary: SpeedSummary; games: SpeedGame[]; onGame: (d: object) => void }) {
  const byId = new Map(games.map((g) => [g.id, g]))
  const label = (id: string) => { const g = byId.get(id); return g ? `${shortDate(g.date)} vs ${g.opponent}` : id }
  // (in the order of `games`: oldest first)
  const perGame = new Map(summary.byGame.map((g) => [g.gameId, g]))
  const trend = games.filter((g) => perGame.has(g.id)).map((g) => ({ id: g.id, name: shortDate(g.date), 最快: perGame.get(g.id)!.max, 均速: perGame.get(g.id)!.avg }))
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
      <Card title="球速" subtitle={`單位公里／小時；沒有記球種，均速是所有測到的球一起平均（直球、變化球混在一起）。測到 ${summary.n} 球，共投 ${summary.pitches} 球。`}>
        <div className="grid grid-cols-3 gap-2">
          <Figure label="最快" value={summary.max} note={<button type="button" className="underline decoration-dotted underline-offset-2 hover:text-ink cursor-pointer" onClick={() => onGame({ id: summary.maxGameId })}>{label(summary.maxGameId)}</button>} />
          <Figure label="均速" value={one(summary.avg)} note={`${summary.n} 球平均`} />
          <Figure label="測到" value={`${summary.n}`} note={`共 ${summary.pitches} 球`} />
        </div>
        <table className="mt-4 w-full text-[13px] tnum" aria-label="各局球速">
          <thead>
            <tr className="text-[12px] text-muted text-right"><th scope="col" className="text-left font-medium py-1.5">局</th><th scope="col" className="font-medium">測到</th><th scope="col" className="font-medium">均速</th><th scope="col" className="font-medium">最快</th></tr>
          </thead>
          <tbody>
            {summary.byInning.map((r) => (
              <tr key={r.inning} className="border-t border-border text-right">
                <th scope="row" className="text-left font-normal text-ink-2 py-1.5">第{zhInning(r.inning)}局</th>
                <td className="text-muted">{r.n}</td>
                <td className="text-ink">{one(r.avg)}</td>
                <td className="text-ink font-semibold">{r.max}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {trend.length > 1
        ? <LineChartCard title="每場球速" subtitle="每一場的最快與均速（公里／小時）；點一下看那一場" onPointClick={onGame} data={trend} series={[{ key: '最快', label: '最快' }, { key: '均速', label: '均速' }]} formatValue={(v) => String(Math.round(v * 10) / 10)} yDomain={['auto', 'auto']} yWidth={40} />
        : <Card title="每場球速"><p className="text-[13px] text-muted">有兩場以上測到球速後，這裡會畫出每一場的最快和均速。</p></Card>}
    </div>
  )
}
