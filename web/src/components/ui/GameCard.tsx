import { cx } from '../../lib/format'
import { Badge } from './Badge'
import { HeroGlow } from './HeroGlow'
import { TeamLogo } from './TeamLogo'
import { battingLines, type BattingLine, type GameSummary } from '../../data/stats'
import type { Dataset } from '../../data/types'

const WEEK = ['日', '一', '二', '三', '四', '五', '六']
const dayLabel = (iso: string) => { const d = new Date(`${iso}T00:00:00`); return Number.isNaN(d.getTime()) ? iso : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）` }

/** 勝 / 敗 / 和 as a small scoreboard plate: the team colour carries the wins (as on the homepage). */
export function ResultPlate({ result, className }: { result: GameSummary['result']; className?: string }) {
  return (
    <span className={cx('figure inline-flex items-center justify-center size-9 rounded-[10px] text-[17px] font-bold leading-none shrink-0',
      result === 'W' ? 'bg-accent text-accent-ink' : result === 'L' ? 'bg-surface-3 text-ink-2' : 'border border-border-strong text-ink-2', className)}>
      {result === 'W' ? '勝' : result === 'L' ? '敗' : '和'}
    </span>
  )
}

/** The opponent's mark: its first character on a neutral tile (we have no logos for other teams). */
function OppMark({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <span aria-hidden style={{ width: size, height: size, fontSize: size * 0.5 }} className="shrink-0 rounded-[7px] bg-surface-3 text-ink-2 font-semibold inline-flex items-center justify-center">
      {Array.from(name.trim())[0] ?? '?'}
    </span>
  )
}

export interface GameStar { name: string; text: string }

/** A game's 本場焦點: the batter with the most hits + RBI + runs (home runs count double); none when nobody hit. */
export function gameStar(ds: Dataset, gameId: string): GameStar | undefined {
  const lines = battingLines(ds, ds.batting.filter((p) => p.gameId === gameId))
  let best: BattingLine | undefined, score = 0
  for (const l of lines) { const v = l.h * 2 + l.hr * 2 + l.rbi * 1.5 + l.r; if (v > score) { score = v; best = l } }
  if (!best || best.h + best.rbi <= 0) return undefined
  return { name: best.name, text: [`${best.ab} 打數 ${best.h} 安`, best.hr && `${best.hr} 轟`, best.rbi && `${best.rbi} 打點`, best.r && `${best.r} 得分`].filter(Boolean).join('・') }
}

/**
 * One game as a small scoreboard: date and tournament, both teams with their runs (the winner in full ink), the line
 * score by inning with R / H / E, and who decided it. A win glows faintly in the team colour like the homepage hero.
 */
export function GameCard({ s, teamName, star, onOpen, className }: { s: GameSummary; teamName: string; star?: GameStar; onOpen: () => void; className?: string }) {
  const g = s.game
  const win = s.result === 'W'
  const n = Math.max(g.innings ?? 0, s.lineUs.length, s.lineOpp.length, 1)
  const teams = [
    { key: 'us', name: teamName, mark: <TeamLogo size={22} />, runs: s.runsUs, line: s.lineUs, h: s.hitsUs, e: s.errorsUs, won: s.runsUs > s.runsOpp },
    { key: 'opp', name: g.opponent, mark: <OppMark name={g.opponent} />, runs: s.runsOpp, line: s.lineOpp, h: s.hitsOpp, e: s.errorsOpp, won: s.runsOpp > s.runsUs },
  ]
  // innings at a fixed width (a 5-inning game does not stretch), R / H / E pinned right behind a divider
  const cols = `repeat(${n}, minmax(0, 1.5rem)) minmax(0.25rem, 1fr) 1.6rem 1.6rem 1.6rem`
  const decided = [g.winningPitcher && `勝投 ${g.winningPitcher}`, g.losingPitcher && `敗投 ${g.losingPitcher}`, g.savePitcher && `救援 ${g.savePitcher}`].filter(Boolean).join('・')
  return (
    <button type="button" onClick={onOpen} aria-label={`${g.date} ${teamName} ${s.runsUs} 比 ${s.runsOpp} ${g.opponent}，${win ? '勝' : s.result === 'L' ? '敗' : '和'}，看這場`}
      className={cx('lift group relative overflow-hidden text-left rounded-[var(--radius)] bg-surface shadow-[var(--shadow-card)] p-4 md:p-5 flex flex-col gap-3.5 cursor-pointer min-w-0', className)}>
      {win && <HeroGlow size="sm" strength={0.75} />}
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] text-ink-2 tnum">{dayLabel(g.date)}</div>
          <div className="text-[11px] text-muted mt-0.5 truncate">{[g.tournament, g.homeAway === '主' ? '主場' : '客場', g.venue].filter(Boolean).join('・')}</div>
        </div>
        <span className="inline-flex items-center gap-1.5">{g.isDemo && <Badge variant="outline">示範</Badge>}<ResultPlate result={s.result} /></span>
      </div>
      <div className="relative flex flex-col gap-1.5">
        {teams.map((t) => (
          <div key={t.key} className="flex items-center gap-2.5 min-w-0">
            {t.mark}
            <span className={cx('min-w-0 flex-1 truncate text-[14px]', t.won ? 'font-semibold text-ink' : 'text-ink-2')}>{t.name}</span>
            <span className={cx('figure text-[28px] leading-none font-bold tabular-nums', t.won ? 'text-ink' : 'text-muted')}>{t.runs}</span>
          </div>
        ))}
      </div>
      <div className="relative rounded-[10px] bg-surface-2 px-2.5 py-2 text-[11px] tabular-nums" aria-hidden>
        <div className="grid gap-x-0.5 text-center text-muted" style={{ gridTemplateColumns: cols }}>
          {Array.from({ length: n }, (_, i) => <span key={i}>{i + 1}</span>)}
          <span /><span className="font-semibold text-ink-2 border-l border-border">R</span><span>H</span><span>E</span>
        </div>
        {teams.map((t) => (
          <div key={t.key} className={cx('grid gap-x-0.5 text-center figure text-[13px] mt-0.5', t.key === 'us' ? 'text-ink' : 'text-ink-2')} style={{ gridTemplateColumns: cols }}>
            {Array.from({ length: n }, (_, i) => {
              const v = t.line[i]
              return <span key={i} className={v ? 'font-semibold' : 'text-muted'}>{v ?? 0}</span>
            })}
            <span /><span className="font-bold border-l border-border">{t.runs}</span><span>{t.h}</span><span>{t.e}</span>
          </div>
        ))}
      </div>
      {(decided || star) && (
        <div className="relative flex flex-col gap-0.5 text-[12px] text-ink-2 min-w-0">
          {star && <span className="truncate"><span className="text-accent font-semibold">本場焦點</span> {star.name} {star.text}</span>}
          {decided && <span className="truncate text-muted">{decided}</span>}
        </div>
      )}
    </button>
  )
}
