import type { ReactNode } from 'react'
import { Card } from '../ui/Card'
import { StatHint } from '../ui/StatHint'
import { pctTitle, type PctRow } from '../../data/playerMetrics'
import { prInk, prMix } from '../../lib/fmt'
import { cx } from '../../lib/format'

export interface PercentileCardProps {
  title: ReactNode
  rows: PctRow[]
  /** who the player is compared with (subtitle) */
  poolNote: ReactNode
  footnote?: ReactNode
  /** e.g. 「存成圖片」 */
  action?: ReactNode
  /** e.g. the 長條｜雷達 switch */
  toggle?: ReactNode
}

/** 「較差 ◀ 藍｜灰 PR 50｜紅 ▶ 較佳」 */
function Legend() {
  const dot = (pr: number) => <span aria-hidden className="inline-block size-2.5 rounded-full align-[-1px]" style={{ background: prMix(pr) }} />
  return (
    <p className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted">
      <span>較差 ◀</span>{dot(0)}<span>藍｜</span>{dot(50)}<span>灰 PR 50｜</span>{dot(100)}<span>紅 ▶ 較佳</span>
    </p>
  )
}

/** One bar: Chinese name (code under it), a track filled from 0 to the PR with the PR in a circle at its end, the value. */
function Bar({ r }: { r: PctRow }) {
  const pr = r.pr
  const fill = r.small || pr === null ? 'var(--pr-mid)' : prMix(pr)
  const at = pr === null ? 0 : Math.max(0, Math.min(100, pr))
  return (
    <li className="grid grid-cols-[84px_minmax(0,1fr)_52px] items-center gap-2 h-9" data-testid="pct-row">
      <span className="min-w-0 leading-[14px]">
        <span className="block text-[12px] text-ink truncate">{r.name}</span>
        <span className="block text-[10px] text-muted truncate figure"><StatHint label={r.label}>{r.label}</StatHint></span>
      </span>
      <span className="relative h-6 flex items-center">
        <span aria-hidden className="absolute inset-x-0 h-1.5 rounded-full bg-surface-3" />
        {pr !== null && (
          <>
            <span aria-hidden className={cx('absolute left-0 h-1.5 rounded-full', r.small && 'opacity-60')} style={{ width: `${at}%`, background: fill }} />
            <span className="absolute -translate-x-1/2" style={{ left: `clamp(12px, ${at}%, calc(100% - 12px))` }}>
              <StatHint hint={{ title: `${r.name} PR ${pr}`, text: pctTitle(r) }} className="no-underline!">
                <span title={pctTitle(r)} aria-label={`PR ${pr}，${pctTitle(r)}`}
                  className={cx('grid place-items-center size-6 rounded-full text-[11px] font-bold figure tnum shadow-[var(--shadow-sm)]', r.small && 'opacity-60')}
                  style={{ background: fill, color: r.small ? 'var(--ink)' : prInk(pr) }}>{pr}</span>
              </StatHint>
            </span>
          </>
        )}
      </span>
      <span className="text-right leading-[14px] min-w-0">
        <span className={cx('block text-[13px] tnum', r.small ? 'text-muted' : 'text-ink font-medium')}>{r.display}</span>
        {r.small && <span className="block text-[10px] text-muted whitespace-nowrap">樣本少</span>}
      </span>
    </li>
  )
}

/** 隊內百分位 as Baseball Savant-style bars, grouped (打擊結果、選球與揮棒…). Plain HTML/CSS, fits 360px. */
export function PercentileCard({ title, rows, poolNote, footnote, action, toggle }: PercentileCardProps) {
  const groups = [...new Set(rows.map((r) => r.group))]
  return (
    <Card title={title} subtitle={poolNote} action={(toggle || action) && <>{toggle}{action}</>}>
      <Legend />
      <div className="mt-2 flex flex-col gap-2">
        {groups.map((g) => (
          <section key={g} aria-label={g}>
            <h4 className="text-[11px] font-semibold text-ink-2 tracking-[0.06em] mb-0.5">{g}</h4>
            <ul className="flex flex-col">
              {rows.filter((r) => r.group === g).map((r) => <Bar key={r.key} r={r} />)}
            </ul>
          </section>
        ))}
      </div>
      {footnote && <p className="text-[11px] text-muted mt-3 leading-4">{footnote}</p>}
    </Card>
  )
}
