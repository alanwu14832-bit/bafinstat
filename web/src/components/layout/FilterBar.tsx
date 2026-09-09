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

/** Global filter row. One row, one height (32px), every control the same shape; scrolls sideways on narrow screens. Demo data is toggled on the import page. */
export function FilterBar({ className }: { className?: string }) {
  const filters = useDataStore((s) => s.filters)
  const setFilters = useDataStore((s) => s.setFilters)
  const resetFilters = useDataStore((s) => s.resetFilters)
  const opts = useFilterOptions()
  const isDefault = JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS)

  const activePreset: Preset = !filters.from && !filters.to ? 'all' : filters.from === `${opts.maxDate.slice(0, 4)}-01-01` && !filters.to ? 'year' : filters.from === presetRange('last90', opts.maxDate).from ? 'last90' : 'all'
  const presets: Array<{ value: Preset; label: string }> = [{ value: 'all', label: '全部' }, { value: 'year', label: `${opts.maxDate.slice(0, 4) || '本'}年` }, { value: 'last90', label: '近 90 天' }]
  const dateCls = cx(inputCls('sm'), 'w-[126px] tnum')

  return (
    <div className={cx('flex items-center gap-2 min-w-max', className)} role="group" aria-label="全域篩選">
      <Select label="杯賽" size="sm" value={filters.tournament} onChange={(e) => setFilters({ tournament: e.target.value })}
        options={[{ value: 'all', label: '全部' }, ...opts.tournaments.map((t) => ({ value: t, label: t }))]} />
      <div className="inline-flex items-center rounded-[var(--radius-sm)] bg-surface-2 p-0.5 gap-0.5">
        {presets.map((p) => (
          <button key={p.value} type="button" aria-pressed={activePreset === p.value} onClick={() => setFilters(presetRange(p.value, opts.maxDate))}
            className={cx('h-7 px-2.5 rounded-[6px] text-[12px] font-medium whitespace-nowrap cursor-pointer transition-colors motion-reduce:transition-none',
              activePreset === p.value ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_var(--border)]' : 'text-ink-2 hover:text-ink')}>
            {p.label}
          </button>
        ))}
      </div>
      <input type="date" aria-label="起始日期" className={dateCls} value={filters.from} min={opts.minDate} max={opts.maxDate} onChange={(e) => setFilters({ from: e.target.value })} />
      <span className="text-muted text-xs -mx-0.5">–</span>
      <input type="date" aria-label="結束日期" className={dateCls} value={filters.to} min={opts.minDate} max={opts.maxDate} onChange={(e) => setFilters({ to: e.target.value })} />
      <Select label="守位" size="sm" value={filters.position} onChange={(e) => setFilters({ position: e.target.value })}
        options={[{ value: 'all', label: '全部' }, ...opts.positions.map((p) => ({ value: p, label: `${p} ${POSITION_LABEL[p] ?? ''}`.trim() }))]} />
      <Select label="對手" size="sm" value={filters.opponent} onChange={(e) => setFilters({ opponent: e.target.value })}
        options={[{ value: 'all', label: '全部' }, ...opts.opponents.map((o) => ({ value: o, label: o }))]} />
      <Select label="主客" size="sm" value={filters.homeAway} onChange={(e) => setFilters({ homeAway: e.target.value as Filters['homeAway'] })}
        options={[{ value: 'all', label: '全部' }, { value: '主', label: '主場' }, { value: '客', label: '客場' }]} />
      <Select label="勝敗" size="sm" value={filters.result} onChange={(e) => setFilters({ result: e.target.value as Filters['result'] })}
        options={[{ value: 'all', label: '全部' }, { value: 'W', label: '勝' }, { value: 'L', label: '敗' }, { value: 'T', label: '和' }]} />
      {!isDefault && <Button variant="ghost" size="sm" icon={<RotateCcw />} onClick={resetFilters}>重設</Button>}
    </div>
  )
}
