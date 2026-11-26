import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Crosshair, Download, ImagePlus, RotateCcw, Share2, Trash2, Wand2 } from 'lucide-react'
import { Sheet } from './Sheet'
import { Button } from './Button'
import { Select } from './Select'
import { CutoutRefine } from './CutoutRefine'
import { TEAM, teamAsset } from '../../config/team'
import type { Game } from '../../data/types'
import { lineupPostDate, lineupPostRows, lineupPostVenue } from '../../data/lineupPost'
import type { Lineup } from '../../record/lineup'
import { DEFAULT_POST_PHOTO, defaultLook, drawLineupPost, nameFace, POST_H, POST_W, type LineupPostLook, type PostPhoto } from '../../lib/lineupImage'
import { canShareFile, canvasBlob, downloadBlob, loadImage, loadPhoto, shareBlob } from '../../lib/storyImage'
import { loadStoryFonts } from '../../lib/storyFonts'
import { canCutout, cutWith, removeBackground, type CutoutProgress } from '../../lib/cutout'

type Photo = Awaited<ReturnType<typeof loadPhoto>>
/** the look kept on this device (the title, the team line, the colours): the date and the field come from the game */
const LOOK_KEY = 'bafin.lineuppost.v1'
const HEX = /^#[0-9a-f]{6}$/i
function loadLook(): LineupPostLook {
  const d = defaultLook(TEAM.short)
  try {
    const r = JSON.parse(localStorage.getItem(LOOK_KEY) ?? 'null') as Partial<LineupPostLook> | null
    if (!r) return d
    const str = (v: unknown, def: string) => (typeof v === 'string' ? v.slice(0, 40) : def)
    const col = (v: unknown, def: string) => (typeof v === 'string' && HEX.test(v) ? v : def)
    return { ...d, title: str(r.title, d.title), team: str(r.team, d.team), accent: col(r.accent, d.accent), highlight: col(r.highlight, d.highlight), ink: col(r.ink, d.ink) }
  } catch { return d }
}

export interface LineupPostDialogProps { open: boolean; onClose: () => void; lineup: Lineup; game?: Game }

/**
 * 先發陣容 IG 貼文: the lineup on the 先發陣容 page as the team's STARTING LINEUP post (1080 × 1350). A player photo goes on the
 * left (自動去背, 手動修邊, moved and sized on the preview); the player in it is picked from the lineup and his row turns
 * red; their badge is optional (else a disc with their name); every text and colour can be changed. Nothing is uploaded.
 */
export function LineupPostDialog({ open, onClose, lineup, game }: LineupPostDialogProps) {
  const rows = useMemo(() => lineupPostRows(lineup), [lineup])
  const [look, setLook] = useState<LineupPostLook>(loadLook)
  // the date and the field: from the game, reworded here for this post only
  const autoDate = lineupPostDate(game), autoVenue = lineupPostVenue(game)
  const [date, setDate] = useState<string | null>(null)
  const [venue, setVenue] = useState<string | null>(null)
  const [highlight, setHighlight] = useState('')
  const [photo, setPhoto] = useState<{ photo: Photo; cut: HTMLCanvasElement | null; mask: HTMLCanvasElement | null; useCut: boolean } | null>(null)
  const [place, setPlace] = useState<PostPhoto>(DEFAULT_POST_PHOTO)
  const [oppLogo, setOppLogo] = useState<Photo | null>(null)
  const [mark, setMark] = useState<HTMLImageElement | null>(null)
  const [cutting, setCutting] = useState<CutoutProgress | null>(null)
  const [refining, setRefining] = useState(false)
  const [fonts, setFonts] = useState(0)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const photoFile = useRef<HTMLInputElement>(null)
  const logoFile = useRef<HTMLInputElement>(null)
  const photoBox = useRef<{ x: number; y: number; w: number; h: number } | undefined>(undefined)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const cutRun = useRef(0)
  const shareable = useMemo(() => canShareFile(), [])

  useEffect(() => { try { localStorage.setItem(LOOK_KEY, JSON.stringify({ title: look.title, team: look.team, accent: look.accent, highlight: look.highlight, ink: look.ink })) } catch { /* private mode */ } }, [look])
  useEffect(() => {
    if (!open) return
    let live = true
    loadImage(teamAsset(TEAM.mark)).then((img) => { if (live) setMark(img) }).catch(() => undefined)
    void loadStoryFonts([...rows.map((r) => r.name), game?.opponent ?? '', game?.venue ?? ''].join('')).then(() => { if (live) setFonts((n) => n + 1) })
    return () => { live = false }
  }, [open, rows, game?.opponent, game?.venue])
  const front = photo ? (photo.cut && photo.useCut ? photo.cut : photo.photo) : null
  const draw = useMemo(() => ({
    rows, highlight, look: { ...look, date: date ?? autoDate, venue: venue ?? autoVenue }, photo: front, place, mark, oppLogo, opponent: game?.opponent ?? '',
  }), [rows, highlight, look, date, autoDate, venue, autoVenue, front, place, mark, oppLogo, game?.opponent])
  useEffect(() => { if (open && canvas.current) photoBox.current = drawLineupPost(canvas.current, draw)?.photo }, [open, draw, fonts])

  const pickPhoto = async (f?: File) => {
    if (!f) return
    setNote('')
    try { const p = await loadPhoto(f); cutRun.current++; setCutting(null); setRefining(false); setPhoto({ photo: p, cut: null, mask: null, useCut: true }); setPlace(DEFAULT_POST_PHOTO) }
    catch { setNote('這張照片讀不出來，換一張試試（建議 JPG 或 PNG）。') }
  }
  const pickLogo = async (f?: File) => { if (!f) return; try { setOppLogo(await loadPhoto(f)) } catch { setNote('這張隊徽讀不出來，換一張試試。') } }
  const cut = async () => {
    if (!photo || cutting) return
    const run = ++cutRun.current
    setNote(''); setCutting({ stage: 'prepare' })
    try {
      const c = await removeBackground(photo.photo, (p) => { if (cutRun.current === run) setCutting(p) })
      if (cutRun.current !== run) return
      setPhoto((x) => (x ? { ...x, cut: c.cut, mask: c.mask, useCut: true } : x))
      setNote('去背完成。還有沒去乾淨或被去掉的地方，按「手動修邊」塗一下。')
    } catch (e) {
      if (cutRun.current === run) setNote(`去背沒有成功：${e instanceof Error ? e.message : '不明原因'}。可以換一張主體清楚的照片再試。`)
    } finally { if (cutRun.current === run) setCutting(null) }
  }
  const cuttingText = !cutting ? '' : cutting.stage === 'download' ? `下載去背工具 ${cutting.total ? Math.round((cutting.loaded / cutting.total) * 100) : Math.round(cutting.loaded / 1e6)}${cutting.total ? '%' : ' MB'}（約 55 MB，只有第一次要下載）` : cutting.stage === 'prepare' ? '準備去背工具…' : '正在去背，大約要 10～30 秒…'

  // the preview: drag the photo where it should stand
  const k = (e: ReactPointerEvent<HTMLCanvasElement>) => POST_W / (e.currentTarget.getBoundingClientRect().width || POST_W)
  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => { if (!front) return; drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture?.(e.pointerId) }
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    if (!d) return
    const s = k(e), dx = (e.clientX - d.x) * s, dy = (e.clientY - d.y) * s
    drag.current = { x: e.clientX, y: e.clientY }
    setPlace((p) => ({ ...p, cx: p.cx + dx, cy: p.cy + dy }))
  }
  const up = () => { drag.current = null }

  const out = async (how: 'share' | 'download') => {
    setBusy(true); setNote('')
    try {
      const c = document.createElement('canvas')
      const blob = drawLineupPost(c, draw) ? await canvasBlob(c) : null
      if (!blob) { setNote('這台裝置做不出圖片，換個瀏覽器試試。'); return }
      const name = `先發陣容_${game?.date ?? new Date().toISOString().slice(0, 10)}${game?.opponent ? `_${game.opponent}` : ''}.png`
      if (how === 'share') { const r = await shareBlob(blob, name); if (r === 'failed') { downloadBlob(blob, name); setNote('這台裝置不能直接分享，已改成下載圖片。') } }
      else { downloadBlob(blob, name); setNote('圖片已下載，到 Instagram 新增貼文選這張圖。') }
    } finally { setBusy(false) }
  }

  const names = rows.map((r) => r.name)
  const brush = useMemo(() => nameFace(rows).brush, [rows, fonts]) // eslint-disable-line react-hooks/exhaustive-deps
  const text = (label: string, value: string, set: (v: string) => void, placeholder?: string) => (
    <label className="flex flex-col gap-1 text-[12px] text-muted">{label}
      <input value={value} maxLength={40} placeholder={placeholder} onChange={(e) => set(e.target.value)}
        className="h-10 rounded-[10px] bg-surface-3/60 border border-transparent px-3 text-[14px] text-ink focus:bg-surface focus:border-[color-mix(in_srgb,var(--ink)_30%,transparent)] focus:outline-none" />
    </label>
  )
  const color = (label: string, key: 'accent' | 'highlight' | 'ink') => (
    <label className="flex flex-col gap-1.5 text-[12px] text-muted">{label}
      <span className="flex items-center gap-2 h-10 px-2 rounded-[10px] border border-border-strong">
        <input type="color" aria-label={label} value={look[key]} onChange={(e) => setLook((l) => ({ ...l, [key]: e.target.value }))} className="size-7 rounded cursor-pointer bg-transparent" />
        <span className="tnum text-ink-2 text-[12px] uppercase">{look[key]}</span>
      </span>
    </label>
  )

  return (
    <Sheet open={open} onClose={onClose} ariaLabel="先發陣容 IG 貼文" side="bottom" desktopFrom="sm" panelClassName="sm:max-w-5xl max-h-[94vh]">
      <div className="p-5 flex flex-col gap-4">
        <div>
          <div className="text-[16px] font-semibold text-ink">先發陣容 IG 貼文</div>
          <p className="text-[13px] text-ink-2 mt-1">依現在排好的打序和守位，做一張 Instagram 貼文尺寸（1080 × 1350）的 STARTING LINEUP 圖。</p>
        </div>
        {!rows.length ? <p className="text-[13px] text-muted py-6 text-center">打序還沒排：先在「打序」排好再來做貼文。</p> : (
          <div className="flex flex-col sm:flex-row gap-5">
            <div className="shrink-0 self-center sm:self-start flex flex-col items-center gap-2 sm:sticky sm:top-0">
              <canvas ref={canvas} width={POST_W} height={POST_H} role="img" aria-label={`先發陣容貼文預覽：${names.join('、')}`}
                onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                className="w-[260px] sm:w-[340px] aspect-[4/5] rounded-[12px] shadow-[var(--shadow-card)] select-none" style={{ touchAction: front ? 'none' : 'auto', cursor: front ? 'grab' : 'default' }} />
              <p className="text-[11.5px] text-muted text-center max-w-[340px]">{front ? '拖曳預覽圖可以移動照片。' : '左邊可以放一張球員照片（選填）。'}</p>
            </div>
            <div className="min-w-0 flex-1 flex flex-col gap-4">
              <section className="flex flex-col gap-2.5 rounded-[12px] border border-border p-3">
                <div className="text-[13px] font-semibold text-ink">球員照片</div>
                <input ref={photoFile} type="file" accept="image/*" className="sr-only" aria-label="選球員照片" onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = '' }} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" icon={<ImagePlus />} onClick={() => photoFile.current?.click()}>{photo ? '換一張' : '選照片'}</Button>
                  {photo && <Button size="sm" variant="ghost" icon={<Crosshair />} onClick={() => setPlace(DEFAULT_POST_PHOTO)}>位置還原</Button>}
                  {photo && <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => { cutRun.current++; setCutting(null); setRefining(false); setPhoto(null) }}>拿掉</Button>}
                </div>
                {photo && canCutout() && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-3">
                      {!photo.cut && <Button size="sm" variant="primary" icon={<Wand2 />} disabled={!!cutting} onClick={() => void cut()}>{cutting ? '去背中…' : '自動去背'}</Button>}
                      {photo.cut && <label className="inline-flex items-center gap-2 text-[13px] text-ink cursor-pointer"><input type="checkbox" checked={photo.useCut} onChange={(e) => setPhoto({ ...photo, useCut: e.target.checked })} className="size-4 accent-[var(--accent)]" />使用去背</label>}
                      {photo.cut && photo.mask && !refining && <Button size="sm" variant="outline" onClick={() => setRefining(true)}>手動修邊</Button>}
                    </div>
                    {refining && photo.mask && (
                      <CutoutRefine photo={photo.photo} mask={photo.mask} onCancel={() => setRefining(false)}
                        onDone={(m) => { const c = cutWith(photo.photo, m); setRefining(false); if (!c) { setNote('整張都擦掉了：用「補回」塗回來。'); return } setPhoto({ ...photo, mask: m, cut: c, useCut: true }); setNote('修邊完成。') }} />
                    )}
                    <p className="text-[11.5px] text-muted" role="status">{cuttingText || '在這台裝置上計算，照片不會上傳。'}</p>
                  </div>
                )}
                {photo && (
                  <label className="flex items-center gap-2 text-[12px] text-muted"><span className="w-8 shrink-0">大小</span>
                    <input type="range" min={360} max={1300} step={5} value={place.h} aria-label="照片大小" onChange={(e) => setPlace((p) => ({ ...p, h: Number(e.target.value) }))} className="flex-1 min-w-0 accent-[var(--accent)]" />
                  </label>
                )}
                <Select label="照片裡的球員（紅字）" aria-label="照片裡的球員" value={highlight} onChange={(e) => setHighlight(e.target.value)} options={[{ value: '', label: '不標' }, ...names.map((n) => ({ value: n, label: n }))]} />
              </section>
              <section className="flex flex-col gap-2.5 rounded-[12px] border border-border p-3">
                <div className="text-[13px] font-semibold text-ink">文字</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {text('標題', look.title, (v) => setLook((l) => ({ ...l, title: v })))}
                  {text('隊名', look.team, (v) => setLook((l) => ({ ...l, team: v })))}
                  {text('日期時間', date ?? autoDate, setDate, 'SUN, 10/18/2026 | 3:00 PM')}
                  {text('場地', venue ?? autoVenue, setVenue, '@NTU BASEBALL FIELD')}
                </div>
                {!brush && <p className="text-[11.5px] text-muted">有名字用到毛筆字型沒有的字，所以全部的中文改用明體（同一張只用一種中文字型）。</p>}
              </section>
              <section className="flex flex-col gap-2.5 rounded-[12px] border border-border p-3">
                <div className="text-[13px] font-semibold text-ink">隊徽與顏色</div>
                <input ref={logoFile} type="file" accept="image/*" className="sr-only" aria-label="選對手隊徽" onChange={(e) => { void pickLogo(e.target.files?.[0]); e.target.value = '' }} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" icon={<ImagePlus />} onClick={() => logoFile.current?.click()}>{oppLogo ? '換對手隊徽' : '選對手隊徽'}</Button>
                  {oppLogo && <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setOppLogo(null)}>拿掉</Button>}
                  <span className="text-[11.5px] text-muted">{oppLogo ? '' : `沒有隊徽時寫「${game?.opponent || '對手'}」`}</span>
                </div>
                <div className="grid grid-cols-3 gap-2.5">{color('主色', 'accent')}{color('強調（照片球員）', 'highlight')}{color('文字', 'ink')}</div>
                <Button size="sm" variant="ghost" icon={<RotateCcw />} className="self-start" onClick={() => { setLook(defaultLook(TEAM.short)); setDate(null); setVenue(null) }}>文字和顏色還原</Button>
              </section>
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                {shareable && <Button variant="primary" icon={<Share2 />} disabled={busy} onClick={() => void out('share')}>分享</Button>}
                <Button variant={shareable ? 'outline' : 'primary'} icon={<Download />} disabled={busy} onClick={() => void out('download')}>下載圖片</Button>
                <Button variant="ghost" onClick={onClose}>關閉</Button>
              </div>
              <p className="text-[12px] text-ink-2" role="status">{note || (shareable ? '按「分享」後選 Instagram → 貼文。' : '下載後傳到手機，在 Instagram 新增貼文時選這張圖。')}</p>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}
