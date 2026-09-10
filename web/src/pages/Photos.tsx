import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Camera, Check, ChevronLeft, ChevronRight, Download, ImagePlus, RefreshCw, Trash2, X } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { Field, Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { LoginForm } from '../components/ui/LoginForm'
import { useDataStore } from '../store/data'
import { usePrefersReducedMotion } from '../hooks/useMediaQuery'
import { deletePhoto, downloadUrl, downloadZip, fileName, listPhotos, photoUrl, uploadPhoto, type Photo } from '../data/photos'
import { cx } from '../lib/format'

interface Album { key: string; name: string; gameId: string | null; photos: Photo[]; latest: string }

const fmtBytes = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.round(n / 1000)} KB`)

/* ------------------------------------------------------------------ upload */
interface Job { file: File; stage: string; error?: string; done?: boolean }

function UploadPanel({ albums, onUploaded }: { albums: Album[]; onUploaded: () => void }) {
  const base = useDataStore((s) => s.base)
  const email = useDataStore((s) => s.cloud.user?.email)
  const games = useMemo(() => [...base.games].sort((a, b) => (a.date < b.date ? 1 : -1)), [base.games])
  const [target, setTarget] = useState<string>(() => games[0]?.id ?? 'custom')
  const [custom, setCustom] = useState('')
  const [jobs, setJobs] = useState<Job[]>([])
  const [running, setRunning] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const albumFor = () => {
    if (target !== 'custom') { const g = games.find((x) => x.id === target)!; return { album: `${g.date} vs ${g.opponent}`, gameId: g.id } }
    return { album: custom.trim(), gameId: null }
  }
  const start = async (files: File[]) => {
    const t = albumFor()
    if (!t.album) return
    const list = files.filter((f) => f.type.startsWith('image/'))
    if (!list.length) return
    setJobs(list.map((file) => ({ file, stage: '等待' }))); setRunning(true)
    for (let i = 0; i < list.length; i++) {
      const set = (patch: Partial<Job>) => setJobs((js) => js.map((j, k) => (k === i ? { ...j, ...patch } : j)))
      try { await uploadPhoto(list[i], t, email, (stage) => set({ stage })); set({ stage: '完成', done: true }) }
      catch (e) { set({ stage: '失敗', error: e instanceof Error ? e.message : String(e) }) }
    }
    setRunning(false); onUploaded()
  }
  const existing = albums.filter((a) => !a.gameId)
  return (
    <Card title="上傳照片" subtitle="照片會在你的手機上縮成 2048px 網頁尺寸再上傳（原檔請自己留著）">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
        <Field label="放到哪個相簿">
          <Select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full" options={[...games.map((g) => ({ value: g.id, label: `${g.date} vs ${g.opponent}` })), { value: 'custom', label: '其他（自訂名稱）' }]} />
        </Field>
        {target === 'custom' && <Field label="相簿名稱" className="sm:col-span-2"><Input list="photo-albums" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="例如 2026 春訓、迎新賽" /><datalist id="photo-albums">{existing.map((a) => <option key={a.key} value={a.name} />)}</datalist></Field>}
      </div>
      <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void start([...e.dataTransfer.files]) }}
        className={cx('mt-4 rounded-[var(--radius-sm)] border-2 border-dashed border-border p-6 text-center', running && 'opacity-60')}>
        <ImagePlus className="size-6 mx-auto text-muted" />
        <p className="text-[13px] text-ink-2 mt-2">把照片拖進來，或</p>
        <Button className="mt-2" icon={<Camera />} onClick={() => inputRef.current?.click()} disabled={running || (target === 'custom' && !custom.trim())}>選擇照片</Button>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void start([...(e.target.files ?? [])]); e.target.value = '' }} />
        <p className="text-[11px] text-muted mt-2">一次可以選很多張。JPG／PNG／HEIC（iPhone 會自動轉成 JPG）</p>
      </div>
      {jobs.length > 0 && (
        <ul className="mt-3 max-h-[220px] overflow-y-auto divide-y divide-[var(--border)] text-[12px]">
          {jobs.map((j, i) => (
            <li key={i} className="py-1.5 flex items-center gap-2">
              <span className="truncate flex-1 text-ink">{j.file.name}</span>
              <span className="text-muted tnum">{fmtBytes(j.file.size)}</span>
              <span className={cx('w-14 text-right', j.error ? 'text-critical' : j.done ? 'text-good' : 'text-ink-2')}>{j.stage}</span>
              {j.error && <span className="text-critical basis-full">{j.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ lightbox */
function Lightbox({ photos, index, onClose, onStep, canDelete, onDelete }: { photos: Photo[]; index: number; onClose: () => void; onStep: (d: number) => void; canDelete: boolean; onDelete: (p: Photo) => void }) {
  const p = photos[index]
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') onStep(1); if (e.key === 'ArrowLeft') onStep(-1) }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onStep])
  if (!p) return null
  return (
    <div role="dialog" aria-modal="true" aria-label="照片" className="fixed inset-0 z-[70] bg-black/92 flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 text-white/80 text-[12px]">
        <span className="truncate">{p.album}・{new Date(p.created_at).toLocaleString('zh-TW')}{p.uploaded_by ? `・${p.uploaded_by}` : ''}</span>
        <span className="ml-auto tnum">{index + 1} / {photos.length}</span>
        <a href={downloadUrl(p)} className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-white/15 hover:bg-white/25 text-white"><Download className="size-3.5" />下載</a>
        {canDelete && <button type="button" onClick={() => { if (window.confirm('刪除這張照片？')) onDelete(p) }} className="inline-flex items-center justify-center size-8 rounded-full hover:bg-white/15 cursor-pointer" aria-label="刪除"><Trash2 className="size-4" /></button>}
        <button type="button" onClick={onClose} className="inline-flex items-center justify-center size-8 rounded-full hover:bg-white/15 cursor-pointer" aria-label="關閉"><X className="size-5" /></button>
      </div>
      <div className="relative flex-1 min-h-0 flex items-center justify-center px-12" onClick={onClose}>
        <img src={photoUrl(p.path)} alt={p.caption ?? ''} className="max-h-full max-w-full object-contain select-none" onClick={(e) => e.stopPropagation()} draggable={false} />
        <button type="button" onClick={(e) => { e.stopPropagation(); onStep(-1) }} className="absolute left-2 top-1/2 -translate-y-1/2 size-10 rounded-full bg-white/10 hover:bg-white/25 text-white inline-flex items-center justify-center cursor-pointer" aria-label="上一張"><ChevronLeft className="size-5" /></button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onStep(1) }} className="absolute right-2 top-1/2 -translate-y-1/2 size-10 rounded-full bg-white/10 hover:bg-white/25 text-white inline-flex items-center justify-center cursor-pointer" aria-label="下一張"><ChevronRight className="size-5" /></button>
      </div>
      {p.caption && <div className="px-4 py-2 text-center text-white/85 text-[13px]">{p.caption}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ page */
export function PhotosPage() {
  const cloud = useDataStore((s) => s.cloud)
  const canUpload = useDataStore((s) => s.canUpload)()
  const reduced = usePrefersReducedMotion()
  const [params, setParams] = useSearchParams()
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  const [supported, setSupported] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<number | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const refresh = async () => {
    if (!cloud.configured) return
    try { const list = await listPhotos(); if (list === null) setSupported(false); else setPhotos(list); setError(null) } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  useEffect(() => { void refresh() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [cloud.configured])
  const albums = useMemo<Album[]>(() => {
    const m = new Map<string, Album>()
    for (const p of photos ?? []) { const a = m.get(p.album_key) ?? { key: p.album_key, name: p.album, gameId: p.game_id, photos: [], latest: p.created_at }; a.photos.push(p); if (p.created_at > a.latest) a.latest = p.created_at; m.set(p.album_key, a) }
    return [...m.values()].sort((a, b) => (a.latest < b.latest ? 1 : -1))
  }, [photos])
  const albumKeyParam = params.get('album')
  const current = albums.find((a) => a.key === albumKeyParam) ?? albums[0]
  const choose = (key: string) => { setParams((p) => { p.set('album', key); return p }, { replace: true }); setSelecting(false); setPicked(new Set()) }
  const list = current?.photos ?? []
  const togglePick = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const zip = async (items: Photo[], name: string) => {
    if (!items.length) return
    const total = items.reduce((a, p) => a + (p.size_bytes ?? 600_000), 0)
    if (total > 300_000_000 && !window.confirm(`這批約 ${fmtBytes(total)}，手機可能吃不下，仍要打包？`)) return
    setBusy(`打包中 0 / ${items.length}`)
    try { await downloadZip(items, name, (d, t) => setBusy(`打包中 ${d} / ${t}`)) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(null) }
  }
  const remove = async (p: Photo) => {
    try { await deletePhoto(p); setPhotos((ps) => (ps ?? []).filter((x) => x.id !== p.id)); setOpen((i) => (i === null ? null : Math.max(0, Math.min(i, list.length - 2)))); if (list.length <= 1) setOpen(null) } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  if (!cloud.configured) {
    return (<><PageHeader title="相簿" description="比賽與活動照片。" /><Card><EmptyState icon={<Camera />} title="相簿需要雲端模式" description="設定 Supabase 之後，攝影師就能在這裡上傳、隊員可以下載。" /></Card></>)
  }
  if (!supported) {
    return (<><PageHeader title="相簿" description="比賽與活動照片。" /><Card><EmptyState icon={<Camera />} title="相簿還沒開通" description="請管理員在 Supabase SQL Editor 執行一次 supabase/migrations/2026-09-12_photos.sql。" /></Card></>)
  }
  return (
    <>
      <PageHeader title="相簿" description={photos ? `${albums.length} 本相簿・${photos.length} 張照片。點照片放大，右上角可下載；勾選多張可一次打包。` : '載入中…'}
        actions={<div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={<RefreshCw />} onClick={() => void refresh()}>重新整理</Button>
          {canUpload ? <Button variant="primary" size="sm" icon={<Camera />} onClick={() => setShowUpload((v) => !v)} aria-expanded={showUpload}>{showUpload ? '收起上傳' : '上傳照片'}</Button>
            : !cloud.user ? <Button size="sm" onClick={() => setShowUpload((v) => !v)}>攝影師登入</Button> : null}
        </div>} />
      {error && <div role="alert" className="rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--critical)_10%,var(--surface))] px-3 py-2.5 text-[13px] text-critical">{error}</div>}
      {showUpload && (canUpload ? <UploadPanel albums={albums} onUploaded={() => void refresh()} /> : !cloud.user ? <Card title="攝影師登入" subtitle="登入後若在攝影師或紀錄員名單就能上傳"><div className="max-w-sm"><LoginForm /></div></Card> : <Card><EmptyState compact title="你的帳號還不能上傳" description="請管理員把你的 email 加進 Supabase 的 photographers 表。" /></Card>)}

      {albums.length === 0 ? (
        photos && <Card><EmptyState icon={<Camera />} title="還沒有照片" description={canUpload ? '按右上角「上傳照片」開始。' : '等攝影師上傳後就會出現在這裡。'} /></Card>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto scroll-x -mx-1 px-1 pb-1">
            {albums.map((a) => (
              <button key={a.key} type="button" onClick={() => choose(a.key)}
                className={cx('shrink-0 inline-flex items-center gap-2 h-9 pl-1.5 pr-3 rounded-full text-[13px] font-medium cursor-pointer transition-colors', current?.key === a.key ? 'bg-ink text-bg' : 'bg-surface text-ink-2 hover:text-ink shadow-[var(--shadow-card)]')}>
                <img src={photoUrl(a.photos[0].thumb_path)} alt="" className="size-6 rounded-full object-cover" loading="lazy" />
                {a.name}<span className={cx('tnum text-[11px]', current?.key === a.key ? 'text-bg/70' : 'text-muted')}>{a.photos.length}</span>
              </button>
            ))}
          </div>
          {current && (
            <Card title={current.name} subtitle={`${list.length} 張・最近更新 ${new Date(current.latest).toLocaleDateString('zh-TW')}`}
              action={<div className="flex items-center gap-1.5 flex-wrap justify-end">
                {selecting ? (<>
                  <Button size="sm" variant="ghost" onClick={() => setPicked(new Set(list.map((p) => p.id)))}>全選</Button>
                  <Button size="sm" variant="primary" icon={<Download />} disabled={!picked.size || !!busy} onClick={() => void zip(list.filter((p) => picked.has(p.id)), `${current.key}_${picked.size}張.zip`)}>{busy ?? `下載選取 ${picked.size}`}</Button>
                  <Button size="sm" variant="ghost" icon={<X />} onClick={() => { setSelecting(false); setPicked(new Set()) }}>取消</Button>
                </>) : (<>
                  <Button size="sm" icon={<Check />} onClick={() => setSelecting(true)}>選取</Button>
                  <Button size="sm" icon={<Download />} disabled={!!busy} onClick={() => void zip(list, `${current.key}_全部.zip`)}>{busy ?? '全部下載'}</Button>
                </>)}
              </div>}>
              <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                {list.map((p, i) => {
                  const on = picked.has(p.id)
                  return (
                    <li key={p.id} className="relative group">
                      <button type="button" onClick={() => (selecting ? togglePick(p.id) : setOpen(i))} className={cx('block w-full aspect-square overflow-hidden rounded-[12px] bg-surface-2 cursor-pointer', on && 'ring-2 ring-ink ring-offset-2 ring-offset-surface')} aria-label={selecting ? (on ? '取消選取' : '選取') : '放大'}>
                        <motion.img src={photoUrl(p.thumb_path)} alt={p.caption ?? ''} loading="lazy" decoding="async" className="size-full object-cover" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} whileHover={reduced ? undefined : { scale: 1.03 }} />
                      </button>
                      {selecting ? (
                        <span className={cx('absolute top-2 left-2 size-6 rounded-full border-2 inline-flex items-center justify-center pointer-events-none', on ? 'bg-ink border-ink text-bg' : 'bg-black/30 border-white/80')}>{on && <Check className="size-3.5" />}</span>
                      ) : (
                        <a href={downloadUrl(p)} download={fileName(p)} aria-label="下載" onClick={(e) => e.stopPropagation()} className="absolute bottom-2 right-2 size-8 rounded-full bg-black/55 text-white inline-flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"><Download className="size-4" /></a>
                      )}
                    </li>
                  )
                })}
              </ul>
              {current.gameId && <p className="mt-3 text-[12px] text-muted">這本相簿連到比賽 <Badge>{current.gameId}</Badge></p>}
            </Card>
          )}
        </>
      )}
      <AnimatePresence>{open !== null && list[open] && <Lightbox photos={list} index={open} onClose={() => setOpen(null)} onStep={(d) => setOpen((i) => (i === null ? null : (i + d + list.length) % list.length))} canDelete={canUpload} onDelete={(p) => void remove(p)} />}</AnimatePresence>
    </>
  )
}
