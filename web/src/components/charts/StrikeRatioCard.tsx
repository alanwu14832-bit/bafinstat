import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Card } from '../ui/Card'
import { cx } from '../../lib/format'

export interface StrikeRatioRow { name: string; strikes: number; balls: number }
type SortKey = 'pct' | 'pitches' | 'name'

/** Fewer pitches than this and a bar is faded and marked 樣本少. */
export const STRIKE_SMALL_SAMPLE = 30
/** The dashed reference line: about where a pitcher's strike rate is usually judged (60–65%). */
export const STRIKE_REFERENCE = 0.6

const SORTS: Array<{ key: SortKey; label: string }> = [{ key: 'pct', label: '好球率' }, { key: 'pitches', label: '球數' }, { key: 'name', label: '姓名' }]

/** The order of the bars: by strike rate, by pitches, or by name; `desc` flips it (a name A→Z when not). */
export function sortStrikeRows(rows: StrikeRatioRow[], key: SortKey, desc: boolean): StrikeRatioRow[] {
  const pct = (r: StrikeRatioRow) => (r.strikes + r.balls ? r.strikes / (r.strikes + r.balls) : 0)
  const by: Record<SortKey, (a: StrikeRatioRow, b: StrikeRatioRow) => number> = {
    pct: (a, b) => pct(b) - pct(a) || b.strikes + b.balls - (a.strikes + a.balls),
    pitches: (a, b) => b.strikes + b.balls - (a.strikes + a.balls) || pct(b) - pct(a),
    name: (a, b) => b.name.localeCompare(a.name, 'zh-Hant'),
  }
  const out = [...rows].sort(by[key])
  return desc ? out : out.reverse()
}

/**
 * 好壞球分佈: each pitcher's strikes (含界外) against balls as one bar of the same length — the share, not the count, so a
 * pitcher who threw 200 pitches reads as easily as one who threw 40. Total pitches sit at the end; a dashed line marks
 * 60%. Sortable by 好球率 / 球數 / 姓名 (tap the active one again to turn the order around).
 */
export function StrikeRatioCard({ rows, onPick, className }: { rows: StrikeRatioRow[]; onPick?: (name: string) => void; className?: string }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'pct', desc: true })
  const shown = useMemo(() => sortStrikeRows(rows.filter((r) => r.strikes + r.balls > 0), sort.key, sort.desc), [rows, sort])
  const pick = (key: SortKey) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: true }))
  const action = (
    <div role="group" aria-label="排序" className="inline-flex items-center gap-0.5 p-0.5 rounded-[var(--radius-sm)] bg-surface-2">
      {SORTS.map((o) => {
        const on = sort.key === o.key
        return (
          <button key={o.key} type="button" aria-pressed={on} onClick={() => pick(o.key)} aria-label={`依${o.label}排序${on ? (sort.desc ? '（由高到低）' : '（由低到高）') : ''}`}
            className={cx('h-8 pointer-fine:h-7 px-2.5 rounded-[6px] text-[12px] font-medium inline-flex items-center gap-1 cursor-pointer', on ? 'bg-surface text-ink shadow-[var(--shadow-card)]' : 'text-ink-2 hover:text-ink')}>
            {o.label}{on && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
          </button>
        )
      })}
    </div>
  )
  return (
    <Card title="好壞球分佈" subtitle={`每位投手的好球（含界外）比例；虛線是 ${Math.round(STRIKE_REFERENCE * 100)}%，不到 ${STRIKE_SMALL_SAMPLE} 球的標「樣本少」`} action={action} className={className}>
      {!shown.length ? <p className="text-[13px] text-muted py-6 text-center">沒有投球紀錄</p> : (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-[2px] bg-[var(--series-1)]" />好球</span>
            <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-[2px] bg-surface-3" />壞球</span>
          </div>
          <ol className="flex flex-col gap-1.5">
            {shown.map((r) => {
              const n = r.strikes + r.balls
              const pct = r.strikes / n
              const small = n < STRIKE_SMALL_SAMPLE
              const label = `${Math.round(pct * 100)}%`
              const inner = (
                <>
                  <span className="w-[4.5rem] shrink-0 truncate text-[13px] text-ink-2 text-right">{r.name}</span>
                  <span className={cx('relative flex-1 h-6 rounded-[4px] bg-surface-3 overflow-hidden', small && 'opacity-50')}>
                    <span className="absolute inset-y-0 left-0 bg-[var(--series-1)] rounded-l-[4px]" style={{ width: `${pct * 100}%` }} />
                    <span aria-hidden className="absolute inset-y-0 border-l border-dashed border-ink/60" style={{ left: `${STRIKE_REFERENCE * 100}%` }} />
                    {/* the share on the blue part; a sliver too thin for it gets it just after */}
                    <span className={cx('absolute inset-y-0 flex items-center px-2 text-[12px] font-semibold tnum', pct >= 0.18 ? 'left-0 text-bg' : 'text-ink')} style={pct >= 0.18 ? undefined : { left: `${pct * 100}%` }}>{label}</span>
                  </span>
                  <span className="w-[5.5rem] shrink-0 text-[11px] text-muted tnum whitespace-nowrap">{n} 球{small && <span className="ml-1 text-warning">樣本少</span>}</span>
                </>
              )
              return (
                <li key={r.name} title={`${r.name}：好球 ${r.strikes}、壞球 ${r.balls}（好球率 ${(pct * 100).toFixed(1)}%）`}>
                  {onPick
                    ? <button type="button" onClick={() => onPick(r.name)} aria-label={`${r.name} 好球率 ${label}，${n} 球`} className="w-full flex items-center gap-2.5 rounded-[6px] hover:bg-surface-2/60 cursor-pointer text-left">{inner}</button>
                    : <div className="flex items-center gap-2.5">{inner}</div>}
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </Card>
  )
}
