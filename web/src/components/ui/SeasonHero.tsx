import { Link } from 'react-router-dom'
import { ArrowUpRight, CalendarDays } from 'lucide-react'
import { cx } from '../../lib/format'
import { f3, signedInt } from '../../lib/fmt'
import { RollingNumber } from '../motion/RollingNumber'
import { Reveal } from '../motion/Reveal'
import { TeamLogo } from './TeamLogo'
import { Stitches } from './Scoreboard'
import { HeroGlow } from './HeroGlow'
import type { Story } from '../../data/stories'
import type { GameSummary, TeamSummary } from '../../data/stats'
import type { Game } from '../../data/types'

const WEEK = ['日', '一', '二', '三', '四', '五', '六']
const dayLabel = (iso: string) => { const d = new Date(`${iso}T00:00:00`); return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）` }

function ResultChip({ s }: { s: GameSummary }) {
  const r = s.result
  return (
    <Link to={`/games?game=${encodeURIComponent(s.game.id)}`} title={`${s.game.date} vs ${s.game.opponent} ${s.runsUs}：${s.runsOpp}`}
      className={cx('press inline-flex flex-col items-center justify-center w-11 h-12 rounded-[10px] text-[11px] leading-none gap-1 transition-colors',
        r === 'W' ? 'bg-accent text-accent-ink' : r === 'L' ? 'bg-surface-3 text-ink-2' : 'border border-border-strong text-ink-2')}>
      <span className="figure text-[17px] font-bold">{r === 'W' ? '勝' : r === 'L' ? '敗' : '和'}</span>
      <span className="figure tabular-nums opacity-80">{s.runsUs}:{s.runsOpp}</span>
    </Link>
  )
}

export function StoryCard({ s, i, link = true }: { s: Story; i: number; link?: boolean }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={cx('text-[11px] font-semibold tracking-[0.08em]', s.tone === 'bad' ? 'text-critical' : 'text-accent')}>{s.kicker}</span>
        {s.player && link && <ArrowUpRight aria-hidden className="size-3.5 text-muted opacity-0 -translate-x-0.5 transition-[opacity,translate] duration-[var(--dur-base)] group-hover:opacity-100 group-hover:translate-x-0" />}
      </div>
      {s.figure && <div className="figure text-[30px] font-bold leading-none text-ink mt-2">{s.figure}</div>}
      <p className="text-[13px] text-ink-2 leading-snug mt-2">{s.text}</p>
    </>
  )
  const cls = 'group relative block h-full p-4 md:px-5 md:py-4 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] ring-1 ring-[var(--border)] backdrop-blur-[2px]'
  return (
    <Reveal delay={0.06 * i} y={6} className="min-w-0 h-full">
      {s.player && link ? <Link to={`/players?player=${encodeURIComponent(s.player)}`} className={cx(cls, 'lift')}>{body}</Link> : <div className={cls}>{body}</div>}
    </Reveal>
  )
}

/** Stories side by side; phones swipe through them (the row bleeds to the card's 20px edge). */
export function StoryRow({ stories, link = true, className }: { stories: Story[]; link?: boolean; className?: string }) {
  return (
    <div className={cx('-mx-5 px-5 pb-1 -mb-1 flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0 sm:grid sm:overflow-visible',
      stories.length >= 4 ? 'sm:grid-cols-2 xl:grid-cols-4' : stories.length === 3 ? 'sm:grid-cols-3' : stories.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-1', className)}>
      {stories.map((s, i) => <div key={s.id} className={cx('snap-start shrink-0 sm:w-auto', stories.length === 1 ? 'w-full' : 'w-[74%]')}><StoryCard s={s} i={i} link={link} /></div>)}
    </div>
  )
}

/**
 * Top of the overview: the season in one glance (record, run differential, the last five games, what's next) and the
 * few numbers worth telling someone about. Brand colour carries the wins; the seam drawing gives it its ballpark.
 */
export function SeasonHero({ summary, summaries, stories, next, title }: { summary: TeamSummary; summaries: GameSummary[]; stories: Story[]; next?: Game; title: string }) {
  const last5 = summaries.slice(-5)
  const last = summaries[summaries.length - 1]
  const record = `${summary.w}-${summary.l}${summary.t ? `-${summary.t}` : ''}`
  return (
    <section aria-label="球季概況" className="relative overflow-hidden rounded-[var(--radius)] bg-surface shadow-[var(--shadow-card)]">
      <HeroGlow />
      <div className="relative p-5 md:p-7 flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 text-[12px] text-ink-2">
              <TeamLogo size={26} />
              <span className="font-medium text-ink">{title}</span>
              <span className="text-muted">·</span>
              <span className="tnum">{summary.games} 場</span>
            </div>
            <div className="mt-3 flex items-end gap-4 md:gap-6 flex-wrap">
              <div className="figure font-bold text-ink leading-[0.85] text-[64px] md:text-[88px] tracking-[-0.01em]" aria-label={`戰績 ${summary.w} 勝 ${summary.l} 敗${summary.t ? ` ${summary.t} 和` : ''}`}>
                <RollingNumber text={record} />
              </div>
              <dl className="flex gap-5 pb-1.5 md:pb-2.5">
                <div><dt className="text-[11px] text-muted">勝率</dt><dd className="figure text-[22px] font-semibold text-ink leading-tight">{f3(summary.winPct)}</dd></div>
                <div><dt className="text-[11px] text-muted">得失分差</dt><dd className={cx('figure text-[22px] font-semibold leading-tight', summary.diff > 0 ? 'text-good' : summary.diff < 0 ? 'text-critical' : 'text-ink')}>{signedInt(summary.diff)}</dd></div>
                <div className="hidden sm:block"><dt className="text-[11px] text-muted">得分／失分</dt><dd className="figure text-[22px] font-semibold text-ink leading-tight">{summary.rs}<span className="text-muted mx-0.5">/</span>{summary.ra}</dd></div>
              </dl>
            </div>
          </div>
          <div className="flex flex-col gap-3 md:items-end">
            {last5.length > 0 && (
              <div className="flex items-center gap-2.5">
                <span className="text-[11px] text-muted md:order-last">近 {last5.length} 場</span>
                <div className="flex gap-1.5">{last5.map((s) => <ResultChip key={s.game.id} s={s} />)}</div>
              </div>
            )}
            {/* the first three questions a visitor has: how are we doing (the record), the last game, the next one */}
            <div className="flex flex-wrap gap-2 md:justify-end">
              {last && (
                <Link to={`/games/${encodeURIComponent(last.game.id)}`} className="press inline-flex items-center gap-2 text-[12px] text-ink-2 hover:text-ink rounded-full bg-surface-2 px-3 h-8">
                  <span>最近一場 <span className="tnum font-semibold text-ink">{last.runsUs}:{last.runsOpp}</span> <span className="font-medium text-ink">{last.game.opponent}</span>（{last.result === 'W' ? '勝' : last.result === 'L' ? '敗' : '和'}）</span>
                </Link>
              )}
              <Link to="/games?view=schedule" className="press inline-flex items-center gap-2 text-[12px] text-ink-2 hover:text-ink rounded-full bg-surface-2 px-3 h-8">
                <CalendarDays className="size-3.5 text-accent" />
                {next ? <span>下一場 <span className="tnum font-medium text-ink">{dayLabel(next.date)}{next.time ? ` ${next.time}` : ''}</span> vs <span className="font-medium text-ink">{next.opponent}</span></span> : <span>下一場 <span className="font-medium text-ink">未排定</span></span>}
              </Link>
            </div>
          </div>
        </div>
        {stories.length > 0 && (
          <>
            <div className="flex items-center gap-3 text-[11px] text-muted"><Stitches width={40} /><span className="tracking-[0.08em]">本季看點</span></div>
            <StoryRow stories={stories} className="-mt-2" />
          </>
        )}
      </div>
    </section>
  )
}
