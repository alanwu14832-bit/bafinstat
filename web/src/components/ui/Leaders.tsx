import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { cx } from '../../lib/format'
import { Reveal } from '../motion/Reveal'
import { HeroGlow } from './HeroGlow'
import { PlateBadge, Stitches } from './Scoreboard'

export interface Leader {
  /** what he leads in, e.g. 打擊率王 */
  label: string
  value: string
  /** everyone tied for the lead */
  names: string[]
  note?: string
  /** where tapping the leader goes (his player page) */
  to: string
}

/** A tie-break: compared only among the rows tied on the main value (null = worst). */
export interface TieBreak<T> { get: (r: T) => number | null | undefined; low?: boolean; label: string }
export interface LeaderResult { value: number; names: string[]; /** how many were tied before the tie-breaks */ tied?: number; /** the tie-break that decided it */ by?: string }

/** Equal up to float noise (an ERA of 3 ER / 10 IP and 1 ER / 3⅓ IP is one number). */
const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))

/**
 * The leader in one column: highest (or lowest) value among the rows that qualify; ties share it. Null when nobody
 * qualifies or the best is nothing to lead in (0 home runs, 0 steals). With `ties`, rows sharing the best value are
 * narrowed by each tie-break in order; the result then says how many were tied and which tie-break decided it.
 */
export function leaderOf<T extends { name: string }>(rows: T[], get: (r: T) => number | null | undefined, opts: { low?: boolean; qualifies?: (r: T) => boolean; allowZero?: boolean; ties?: TieBreak<T>[] } = {}): LeaderResult | null {
  let best: number | null = null
  let top: T[] = []
  for (const r of rows) {
    if (opts.qualifies && !opts.qualifies(r)) continue
    const v = get(r)
    if (v === null || v === undefined || !Number.isFinite(v)) continue
    if (best !== null && same(v, best)) top.push(r)
    else if (best === null || (opts.low ? v < best : v > best)) { best = v; top = [r] }
  }
  if (best === null || (!opts.allowZero && !opts.low && best <= 0)) return null
  if (!opts.ties?.length || top.length < 2) return { value: best, names: top.map((r) => r.name) }
  const tied = top.length
  let by: string | undefined
  for (const t of opts.ties) {
    const vals = top.map((r) => t.get(r)).map((v) => (v === null || v === undefined || !Number.isFinite(v) ? null : v))
    const ok = vals.filter((v): v is number => v !== null)
    if (!ok.length) continue
    const b = t.low ? Math.min(...ok) : Math.max(...ok)
    const next = top.filter((_, i) => vals[i] !== null && same(vals[i]!, b))
    if (next.length < top.length) { top = next; by = t.label }
    if (top.length === 1) break
  }
  return { value: best, names: top.map((r) => r.name), tied, ...(by ? { by } : {}) }
}

/** 「同率 2 人，比長打率」 for a leader decided by a tie-break (empty otherwise). */
export const tieNote = (l: LeaderResult | null) => (l?.by && l.tied ? `同率 ${l.tied} 人，比${l.by}` : '')

/**
 * 領先者: who leads the page's key numbers, at the top of 打擊 / 投球 / 守備 so the page has a main character before
 * the big table. Same glow and stitching as the homepage hero, quieter.
 */
export function LeaderStrip({ leaders, numbers, caption }: { leaders: Leader[]; numbers?: Map<string, string | undefined>; caption?: string }) {
  if (!leaders.length) return null
  return (
    <section aria-label="領先者" className="relative overflow-hidden rounded-[var(--radius)] bg-surface shadow-[var(--shadow-card)]">
      <HeroGlow size="sm" strength={0.7} />
      <div className="relative px-5 md:px-6 pt-4 flex items-center gap-3 text-[11px] text-muted flex-wrap">
        <Stitches width={40} />
        <span className="tracking-[0.08em]">領先者</span>
        {caption && <span className="text-muted">{caption}</span>}
      </div>
      {/* phones swipe through the leaders (like the homepage 看點); wider screens show them side by side */}
      <ul className={cx('relative flex overflow-x-auto snap-x snap-mandatory scroll-px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden p-2 md:p-3 md:grid md:overflow-visible', leaders.length >= 5 ? 'md:grid-cols-5' : leaders.length === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3')}>
        {leaders.map((l, i) => {
          const first = l.names[0]
          return (
            <li key={l.label} className="min-w-0 shrink-0 w-[44%] snap-start md:w-auto">
              <Reveal delay={0.04 * i} y={6} className="h-full">
                <Link to={l.to} className="lift group h-full flex flex-col gap-1.5 rounded-[var(--radius-sm)] px-3 py-3 hover:bg-[color-mix(in_srgb,var(--surface-2)_70%,transparent)]">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold tracking-[0.06em] text-accent">{l.label}</span>
                    <ArrowUpRight aria-hidden className="size-3.5 text-muted opacity-0 transition-opacity duration-[var(--dur-base)] group-hover:opacity-100" />
                  </span>
                  <span className="figure text-[30px] md:text-[34px] font-bold text-ink leading-none">{l.value}</span>
                  <span className="flex items-center gap-1.5 min-w-0">
                    <PlateBadge size={22} className="figure">{numbers?.get(first) ?? first.slice(0, 1)}</PlateBadge>
                    <span className="text-[13px] font-medium text-ink truncate">{first}</span>
                    {l.names.length > 1 && <span className="text-[11px] text-muted shrink-0">等 {l.names.length} 人</span>}
                  </span>
                  {l.note && <span className="text-[11px] text-muted truncate">{l.note}</span>}
                </Link>
              </Reveal>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
