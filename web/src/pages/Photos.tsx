import { useMemo, useState } from 'react'
import { Camera, ExternalLink, Pencil, Plus, Trash2, X } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { Field, Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { useDataStore } from '../store/data'
import { albumDate, albumProvider, albumTitle, isValidAlbumUrl, type AlbumLink } from '../data/albums'
import { summarizeGame } from '../data/stats'
import { cx } from '../lib/format'

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']
const fmtDate = (iso: string) => { const d = new Date(`${iso}T00:00:00`); return Number.isNaN(d.getTime()) ? iso : `${iso}（${WEEKDAY[d.getDay()]}）` }

/* ------------------------------------------------------------------ editor */
function AlbumForm({ initial, onSave, onCancel, onDelete }: { initial: AlbumLink | null; onSave: (a: AlbumLink) => Promise<void>; onCancel: () => void; onDelete?: () => Promise<void> }) {
  const base = useDataStore((s) => s.base)
  const games = useMemo(() => [...base.games].sort((a, b) => (a.date < b.date ? 1 : -1)), [base.games])
  const [target, setTarget] = useState<string>(initial?.gameId ?? (initial?.title ? 'custom' : games[0]?.id ?? 'custom'))
  const [title, setTitle] = useState(initial?.title ?? '')
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10))
  const [url, setUrl] = useState(initial?.url ?? '')
  const [photographer, setPhotographer] = useState(initial?.photographer ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setError(null)
    if (!isValidAlbumUrl(url)) { setError('請貼完整的連結（以 https:// 開頭）'); return }
    if (target === 'custom' && !title.trim()) { setError('請填相簿名稱'); return }
    setBusy(true)
    try {
      await onSave({ id: initial?.id ?? crypto.randomUUID(), gameId: target === 'custom' ? undefined : target, title: target === 'custom' ? title.trim() : undefined, date: target === 'custom' ? date : undefined, url: url.trim(), photographer: photographer.trim() || undefined, note: note.trim() || undefined, createdBy: initial?.createdBy, updatedAt: new Date().toISOString() })
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  return (
    <Card still title={initial ? '編輯相簿連結' : '新增相簿連結'} subtitle="攝影師把照片放在自己的 Google Drive 或 Google 相簿，設成「知道連結的人可檢視」，把連結貼在這裡">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="這是哪一場"><Select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full" options={[...games.map((g) => ({ value: g.id, label: `${g.date} vs ${g.opponent}${g.status === 'scheduled' ? '（預定）' : ''}` })), { value: 'custom', label: '不是比賽（春訓、迎新、聚餐…）' }]} /></Field>
        {target === 'custom' ? (<>
          <Field label="相簿名稱"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如 2026 春訓" /></Field>
          <Field label="日期"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="tnum" /></Field>
        </>) : <div className="hidden sm:block" />}
        <Field label="相簿連結" className="sm:col-span-2"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" inputMode="url" /></Field>
        <Field label="攝影師（選填）"><Input value={photographer} onChange={(e) => setPhotographer(e.target.value)} placeholder="誰拍的" /></Field>
        <Field label="備註（選填）"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如 只有上半場、原檔另外索取" /></Field>
      </div>
      {error && <p className="mt-3 text-[13px] text-critical">{error}</p>}
      <div className="mt-4 flex items-center gap-2">
        <Button variant="primary" onClick={() => void submit()} disabled={busy}>{busy ? '儲存中…' : '儲存'}</Button>
        <Button variant="ghost" onClick={onCancel} icon={<X />}>取消</Button>
        {onDelete && <Button variant="ghost" className="ml-auto text-critical" icon={<Trash2 />} onClick={() => { if (window.confirm('移除這個相簿連結？（照片本身不會被刪）')) void onDelete() }}>移除</Button>}
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ page */
export function PhotosPage() {
  const base = useDataStore((s) => s.base)
  const albums = useDataStore((s) => s.albums)
  const supported = useDataStore((s) => s.albumsSupported)
  const saveAlbum = useDataStore((s) => s.saveAlbum)
  const deleteAlbum = useDataStore((s) => s.deleteAlbum)
  const canEdit = useDataStore((s) => s.canEdit)()
  const [editing, setEditing] = useState<AlbumLink | null | 'new'>(null)
  const [error, setError] = useState<string | null>(null)
  const sorted = useMemo(() => [...albums].sort((a, b) => albumDate(b, base.games).localeCompare(albumDate(a, base.games)) || b.updatedAt.localeCompare(a.updatedAt)), [albums, base.games])
  const byYear = useMemo(() => { const m = new Map<string, AlbumLink[]>(); for (const a of sorted) { const y = albumDate(a, base.games).slice(0, 4); m.set(y, [...(m.get(y) ?? []), a]) } return [...m.entries()] }, [sorted, base.games])
  const scoreOf = (a: AlbumLink) => {
    const g = a.gameId ? base.games.find((x) => x.id === a.gameId) : undefined
    if (!g || g.status) return null
    const s = summarizeGame(base, g)
    return { text: `${s.runsUs}–${s.runsOpp}`, result: s.result }
  }
  const save = async (a: AlbumLink) => { try { await saveAlbum(a); setEditing(null); setError(null) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } }
  const remove = async (id: string) => { try { await deleteAlbum(id); setEditing(null) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } }

  return (
    <>
      <PageHeader title="相簿" description="每場比賽與活動的照片連結。照片放在攝影師的 Google Drive，點進去就能看、單張或整個資料夾下載。"
        actions={canEdit ? <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setEditing('new')}>新增相簿連結</Button> : undefined} />
      {!supported && <div role="status" className="rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2">相簿連結還沒開通：請管理員在 Supabase SQL Editor 執行一次 supabase/migrations/2026-09-12_albums_schedule.sql。</div>}
      {error && <div role="alert" className="rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--critical)_10%,var(--surface))] px-3 py-2.5 text-[13px] text-critical">{error}</div>}
      {editing === 'new' && <AlbumForm initial={null} onSave={save} onCancel={() => setEditing(null)} />}
      {sorted.length === 0 && editing !== 'new' && (
        <Card><EmptyState icon={<Camera />} title="還沒有相簿" description={canEdit ? '請攝影師把照片放到 Google Drive 資料夾並開啟連結分享，再按右上角新增。' : '等紀錄員貼上相簿連結後就會出現在這裡。'} /></Card>
      )}
      {byYear.map(([year, list]) => (
        <section key={year} className="flex flex-col gap-3">
          <h2 className="text-[13px] font-semibold text-muted tracking-[0.04em]">{year}</h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {list.map((a) => {
              const sc = scoreOf(a)
              if (editing && editing !== 'new' && editing.id === a.id) return <li key={a.id} className="md:col-span-2 xl:col-span-3"><AlbumForm initial={a} onSave={save} onCancel={() => setEditing(null)} onDelete={() => remove(a.id)} /></li>
              return (
                <li key={a.id}>
                  <Card className="h-full" bodyClassName="p-5 flex flex-col gap-3 h-full">
                    <div className="flex items-start gap-3">
                      <span className="size-10 rounded-[12px] bg-surface-2 text-ink-2 grid place-items-center shrink-0"><Camera className="size-5" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-semibold text-ink leading-5 truncate">{albumTitle(a, base.games)}</div>
                        <div className="text-[12px] text-muted mt-0.5 tnum">{fmtDate(albumDate(a, base.games))}{a.photographer ? `・${a.photographer} 攝` : ''}</div>
                      </div>
                      {sc && <Badge variant={sc.result === 'W' ? 'good' : sc.result === 'L' ? 'critical' : 'neutral'} className="tnum">{sc.text}</Badge>}
                    </div>
                    {a.note && <p className="text-[13px] text-ink-2 leading-relaxed">{a.note}</p>}
                    <div className="mt-auto flex items-center gap-2">
                      <Button variant="primary" size="sm" icon={<ExternalLink />} href={a.url} className={cx('flex-1')} title={a.url}>開啟相簿</Button>
                      <span className="text-[11px] text-muted whitespace-nowrap">{albumProvider(a.url)}</span>
                      {canEdit && <Button variant="ghost" size="sm" aria-label="編輯" icon={<Pencil />} onClick={() => setEditing(a)} />}
                    </div>
                  </Card>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </>
  )
}
