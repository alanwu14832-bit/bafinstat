import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Download, ImagePlus, RotateCcw, Share2, Trash2 } from 'lucide-react'
import { Sheet } from './Sheet'
import { Button } from './Button'
import { Select } from './Select'
import { Tabs } from './Tabs'
import { useStats } from '../../hooks/useStats'
import { useAccess } from '../../hooks/useAccess'
import { TEAM, teamAsset } from '../../config/team'
import { TEAM_NAME } from '../../data/seed'
import { opponentLabel } from '../../data/intrasquad'
import { STORY_KIND_LABEL, storyCard, storyFileName, storyGames, storyPlayers, type StoryKind, type StorySource } from '../../data/storyCard'
import { BG } from '../../lib/shareImage'
import { canShareFile, canvasBlob, DEFAULT_VIEW, downloadBlob, drawStory, loadImage, loadPhoto, panView, shareBlob, STORY_H, STORY_W, type PhotoView } from '../../lib/storyImage'

const KINDS: StoryKind[] = ['game-bat', 'game-pit', 'season-bat', 'season-pit']
const HEADLINE_MAX = 44
type Photo = Awaited<ReturnType<typeof loadPhoto>>

export interface StoryDialogProps {
  open: boolean
  onClose: () => void
  /** 球員頁: this player, any of his games. */
  player?: string
  /** 比賽頁: this game, any of our players in it. */
  gameId?: string
}

/**
 * 限時動態: pick a card (單場打擊／單場投球／本季), add a photo, reword the sentence, then share the 1080 × 1920 image
 * (the phone's share sheet has Instagram → 限時動態) or download it. Nothing is uploaded: the photo is only drawn here.
 */
export function StoryDialog({ open, onClose, player, gameId }: StoryDialogProps) {
  const s = useStats()
  const { level } = useAccess()
  const src: StorySource = useMemo(() => ({ team: TEAM_NAME, site: TEAM.siteUrl, full: s.full, counted: s.dataset, params: s.params, season: level >= 1 }), [s.full, s.dataset, s.params, level])
  const players = useMemo(() => (gameId ? storyPlayers(s.full, gameId) : player ? [player] : []), [s.full, gameId, player])
  const [pickedName, setName] = useState('')
  const name = players.includes(pickedName) ? pickedName : players[0] ?? ''
  const games = useMemo(() => { const g = storyGames(s.full, name); return gameId ? { bat: g.bat.filter((x) => x.id === gameId), pit: g.pit.filter((x) => x.id === gameId) } : g }, [s.full, name, gameId])
  const kinds = useMemo(() => KINDS.filter((k) => (k === 'game-bat' ? games.bat.length > 0 : k === 'game-pit' ? games.pit.length > 0 : !!storyCard(src, k, name))), [games, src, name])
  const [pickedKind, setKind] = useState<StoryKind>('game-bat')
  const kind = kinds.includes(pickedKind) ? pickedKind : kinds[0]
  const list = kind === 'game-bat' ? games.bat : kind === 'game-pit' ? games.pit : []
  const [pickedGame, setGame] = useState('')
  const gid = list.some((g) => g.id === pickedGame) ? pickedGame : list[0]?.id
  const base = useMemo(() => (kind && name ? storyCard(src, kind, name, gid) : null), [src, kind, name, gid])
  // the reader's own wording belongs to one card: another player, game or kind starts from the site's sentence again
  const id = `${kind}|${name}|${gid ?? ''}`
  const [custom, setCustom] = useState<{ id: string; text: string } | null>(null)
  const headline = custom?.id === id ? custom.text : base?.headline ?? ''
  const card = useMemo(() => (base ? { ...base, headline } : null), [base, headline])

  const [photo, setPhoto] = useState<Photo | null>(null)
  const [view, setView] = useState<PhotoView>(DEFAULT_VIEW)
  const [mark, setMark] = useState<HTMLImageElement | null>(null)
  const [fonts, setFonts] = useState(0)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const shareable = useMemo(() => canShareFile(), [])

  useEffect(() => {
    if (!open) return
    let live = true
    loadImage(teamAsset(TEAM.mark)).then((img) => { if (live) setMark(img) }).catch(() => undefined)
    // the figures' typeface may not have been used on this page yet: draw again once it is there
    const fs = (document as Document & { fonts?: FontFaceSet }).fonts
    if (fs?.load) Promise.all([fs.load('800 136px "Barlow Semi Condensed"'), fs.load('700 44px "Barlow Semi Condensed"')]).then(() => { if (live) setFonts((n) => n + 1) }).catch(() => undefined)
    return () => { live = false }
  }, [open])
  useEffect(() => { if (open && card && canvas.current) drawStory(canvas.current, card, { photo, view, mark }) }, [open, card, photo, view, mark, fonts])

  const pick = async (f?: File) => {
    if (!f) return
    setNote('')
    try { setPhoto(await loadPhoto(f)); setView(DEFAULT_VIEW) } catch { setNote('這張照片讀不出來，換一張試試（建議 JPG 或 PNG）。') }
  }
  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => { if (!photo) return; drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture?.(e.pointerId) }
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!photo || !drag.current) return
    const k = STORY_W / (e.currentTarget.getBoundingClientRect().width || STORY_W)
    const dx = (e.clientX - drag.current.x) * k, dy = (e.clientY - drag.current.y) * k
    drag.current = { x: e.clientX, y: e.clientY }
    setView((v) => panView(v, dx, dy, photo.width, photo.height))
  }
  const up = () => { drag.current = null }

  const out = async (how: 'share' | 'download') => {
    if (!card || !canvas.current) return
    setBusy(true); setNote('')
    try {
      const blob = await canvasBlob(canvas.current)
      if (!blob) { setNote('這台裝置做不出圖片，換個瀏覽器試試。'); return }
      const fileName = storyFileName(card, list.find((g) => g.id === gid)?.date)
      if (how === 'share') {
        const r = await shareBlob(blob, fileName)
        if (r === 'failed') { downloadBlob(blob, fileName); setNote('這台裝置不能直接分享，已改成下載圖片。') }
      } else { downloadBlob(blob, fileName); setNote('圖片已下載。到 Instagram 新增限時動態，選這張圖。') }
    } finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onClose={onClose} ariaLabel="分享限時動態" side="bottom" desktopFrom="sm" panelClassName="sm:max-w-3xl max-h-[92vh]">
      <div className="p-5 flex flex-col gap-4">
        <div>
          <div className="text-[16px] font-semibold text-ink">分享限時動態</div>
          <p className="text-[13px] text-ink-2 mt-1">做一張 Instagram 限時動態尺寸（1080 × 1920）的成績圖。數字都是網站從紀錄算的。</p>
        </div>
        {!card ? <p className="text-[13px] text-muted py-6 text-center">{players.length ? '這位球員還沒有可以做成卡片的紀錄。' : '這場比賽還沒有我隊球員的紀錄。'}</p> : (
          <div className="flex flex-col sm:flex-row gap-5">
            <div className="shrink-0 self-center sm:self-start flex flex-col items-center gap-2">
              <canvas ref={canvas} width={STORY_W} height={STORY_H} role="img" aria-label={`限時動態預覽：${card.name}，${card.headline}`}
                onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                className="w-[210px] sm:w-[250px] aspect-[9/16] rounded-[14px] shadow-[var(--shadow-card)] select-none"
                style={{ background: BG, touchAction: photo ? 'none' : 'auto', cursor: photo ? 'grab' : 'default' }} />
              <p className="text-[11.5px] text-muted text-center max-w-[250px]">{photo ? '拖曳預覽圖可以移動照片' : '最上面和最下面留白，是給 IG 的頭像列和回覆列'}</p>
            </div>
            <div className="min-w-0 flex-1 flex flex-col gap-3.5">
              {players.length > 1 && <Select label="球員" aria-label="球員" value={name} onChange={(e) => setName(e.target.value)} options={players.map((n) => ({ value: n, label: n }))} />}
              {kinds.length > 1 && <Tabs aria-label="卡片種類" size="sm" items={kinds.map((k) => ({ value: k, label: STORY_KIND_LABEL[k] }))} value={kind} onChange={setKind} />}
              {list.length > 1 && <Select label="比賽" aria-label="比賽" value={gid ?? ''} onChange={(e) => setGame(e.target.value)} options={list.map((g) => ({ value: g.id, label: `${g.date.slice(5).replace('-', '/')} vs ${opponentLabel(g)}` }))} />}
              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] text-muted">照片（選填）</span>
                <div className="flex flex-wrap items-center gap-2">
                  <input ref={file} type="file" accept="image/*" className="sr-only" aria-label="選照片" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
                  <Button size="sm" variant="outline" icon={<ImagePlus />} onClick={() => file.current?.click()}>{photo ? '換一張' : '選照片'}</Button>
                  {photo && <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setPhoto(null)}>拿掉照片</Button>}
                </div>
                {photo && (
                  <label className="flex items-center gap-2 text-[12px] text-muted">放大
                    <input type="range" min={1} max={3} step={0.01} value={view.zoom} aria-label="照片放大" onChange={(e) => setView((v) => ({ ...v, zoom: Number(e.target.value) }))} className="flex-1 accent-[var(--accent)]" />
                  </label>
                )}
                <p className="text-[11.5px] text-muted">照片只在這台裝置上用來做圖，不會上傳，也不會存到網站。</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="story-headline" className="text-[12px] text-muted">亮點文字（可以自己改）</label>
                  {custom?.id === id && custom.text !== base?.headline && <button type="button" onClick={() => setCustom(null)} className="inline-flex items-center gap-1 text-[12px] text-ink-2 hover:text-ink cursor-pointer"><RotateCcw className="size-3" />還原</button>}
                </div>
                <textarea id="story-headline" rows={2} maxLength={HEADLINE_MAX} value={headline} onChange={(e) => setCustom({ id, text: e.target.value.replace(/\n/g, '') })}
                  className="w-full rounded-[10px] bg-surface-3/60 border border-transparent px-3 py-2 text-[14px] text-ink resize-none focus:bg-surface focus:border-[color-mix(in_srgb,var(--ink)_30%,transparent)] focus:outline-none" />
                <span className="text-[11.5px] text-muted text-right tnum">{headline.length} / {HEADLINE_MAX}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {shareable && <Button variant="primary" icon={<Share2 />} disabled={busy} onClick={() => void out('share')}>分享</Button>}
                <Button variant={shareable ? 'outline' : 'primary'} icon={<Download />} disabled={busy} onClick={() => void out('download')}>下載圖片</Button>
                <Button variant="ghost" onClick={onClose}>關閉</Button>
              </div>
              <p className="text-[12px] text-ink-2" role="status">{note || (shareable ? '按「分享」後選 Instagram → 限時動態。' : '下載後傳到手機，在 Instagram 新增限時動態時選這張圖。')}</p>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}
