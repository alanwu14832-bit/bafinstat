import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, CalendarDays } from 'lucide-react'
import { cx } from '../../lib/format'
import { f3, signedInt } from '../../lib/fmt'
import { RollingNumber } from '../motion/RollingNumber'
import { Reveal } from '../motion/Reveal'
import { HERO_INK, HERO_INK_SOFT, HERO_KICKER, HERO_RECORD, HERO_SCRIM, HERO_SECTION, HERO_STAGE_DRAWN, HERO_TITLE_DRAWN, HeroPlanes } from './HeroArt'
import { HERO } from '../../config/hero'
import { TEAM } from '../../config/team'
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery'
import type { Story } from '../../data/stories'
import { finishedSummaries, LIVE_TEXT, resultText, teamSummary, type GameSummary, type TeamSummary } from '../../data/stats'
import { LiveDot } from './ResultBadge'
import type { Game } from '../../data/types'

const WEEK = ['日', '一', '二', '三', '四', '五', '六']
const dayLabel = (iso: string) => { const d = new Date(`${iso}T00:00:00`); return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）` }

function ResultChip({ s }: { s: GameSummary }) {
  const r = s.result
  // a game still being recorded: the live dot and 進行中 in the same small box as a 勝／敗 chip (the row of five
  // stays one line on a phone), the current score under it; the full words are in its label
  if (r === 'live') {
    const label = `${s.game.date} vs ${s.game.opponent} ${LIVE_TEXT}，目前 ${s.runsUs}：${s.runsOpp}`
    return (
      <Link to={`/games?game=${encodeURIComponent(s.game.id)}`} title={label} aria-label={label}
        className="press relative inline-flex flex-col items-center justify-center w-11 h-12 rounded-[10px] text-[11px] leading-none gap-1 bg-accent-soft text-[color-mix(in_srgb,var(--accent)_70%,var(--ink))]">
        <span className="absolute top-1 right-1 inline-flex"><LiveDot /></span>
        <span className="font-semibold whitespace-nowrap">進行中</span>
        <span className="figure tabular-nums opacity-80">{s.runsUs}:{s.runsOpp}</span>
      </Link>
    )
  }
  return (
    <Link to={`/games?game=${encodeURIComponent(s.game.id)}`} title={`${s.game.date} vs ${s.game.opponent} ${s.runsUs}：${s.runsOpp}`}
      className={cx('press inline-flex flex-col items-center justify-center w-11 h-12 rounded-[10px] text-[11px] leading-none gap-1 transition-colors',
        r === 'W' ? 'bg-accent text-accent-ink' : r === 'L' ? 'bg-surface-3 text-ink-2' : 'border border-border-strong text-ink-2')}>
      <span className="figure text-[17px] font-bold">{resultText(r)}</span>
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

/** Stories side by side; phones swipe through them (the row bleeds to the card's 20px edge) with dots under the row saying which one is in view. */
export function StoryRow({ stories, link = true, className }: { stories: Story[]; link?: boolean; className?: string }) {
  const row = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(0)
  const n = stories.length
  // the card whose left edge is nearest the row's left edge; the last one when the row is scrolled to its end
  const read = () => {
    const box = row.current
    if (!box) return
    if (box.scrollWidth - box.clientWidth - box.scrollLeft < 4 && box.scrollLeft > 0) { setAt(n - 1); return }
    const left = box.getBoundingClientRect().left
    let best = 0, gap = Infinity
    Array.from(box.children).forEach((c, i) => { const d = Math.abs(c.getBoundingClientRect().left - left - 20); if (d < gap) { gap = d; best = i } })
    setAt(best)
  }
  const go = (i: number) => {
    const box = row.current, card = box?.children[i] as HTMLElement | undefined
    if (box && card) box.scrollTo({ left: card.offsetLeft - 20, behavior: 'smooth' })
  }
  return (
    <div className={className}>
      <div ref={row} onScroll={read} className={cx('-mx-5 px-5 pb-1 -mb-1 flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0 sm:grid sm:overflow-visible',
        n >= 4 ? 'sm:grid-cols-2 xl:grid-cols-4' : n === 3 ? 'sm:grid-cols-3' : n === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-1')}>
        {stories.map((s, i) => <div key={s.id} className={cx('snap-start shrink-0 sm:w-auto', n === 1 ? 'w-full' : 'w-[74%]')}><StoryCard s={s} i={i} link={link} /></div>)}
      </div>
      {n > 1 && (
        <div className="sm:hidden mt-3 flex justify-center" role="group" aria-label={`看點：第 ${at + 1} 則，共 ${n} 則`}>
          {stories.map((s, i) => (
            // a 6px dot inside a 24 × 28px button
            <button key={s.id} type="button" onClick={() => go(i)} aria-label={`第 ${i + 1} 則`} aria-current={i === at ? 'true' : undefined} data-press="none" className="w-6 h-7 inline-flex items-center justify-center cursor-pointer">
              <span className={cx('h-1.5 rounded-full transition-[width,background-color] duration-[var(--dur-base)] motion-reduce:transition-none', i === at ? 'w-4 bg-accent' : 'w-1.5 bg-[var(--border-strong)]')} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Sets `--hp` on the hero's stage: 0 while it sits at the top of the page, 1 once it has scrolled away. The planes in
 * HeroArt read it, each at its own rate. One requestAnimationFrame per scroll burst, nothing while the hero is off
 * screen, and nothing at all when the visitor asked for reduced motion (the stage then stays a still picture).
 */
function useHeroScroll(ref: React.RefObject<HTMLElement | null>) {
  const reduced = usePrefersReducedMotion()
  useEffect(() => {
    const el = ref.current
    if (!el || reduced) { el?.style.setProperty('--hp', '0'); return }
    let frame = 0, last = -1
    const read = () => {
      frame = 0
      const h = el.offsetHeight || 1
      const p = Math.min(1, Math.max(0, window.scrollY / h))
      if (p === last) return
      last = p
      el.style.setProperty('--hp', p.toFixed(4))
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(read) }
    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); if (frame) cancelAnimationFrame(frame) }
  }, [ref, reduced])
}

/** The team photo plane: fades in once it has loaded over the drawn ground, and travels the least (it is the far wall). */
function HeroPhoto({ onError }: { onError: () => void }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <>
      <picture>
        {HERO.mobile && <source media="(max-width: 639px)" srcSet={HERO.mobile} />}
        <img src={HERO.photo} alt="" decoding="async" draggable={false} onLoad={() => setLoaded(true)} onError={onError}
          ref={(img) => { if (img?.complete && img.naturalWidth > 0) setLoaded(true) }}
          className={cx('absolute left-0 -top-[7%] w-full h-[114%] max-w-none object-cover transition-opacity duration-700 motion-reduce:transition-none', loaded ? 'opacity-100' : 'opacity-0')}
          style={{ objectPosition: HERO.focus, translate: '0 calc(var(--hp, 0) * 5%)', scale: 'calc(1.03 + var(--hp, 0) * 0.04)' }} />
      </picture>
      {/* the scrim only where the words are: the lower-left corner on a wide screen, a band across the bottom on a phone */}
      <div className="hidden sm:block absolute inset-0" style={{ background: `radial-gradient(108% 150% at 0% 100%, rgba(${HERO_SCRIM},0.9) 0%, rgba(${HERO_SCRIM},0.72) 36%, rgba(${HERO_SCRIM},0.3) 60%, rgba(${HERO_SCRIM},0) 80%)` }} />
      <div className="sm:hidden absolute inset-0" style={{ background: `linear-gradient(to top, rgba(${HERO_SCRIM},0.93) 0%, rgba(${HERO_SCRIM},0.8) 42%, rgba(${HERO_SCRIM},0.42) 64%, rgba(${HERO_SCRIM},0) 88%)` }} />
    </>
  )
}

/**
 * Top of the overview, the site's opening (開場形象區): the team's name and its real record over the team photo (or
 * the drawn backdrop while there is none), in planes that part slightly as the page scrolls. Under it, on the card's
 * own surface: the last five games, the last and the next game, and the few numbers worth telling someone about.
 */
export function SeasonHero({ summary, summaries, stories, next, title }: { summary: TeamSummary; summaries: GameSummary[]; stories: Story[]; next?: Game; title: string }) {
  const last5 = summaries.slice(-5)
  const last = summaries[summaries.length - 1]
  const record = `${summary.w}-${summary.l}${summary.t ? `-${summary.t}` : ''}`
  // the numbers beside the record count the same games: a game being recorded is in none of them (戰績先不算)
  const done = useMemo(() => (summary.live ? teamSummary(finishedSummaries(summaries)) : summary), [summary, summaries])
  const stage = useRef<HTMLDivElement>(null)
  useHeroScroll(stage)
  const [photo, setPhoto] = useState(!!HERO.photo)
  return (
    <section aria-label="球季概況" className={cx('relative overflow-hidden rounded-[var(--radius)]', HERO_SECTION)}>
      <div ref={stage} data-hero={photo ? 'photo' : 'drawn'} className={cx('relative isolate flex flex-col justify-end', HERO_INK, photo ? 'min-h-[400px] sm:min-h-[380px] lg:min-h-[420px]' : HERO_STAGE_DRAWN)}>
        <HeroPlanes photo={photo ? <HeroPhoto onError={() => setPhoto(false)} /> : undefined} />
        <div className={cx('relative p-5 md:p-8 lg:p-9 flex flex-col gap-3 md:gap-4', photo && '[text-shadow:0_1px_14px_rgba(0,0,0,0.5)]')}>
          <Reveal y={10} className="min-w-0">
            <div className={cx('flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px]', HERO_INK_SOFT)}>
              <span className={cx('font-semibold tracking-[0.14em] uppercase', HERO_KICKER)}>{TEAM.short}</span>
              <span aria-hidden className="opacity-50">·</span>
              <span className="tnum">{summary.games} 場</span>
              {summary.live > 0 && <span className={cx('inline-flex items-center gap-1', HERO_KICKER)}><LiveDot />{summary.live > 1 ? `${summary.live} 場` : ''}{LIVE_TEXT}，戰績先不算</span>}
            </div>
            <h1 className={cx('mt-2 text-[30px] sm:text-[40px] lg:text-[52px] leading-[1.1] tracking-[-0.015em] text-balance max-w-[16em]', !photo && HERO_TITLE_DRAWN)}>{title}</h1>
          </Reveal>
          <Reveal y={10} delay={0.08} className="flex items-end gap-4 md:gap-6 flex-wrap">
            <div className={cx('figure font-bold leading-[0.85] text-[60px] md:text-[84px] tracking-[-0.01em]', HERO_RECORD)} aria-label={`戰績 ${summary.w} 勝 ${summary.l} 敗${summary.t ? ` ${summary.t} 和` : ''}`}>
              <RollingNumber text={record} />
            </div>
            <dl className="flex gap-5 pb-1 md:pb-2">
              <div><dt className={cx('text-[11px]', HERO_INK_SOFT)}>勝率</dt><dd className="figure text-[22px] font-semibold leading-tight">{f3(summary.winPct)}</dd></div>
              <div><dt className={cx('text-[11px]', HERO_INK_SOFT)}>得失分差</dt><dd className={cx('figure text-[22px] font-semibold leading-tight', done.diff > 0 ? 'text-[#7fdc9b]' : done.diff < 0 ? 'text-[#ff9483]' : '')}>{signedInt(done.diff)}</dd></div>
              <div><dt className={cx('text-[11px]', HERO_INK_SOFT)}>得分／失分</dt><dd className="figure text-[22px] font-semibold leading-tight">{done.rs}<span className="opacity-50 mx-0.5">/</span>{done.ra}</dd></div>
            </dl>
          </Reveal>
        </div>
      </div>
      <div className="relative p-5 md:px-8 md:py-6 lg:px-9 flex flex-col gap-5">
        {/* the first questions a visitor has after the record: how the last few went, the last game, the next one */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {last5.length > 0 && (
            <div className="flex items-center gap-2.5">
              <div className="flex gap-1.5">{last5.map((s) => <ResultChip key={s.game.id} s={s} />)}</div>
              <span className="text-[11px] text-muted whitespace-nowrap shrink-0">近 {last5.length} 場</span>
            </div>
          )}
          <div className="flex flex-wrap gap-2 md:justify-end">
            {last && (
              <Link to={`/games/${encodeURIComponent(last.game.id)}`} className="press inline-flex items-center gap-2 text-[12px] text-ink-2 hover:text-ink rounded-full bg-surface-2 px-3 h-8">
                <span>最近一場 <span className="tnum font-semibold text-ink">{last.runsUs}:{last.runsOpp}</span> <span className="font-medium text-ink">{last.game.opponent}</span>（{resultText(last.result)}）</span>
              </Link>
            )}
            <Link to="/games?view=schedule" className="press inline-flex items-center gap-2 text-[12px] text-ink-2 hover:text-ink rounded-full bg-surface-2 px-3 h-8">
              <CalendarDays className="size-3.5 text-accent" />
              {next ? <span>下一場 <span className="tnum font-medium text-ink">{dayLabel(next.date)}{next.time ? ` ${next.time}` : ''}</span> vs <span className="font-medium text-ink">{next.opponent}</span></span> : <span>下一場 <span className="font-medium text-ink">未排定</span></span>}
            </Link>
          </div>
        </div>
        {stories.length > 0 && (
          <>
            <div className="text-[12px] font-semibold text-ink-2 tracking-[0.08em] border-t border-border pt-5">本季看點</div>
            <StoryRow stories={stories} className="-mt-2" />
          </>
        )}
      </div>
    </section>
  )
}
