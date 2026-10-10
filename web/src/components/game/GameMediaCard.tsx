import { useState } from 'react'
import { Camera, ExternalLink, Pencil, Plus, Trash2, Video, X } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Field, Input } from '../ui/Input'
import { useDataStore } from '../../store/data'
import { albumProvider, ALBUMS_SETUP_NOTE, gameMedia, isValidAlbumUrl, VIDEO_TITLE, type AlbumLink } from '../../data/albums'

const BAD_URL = '請貼完整的連結（以 https:// 開頭）'
type Kind = 'video' | 'photo'

/** The inline add / edit form of one link (a video, or a photo album) of this game. */
function LinkForm({ kind, gameId, existing, onDone }: { kind: Kind; gameId: string; existing?: AlbumLink; onDone: () => void }) {
  const saveAlbum = useDataStore((s) => s.saveAlbum)
  const deleteAlbum = useDataStore((s) => s.deleteAlbum)
  const [url, setUrl] = useState(existing?.url ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [photographer, setPhotographer] = useState(existing?.photographer ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const video = kind === 'video'
  const save = async () => {
    setError(null)
    if (!isValidAlbumUrl(url)) { setError(BAD_URL); return }
    setBusy(true)
    try {
      await saveAlbum({
        id: existing?.id ?? crypto.randomUUID(), gameId, title: video ? VIDEO_TITLE : undefined, url: url.trim(), note: note.trim() || undefined,
        photographer: (video ? existing?.photographer : photographer.trim()) || undefined, createdBy: existing?.createdBy, updatedAt: new Date().toISOString(),
      })
      onDone()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!existing || !window.confirm(video ? '移除這個影片連結？（影片本身不會被刪）' : '移除這個相簿連結？（照片本身不會被刪）')) return
    setBusy(true)
    try { await deleteAlbum(existing.id); onDone() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  return (
    <div className="rounded-[var(--radius-sm)] border border-border p-3 flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={video ? '影片連結' : '相簿連結'} className="sm:col-span-2" hint={url.trim() && !isValidAlbumUrl(url) ? <span className="text-critical">{BAD_URL}</span> : undefined}>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={video ? 'https://youtu.be/…' : 'https://drive.google.com/drive/folders/…'} inputMode="url" aria-invalid={!!url.trim() && !isValidAlbumUrl(url)} />
        </Field>
        {!video && <Field label="攝影師（選填）"><Input value={photographer} onChange={(e) => setPhotographer(e.target.value)} placeholder="誰拍的" /></Field>}
        <Field label="說明（選填）"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={video ? '例如 上半場、本壘後方' : '例如 只有上半場'} /></Field>
      </div>
      {error && <p role="alert" className="text-[13px] text-critical">{error}</p>}
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => void save()} disabled={busy}>{busy ? '儲存中…' : '儲存'}</Button>
        <Button variant="ghost" size="sm" icon={<X />} onClick={onDone}>取消</Button>
        {existing && <Button variant="ghost" size="sm" className="ml-auto text-critical" icon={<Trash2 />} onClick={() => void remove()} disabled={busy}>移除</Button>}
      </div>
    </div>
  )
}

/**
 * 照片與影片 of one game: links to whole-game videos (YouTube, Drive…) and photo albums, opened in a new tab (the
 * site never embeds a player). Recorders add, edit and remove them here; they are rows of the albums table.
 */
export function GameMediaCard({ gameId, canEdit }: { gameId: string; canEdit: boolean }) {
  const albums = useDataStore((s) => s.albums)
  const supported = useDataStore((s) => s.albumsSupported)
  const { photos, videos } = gameMedia(albums, gameId)
  const [form, setForm] = useState<{ kind: Kind; existing?: AlbumLink } | null>(null)
  if (!photos.length && !videos.length && !canEdit) return null
  const row = (a: AlbumLink, kind: Kind) => {
    if (form?.existing?.id === a.id) return <li key={a.id}><LinkForm kind={form.kind} gameId={gameId} existing={a} onDone={() => setForm(null)} /></li>
    const label = kind === 'video' ? `比賽影片${a.note?.trim() ? `（${a.note.trim()}）` : ''}` : `相簿${a.photographer ? `・${a.photographer} 攝` : ''}`
    return (
      <li key={a.id} className="flex items-center gap-3 min-h-11 py-1.5">
        <span className="size-9 rounded-[10px] bg-surface-2 text-ink-2 grid place-items-center shrink-0">{kind === 'video' ? <Video className="size-4" /> : <Camera className="size-4" />}</span>
        <div className="min-w-0 flex-1">
          {/* wraps instead of cutting off: the note (上半場／下半場) is what tells two videos apart on a phone */}
          <div className="text-[14px] font-medium text-ink leading-5 break-words">{label}</div>
          <div className="text-[12px] text-muted truncate">{albumProvider(a.url)}{kind === 'photo' && a.note ? `・${a.note}` : ''}</div>
        </div>
        <Button variant="outline" size="sm" icon={<ExternalLink />} href={a.url} title={a.url}>開啟</Button>
        {canEdit && supported && <Button variant="ghost" size="sm" aria-label={`編輯：${label}`} icon={<Pencil />} onClick={() => setForm({ kind, existing: a })} />}
      </li>
    )
  }
  return (
    <Card id="game-media" title="照片與影片" subtitle="整場比賽的影片與相簿連結，點「開啟」會在新分頁打開"
      action={canEdit && supported ? (
        <>
          <Button variant="ghost" size="sm" icon={<Plus />} onClick={() => setForm({ kind: 'video' })}>比賽影片</Button>
          <Button variant="ghost" size="sm" icon={<Plus />} onClick={() => setForm({ kind: 'photo' })}>相簿</Button>
        </>
      ) : undefined}>
      {canEdit && !supported && <p role="status" className="rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2 mb-3">{ALBUMS_SETUP_NOTE}</p>}
      {form && !form.existing && <div className="mb-3"><LinkForm kind={form.kind} gameId={gameId} onDone={() => setForm(null)} /></div>}
      {photos.length || videos.length ? (
        <ul className="flex flex-col divide-y divide-[var(--border)]">
          {videos.map((a) => row(a, 'video'))}
          {photos.map((a) => row(a, 'photo'))}
        </ul>
      ) : <p className="text-[13px] text-muted">這場還沒有影片或相簿連結。影片可以上傳到 YouTube（設成不公開）或 Google Drive，再按「＋ 比賽影片」貼上連結。</p>}
    </Card>
  )
}
