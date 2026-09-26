import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from './Badge'
import { Button } from './Button'
import { EmptyState } from './EmptyState'
import { Field, Input } from './Input'
import { Select } from './Select'
import { rosterNames } from './PlayerSelect'
import { cx } from '../../lib/format'
import { registrationKey, seasonOf, REGISTRATIONS_UNSUPPORTED } from '../../data/registrations'
import type { Game, Player, Registration } from '../../data/types'

const chip = (active: boolean) => cx('h-9 pointer-fine:h-8 px-3 rounded-[var(--radius-sm)] border text-[13px] font-medium cursor-pointer transition-colors motion-reduce:transition-none', active ? 'border-ink bg-ink text-bg' : 'border-border bg-surface text-ink hover:bg-surface-2')
const isActive = (p: Player) => !p.status || p.status === '現役'
const label = (r: Pick<Registration, 'season' | 'tournament'>) => `${r.season} ${r.tournament}`

interface Draft { original: Registration | null; season: number; tournament: string; players: Set<string> }

export interface RegistrationEditorProps {
  registrations: Registration[]
  roster: Player[]
  /** every game incl. scheduled ones: years and tournament names to offer */
  games: Game[]
  /** false when the cloud has no registrations table yet */
  supported: boolean
  canEdit: boolean
  /** list to show first and tournament to prefill (e.g. the 杯賽 filter) */
  focusTournament?: string
  onSave: (r: Registration) => Promise<void>
  onDelete: (season: number, tournament: string) => Promise<void>
}

/** 報名名單: one list of players per year + tournament. Everyone can read them; recorders add, edit and delete. */
export function RegistrationEditor({ registrations, roster, games, supported, canEdit, focusTournament, onSave, onDelete }: RegistrationEditorProps) {
  const [picked, setPicked] = useState<string>(() => { const r = registrations.find((x) => x.tournament === focusTournament?.trim()); return r ? registrationKey(r.season, r.tournament) : '' })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // cloud lists arrive after the first render and can change under us, so fall back to the newest one
  const selected = registrations.find((r) => registrationKey(r.season, r.tournament) === picked) ?? registrations[0]
  const order = useMemo(() => rosterNames(roster), [roster])
  const numberOf = useMemo(() => new Map(roster.map((p) => [p.name, p.number])), [roster])
  const activeNames = useMemo(() => { const on = new Set(roster.filter(isActive).map((p) => p.name)); return order.filter((n) => on.has(n)) }, [roster, order])
  const inactiveNames = useMemo(() => { const on = new Set(activeNames); return order.filter((n) => !on.has(n)) }, [order, activeNames])
  /** roster order first, then names that are no longer on the roster */
  const ordered = (names: Iterable<string>) => { const set = new Set(names); return [...order.filter((n) => set.has(n)), ...[...set].filter((n) => !order.includes(n))] }
  const currentYear = new Date().getFullYear()
  const years = useMemo(() => [...new Set([...games.map((g) => seasonOf(g.date)), ...registrations.map((r) => r.season), currentYear, currentYear + 1, ...(draft ? [draft.season] : [])])].filter((y) => y > 0).sort((a, b) => b - a), [games, registrations, currentYear, draft])
  const tournaments = useMemo(() => [...new Set([...games.map((g) => g.tournament?.trim()), ...registrations.map((r) => r.tournament)])].filter((t): t is string => !!t).sort((a, b) => a.localeCompare(b, 'zh-Hant')), [games, registrations])

  if (!supported) {
    return <div role="status" className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3 py-2.5 text-[13px] text-ink"><AlertTriangle className="size-4 shrink-0 mt-0.5 text-warning" />{REGISTRATIONS_UNSUPPORTED}</div>
  }

  const edit = (r: Registration | null) => {
    setError(null)
    const players = new Set(r?.players ?? [])
    setShowInactive(inactiveNames.some((n) => players.has(n)))
    setDraft({ original: r, season: r?.season ?? currentYear, tournament: r?.tournament ?? focusTournament?.trim() ?? '', players })
  }
  const toggle = (n: string) => setDraft((d) => { if (!d) return d; const players = new Set(d.players); if (players.has(n)) players.delete(n); else players.add(n); return { ...d, players } })
  const originalKey = draft?.original ? registrationKey(draft.original.season, draft.original.tournament) : ''
  const clash = draft && registrations.find((r) => registrationKey(r.season, r.tournament) === registrationKey(draft.season, draft.tournament) && registrationKey(r.season, r.tournament) !== originalKey)

  const save = async () => {
    if (!draft) return
    const tournament = draft.tournament.trim()
    if (!tournament) { setError('請填杯賽'); return }
    const next: Registration = { season: draft.season, tournament, players: ordered(draft.players) }
    setError(null); setSaving(true)
    try {
      await onSave(next)
      // changing the year or tournament of an existing list moves it rather than copying it
      const o = draft.original
      if (o && originalKey !== registrationKey(next.season, next.tournament)) await onDelete(o.season, o.tournament)
      setPicked(registrationKey(next.season, next.tournament)); setDraft(null)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }
  const remove = async () => {
    const o = draft?.original
    if (!o || !window.confirm(`確定刪除「${label(o)}」報名名單？刪除後這個杯賽會列出全隊。`)) return
    setError(null); setSaving(true)
    try { await onDelete(o.season, o.tournament); setDraft(null); setPicked('') }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  const nameChip = (n: string) => (
    <button key={n} type="button" aria-pressed={draft?.players.has(n)} onClick={() => toggle(n)} className={chip(!!draft?.players.has(n))}>
      {numberOf.get(n) && <span className="tnum text-[11px] opacity-60 mr-1">{numberOf.get(n)}</span>}{n}
    </button>
  )
  const extras = draft ? [...draft.players].filter((n) => !order.includes(n)) : []

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] gap-4 md:gap-6">
      <div className="flex flex-col gap-2 min-w-0">
        {canEdit && <Button size="sm" variant="outline" icon={<Plus />} className="self-start" onClick={() => edit(null)} disabled={saving}>新增報名名單</Button>}
        {registrations.length > 0 ? (
          <ul className="flex flex-wrap md:flex-col gap-1.5 md:gap-1" aria-label="報名名單">
            {registrations.map((r) => {
              const key = registrationKey(r.season, r.tournament)
              const on = draft ? key === originalKey : r === selected
              return (
                <li key={key} className="min-w-0">
                  <button type="button" aria-current={on || undefined} onClick={() => { setPicked(key); setDraft(null); setError(null) }}
                    className={cx(chip(on), 'max-w-full md:w-full text-left inline-flex items-center truncate')}>
                    <span className="truncate">{label(r)}</span><span className={cx('tnum font-normal shrink-0', on ? 'opacity-70' : 'text-muted')}>・{r.players.length} 人</span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : !draft && <p className="text-[12px] text-muted">還沒有報名名單</p>}
      </div>

      <div className="min-w-0 flex flex-col gap-3">
        {draft ? (
          <>
            <div className="text-[13px] font-semibold text-ink">{draft.original ? `編輯「${label(draft.original)}」` : '新增報名名單'}</div>
            <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-3 max-w-md">
              <Field label="年度"><Select value={String(draft.season)} onChange={(e) => setDraft({ ...draft, season: Number(e.target.value) })} options={years.map((y) => ({ value: String(y), label: String(y) }))} className="w-full" /></Field>
              <Field label="杯賽"><Input value={draft.tournament} onChange={(e) => setDraft({ ...draft, tournament: e.target.value })} list="registration-tournaments" placeholder="例如 大專盃" /></Field>
            </div>
            <datalist id="registration-tournaments">{tournaments.map((t) => <option key={t} value={t} />)}</datalist>
            {clash && <p className="flex items-start gap-1.5 text-[12px] text-ink-2"><AlertTriangle className="size-3.5 text-warning shrink-0 mt-0.5" />已經有「{label(clash)}」的名單（{clash.players.length} 人），儲存會覆蓋它。</p>}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] font-medium text-ink-2">報名球員</span>
              <Badge variant={draft.players.size ? 'accent' : 'neutral'}>{draft.players.size} 人</Badge>
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, players: new Set([...draft.players, ...activeNames, ...(showInactive ? inactiveNames : [])]) })}>全選</Button>
                <Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, players: new Set() })} disabled={!draft.players.size}>清除</Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {activeNames.map(nameChip)}
              {extras.map(nameChip)}
              {activeNames.length + extras.length === 0 && <span className="text-[12px] text-muted">名單上沒有現役球員</span>}
            </div>
            {inactiveNames.length > 0 && (
              <div className="flex flex-col gap-2">
                <button type="button" aria-expanded={showInactive} onClick={() => setShowInactive((v) => !v)} className="self-start inline-flex items-center gap-1 h-9 pointer-fine:h-7 text-[12px] text-ink-2 hover:text-ink cursor-pointer">
                  {showInactive ? '隱藏' : '顯示'}離隊／畢業（{inactiveNames.length}）<ChevronDown className={cx('size-3.5 transition-transform motion-reduce:transition-none', showInactive && 'rotate-180')} />
                </button>
                {showInactive && <div className="flex flex-wrap gap-1.5">{inactiveNames.map(nameChip)}</div>}
              </div>
            )}
            <p className="text-[12px] text-muted">沒選任何人＝這個杯賽不限制，先發陣容與紀錄比賽列出全隊。</p>
            {error && <div role="alert" className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--critical)_35%,transparent)] bg-[color-mix(in_srgb,var(--critical)_8%,transparent)] px-3 py-2.5 text-[13px] text-ink"><AlertTriangle className="size-4 shrink-0 mt-0.5 text-critical" />{error}</div>}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              {draft.original && <Button variant="ghost" icon={<Trash2 />} className="text-critical hover:text-critical" disabled={saving} onClick={() => void remove()}>刪除</Button>}
              <div className="ml-auto flex gap-2">
                <Button variant="outline" onClick={() => { setDraft(null); setError(null) }} disabled={saving}>取消</Button>
                <Button variant="primary" onClick={() => void save()} disabled={saving}>{saving ? '儲存中…' : '儲存'}</Button>
              </div>
            </div>
          </>
        ) : selected ? (
          <>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-ink leading-5">{label(selected)}</div>
                <div className="text-xs text-muted mt-0.5 tnum">{selected.players.length} 人{selected.updatedAt ? `・更新於 ${selected.updatedAt.slice(0, 10)}` : ''}</div>
              </div>
              {canEdit && <Button size="sm" variant="outline" icon={<Pencil />} onClick={() => edit(selected)}>編輯</Button>}
            </div>
            {selected.players.length ? (
              <ul className="flex flex-wrap gap-1.5" aria-label={`${label(selected)} 報名球員`}>
                {ordered(selected.players).map((n) => (
                  <li key={n} className="inline-flex items-center h-8 px-2.5 rounded-[var(--radius-sm)] border border-border text-[13px] text-ink">
                    {numberOf.get(n) && <span className="tnum text-[11px] text-muted mr-1">{numberOf.get(n)}</span>}{n}
                  </li>
                ))}
              </ul>
            ) : <p className="text-[13px] text-muted">名單是空的：這個杯賽列出全隊。</p>}
          </>
        ) : (
          <EmptyState compact title="還沒有報名名單" description={canEdit ? '按「新增報名名單」選年度、杯賽和報名的球員。沒有名單的杯賽會列出全隊。' : '紀錄員建立後會出現在這裡。沒有名單的杯賽會列出全隊。'} />
        )}
      </div>
    </div>
  )
}
