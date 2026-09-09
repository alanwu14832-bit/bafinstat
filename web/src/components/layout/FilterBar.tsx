import { RotateCcw } from 'lucide-react'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
import { cx } from '../../lib/format'
import { inputCls } from '../ui/Input'
import { POSITION_LABEL } from '../../lib/fmt'
import { useFilterOptions } from '../../hooks/useStats'
import { useDataStore } from '../../store/data'
import { DEFAULT_FILTERS, type Filters } from '../../data/types'

type Preset = 'all' | 'year' | 'last90'

function presetRange(p: Preset, maxDate: string): Pick<Filters, 'from' | 'to'> {
  if (p === 'all' || !maxDate) return { from: '', to: '' }
  const end = new Date(maxDate)
  if (p === 'year') return { from: `${maxDate.slice(0, 4)}-01-01`, to: '' }
  const start = new Date(end); start.setDate(end.getDate() - 90)
  return { from: start.toISOString().slice(0, 10), to: '' }
}

/** Number of filters that differ from the default (the date range counts as one). */
export function activeFilterCount(f: Filters): number {
  let n = 0
  if (f.tournament !== DEFAULT_FILTERS.tournament) n++
  if (f.from || f.to) n++
  if (f.position !== DEFAULT_FILTERS.position) n++
  if (f.opponent !== DEFAULT_FILTERS.opponent) n++
  if (f.homeAway !== DEFAULT_FILTERS.homeAway) n++
  if (f.result !== DEFAULT_FILTERS.result) n++
  return n
}

export interface FilterBarProps {
  className?: string
  /** 'row' = one 32px toolbar row (desktop); 'stack' = full-width controls with labels (phone sheet). */
  layout?: 'row' | 'stack'
}

/** Global filters. Every page reads the same slice. Demo data is toggled on the import page. */
export function FilterBar({ className, layout = 'row' }: FilterBarProps) {
  const filters = useDataStore((s) => s.filters)
  const setFilters = useDataStore((s) => s.setFilters)
  const resetFilters = useDataStore((s) => s.resetFilters)
  const opts = useFilterOptions()
  const isDefault = activeFilterCount(filters) === 0
  const stack = layout === 'stack'
  const size = stack ? 'md' : 'sm'

  const activePreset: Preset = !filters.from && !filters.to ? 'all' : filters.from === `${opts.maxDate.slice(0, 4)}-01-01` && !filters.to ? 'year' : filters.from === presetRange('last90', opts.maxDate).from ? 'last90' : 'all'
  const presets: Array<{ value: Preset; label: string }> = [{ value: 'all', label: '全部' }, { value: 'year', label: `${opts.maxDate.slice(0, 4) || '本'}年` }, { value: 'last90', label: '近 90 天' }]
  const dateCls = cx(inputCls(size), stack ? 'w-full' : 'w-[126px]', 'tnum')

  const presetsEl = (
    <div className={cx('inline-flex items-center rounded-[var(--radius-sm)] bg-surface-2 p-0.5 gap-0.5', stack && 'w-full [&>*]:flex-1')}>
      {presets.map((p) => (
        <button key={p.value} type="button" aria-pressed={activePreset === p.value} onClick={() => setFilters(presetRange(p.value, opts.maxDate))}
          className={cx('rounded-[6px] font-medium whitespace-nowrap cursor-pointer transition-colors motion-reduce:transition-none', stack ? 'h-8 px-3 text-[13px]' : 'h-7 px-2.5 text-[12px]',
            activePreset === p.value ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_var(--border)]' : 'text-ink-2 hover:text-ink')}>
          {p.label}
        </button>
      ))}
    </div>
  )
  const selects = [
    <Select key="t" id={`filter-tournament${stack ? "-sheet" : ""}`} label="杯賽" size={size} value={filters.tournament} onChange={(e) => setFilters({ tournament: e.target.value })} className={stack ? 'w-full' : undefined}
      options={[{ value: 'all', label: '全部' }, ...opts.tournaments.map((t) => ({ value: t, label: t }))]} />,
    <Select key="p" id={`filter-position${stack ? "-sheet" : ""}`} label="守位" size={size} value={filters.position} onChange={(e) => setFilters({ position: e.target.value })} className={stack ? 'w-full' : undefined}
      options={[{ value: 'all', label: '全部' }, ...opts.positions.map((p) => ({ value: p, label: `${p} ${POSITION_LABEL[p] ?? ''}`.trim() }))]} />,
    <Select key="o" id={`filter-opponent${stack ? "-sheet" : ""}`} label="對手" size={size} value={filters.opponent} onChange={(e) => setFilters({ opponent: e.target.value })} className={stack ? 'w-full' : undefined}
      options={[{ value: 'all', label: '全部' }, ...opts.opponents.map((o) => ({ value: o, label: o }))]} />,
    <Select key="h" id={`filter-homeAway${stack ? "-sheet" : ""}`} label="主客" size={size} value={filters.homeAway} onChange={(e) => setFilters({ homeAway: e.target.value as Filters['homeAway'] })} className={stack ? 'w-full' : undefined}
      options={[{ value: 'all', label: '全部' }, { value: '主', label: '主場' }, { value: '客', label: '客場' }]} />,
    <Select key="r" id={`filter-result${stack ? "-sheet" : ""}`} label="勝敗" size={size} value={filters.result} onChange={(e) => setFilters({ result: e.target.value as Filters['result'] })} className={stack ? 'w-full' : undefined}
      options={[{ value: 'all', label: '全部' }, { value: 'W', label: '勝' }, { value: 'L', label: '敗' }, { value: 'T', label: '和' }]} />,
  ]

  if (stack) {
    return (
      <div className={cx('flex flex-col gap-4', className)} role="group" aria-label="全域篩選">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-ink-2">期間</span>
          {presetsEl}
          <div className="grid grid-cols-2 gap-2">
            <input type="date" aria-label="起始日期" className={dateCls} value={filters.from} min={opts.minDate} max={opts.maxDate} onChange={(e) => setFilters({ from: e.target.value })} />
            <input type="date" aria-label="結束日期" className={dateCls} value={filters.to} min={opts.minDate} max={opts.maxDate} onChange={(e) => setFilters({ to: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2">{selects}</div>
        <Button variant="outline" icon={<RotateCcw />} onClick={resetFilters} disabled={isDefault} className="w-full">重設篩選</Button>
      </div>
    )
  }

  return (
    <div className={cx('flex items-center gap-2 min-w-max', className)} role="group" aria-label="全域篩選">
      {selects[0]}
      {presetsEl}
      <input type="date" aria-label="起始日期" className={dateCls} value={filters.from} min={opts.minDate} max={opts.maxDate} onChange={(e) => setFilters({ from: e.target.value })} />
      <span className="text-muted text-xs -mx-0.5">–</span>
      <input type="date" aria-label="結束日期" className={dateCls} value={filters.to} min={opts.minDate} max={opts.maxDate} onChange={(e) => setFilters({ to: e.target.value })} />
      {selects.slice(1)}
      {!isDefault && <Button variant="ghost" size="sm" icon={<RotateCcw />} onClick={resetFilters}>重設</Button>}
    </div>
  )
}
