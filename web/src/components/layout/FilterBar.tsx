import { RotateCcw, Sparkles } from 'lucide-react'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
import { cx } from '../../lib/format'
import { POSITION_LABEL } from '../../lib/fmt'
import { useFilterOptions } from '../../hooks/useStats'
import { useDataStore } from '../../store/data'
import { DEFAULT_FILTERS, type Filters } from '../../data/types'

type Preset = 'all' | 'year' | 'last90'

const inputCls =
  'h-8 px-2 text-xs bg-surface border border-border rounded-[var(--radius-sm)] text-ink tnum w-[118px] ' +
  'hover:border-[color-mix(in_srgb,var(--ink)_25%,transparent)] transition-colors motion-reduce:transition-none'

function presetRange(p: Preset, maxDate: string): Pick<Filters, 'from' | 'to'> {
  if (p === 'all' || !maxDate) return { from: '', to: '' }
  const end = new Date(maxDate)
  if (p === 'year') return { from: `${maxDate.slice(0, 4)}-01-01`, to: '' }
  const start = new Date(end); start.setDate(end.getDate() - 90)
  return { from: start.toISOString().slice(0, 10), to: '' }
}

/** Global filter bar — one row above everything; every page reads the same slice. */
export function FilterBar({ className }: { className?: string }) {
  const filters = useDataStore((s) => s.filters)
  const setFilters = useDataStore((s) => s.setFilters)
  const resetFilters = useDataStore((s) => s.resetFilters)
  const demo = useDataStore((s) => s.demo)
  const setDemo = useDataStore((s) => s.setDemo)
  const opts = useFilterOptions()
  const isDefault = JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS)

  const activePreset: Preset = !filters.from && !filters.to ? 'all' : filters.from === `${opts.maxDate.slice(0, 4)}-01-01` && !filters.to ? 'year' : filters.from === presetRange('last90', opts.maxDate).from ? 'last90' : 'all'
  const presets: Array<{ value: Preset; label: string }> = [{ value: 'all', label: '全部' }, { value: 'year', label: `${opts.maxDate.slice(0, 4) || '本'}年` }, { value: 'last90', label: '近90天' }]

  return (
    <div className={cx('flex flex-wrap items-center gap-x-3 gap-y-2', className)} role="group" aria-label="全域篩選">
      <Select label="杯賽" size="sm" value={filters.tournament} onChange={(e) => setFilters({ tournament: e.target.value })}
        options={[{ value: 'all', label: '全部杯賽' }, ...opts.tournaments.map((t) => ({ value: t, label: t }))]} />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted whitespace-nowrap">日期</span>
        <input type="date" aria-label="起始日期" className={inputCls} value={filters.from} min={opts.minDate} max={opts.maxDate} onChange={(e) => setFilters({ from: e.target.value })} />
        <span className="text-muted text-xs">–</span>
        <input type="date" aria-label="結束日期" className={inputCls} value={filters.to} min={opts.minDate} max={opts.maxDate} onChange={(e) => setFilters({ to: e.target.value })} />
        <div className="inline-flex rounded-[var(--radius-sm)] border border-border overflow-hidden">
          {presets.map((p) => (
            <button key={p.value} type="button" aria-pressed={activePreset === p.value} onClick={() => setFilters(presetRange(p.value, opts.maxDate))}
              className={cx('h-8 px-2.5 text-xs whitespace-nowrap cursor-pointer transition-colors motion-reduce:transition-none border-r border-border last:border-r-0',
                activePreset === p.value ? 'bg-accent-soft text-ink font-medium' : 'text-ink-2 hover:bg-surface-2')}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <Select label="守位" size="sm" value={filters.position} onChange={(e) => setFilters({ position: e.target.value })}
        options={[{ value: 'all', label: '全部' }, ...opts.positions.map((p) => ({ value: p, label: `${p} ${POSITION_LABEL[p] ?? ''}`.trim() }))]} />
      <Select label="對手" size="sm" value={filters.opponent} onChange={(e) => setFilters({ opponent: e.target.value })}
        options={[{ value: 'all', label: '全部對手' }, ...opts.opponents.map((o) => ({ value: o, label: o }))]} />
      <Select label="主客" size="sm" value={filters.homeAway} onChange={(e) => setFilters({ homeAway: e.target.value as Filters['homeAway'] })}
        options={[{ value: 'all', label: '全部' }, { value: '主', label: '主場' }, { value: '客', label: '客場' }]} />
      <Select label="勝敗" size="sm" value={filters.result} onChange={(e) => setFilters({ result: e.target.value as Filters['result'] })}
        options={[{ value: 'all', label: '全部' }, { value: 'W', label: '勝' }, { value: 'L', label: '敗' }, { value: 'T', label: '和' }]} />
      <Button variant="ghost" size="sm" icon={<RotateCcw />} onClick={resetFilters} disabled={isDefault}>重設</Button>
      <button type="button" role="switch" aria-checked={demo} onClick={() => setDemo(!demo)} title="加入程式產生的示範比賽，方便瀏覽儀表板功能"
        className={cx('inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full border text-xs cursor-pointer transition-colors motion-reduce:transition-none',
          demo ? 'bg-accent-soft border-transparent text-ink font-medium' : 'border-border text-ink-2 hover:bg-surface-2')}>
        <Sparkles className="size-3.5" /> 示範資料 {demo ? '開' : '關'}
      </button>
    </div>
  )
}
