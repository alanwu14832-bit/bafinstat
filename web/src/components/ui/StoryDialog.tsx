import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Crosshair, Download, ImagePlus, RotateCcw, Share2, Trash2, Wand2 } from 'lucide-react'
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
import {
  canShareFile, canvasBlob, DATA_LAYOUTS, DEFAULT_TITLE, DEFAULT_VIEW, defaultFg, defaultStyle, downloadBlob, drawStory, FG_COUNT, FG_SCALE_MAX, FG_SCALE_MIN,
  cardFace, CJK_LABEL, fgIndex, fgTarget, hitTest, LATIN_LABEL, isTemplate, layersFor, LAYOUT_LABEL, layoutLook, loadImage, loadPhoto, palettes, panView, photoFrame, readStyle,
  SCALE_MAX, SCALE_MIN, shareBlob, STORY_H, STORY_W, TEMPLATE_LAYOUTS, TITLE_MAX,
  type CjkFont, type FgStyle, type LatinFont, type LayerKey, type PhotoView, type StoryBoxes, type StoryLayout, type StoryStyle, type StoryTarget, type TextStyle,
} from '../../lib/storyImage'
import { loadStoryFonts } from '../../lib/storyFonts'
import { cx } from '../../lib/format'
import { canCutout, removeBackground, type CutoutProgress } from '../../lib/cutout'

const KINDS: StoryKind[] = ['game-bat', 'game-pit', 'season-bat', 'season-pit']
const HEADLINE_MAX = 44
/** the reader's look for the card, kept on this device (never the photos) */
const STYLE_KEY = 'bafin.story.style.v1'
const STAT_MAX = 40
type Photo = Awaited<ReturnType<typeof loadPhoto>>
/** a front-photo slot: the picked photo, its cut-out (自動去背) and whether the cut-out is used */
type Front = { photo: Photo; cut: HTMLCanvasElement | null; useCut: boolean }
type Panel = 'content' | 'photo' | 'text' | 'color'
const PANELS: Array<{ value: Panel; label: string }> = [{ value: 'content', label: '內容' }, { value: 'photo', label: '照片' }, { value: 'text', label: '文字' }, { value: 'color', label: '配色' }]
const EMPTY: Array<Front | null> = Array.from({ length: FG_COUNT }, () => null)

function loadStyle(): StoryStyle {
  try { const raw = localStorage.getItem(STYLE_KEY); return raw ? readStyle(JSON.parse(raw)) : defaultStyle() } catch { return defaultStyle() }
}

export interface StoryDialogProps {
  open: boolean
  onClose: () => void
  /** 球員頁: this player, any of his games. */
  player?: string
  /** 比賽頁: this game, any of our players in it. */
  gameId?: string
}

/**
 * 限時動態: pick a card (單場打擊／單場投球／本季), then lay it out like a small design desk — a layout, a background
 * photo and a front photo, every block of text sized, coloured and moved, the colours — and share the 1080 × 1920
 * image (the phone's share sheet has Instagram → 限時動態) or download it. Nothing is uploaded: the photos are only drawn here.
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
  const [customLine, setCustomLine] = useState<{ id: string; text: string } | null>(null)
  const line = customLine?.id === id ? customLine.text : base?.statLine ?? ''
  const card = useMemo(() => (base ? { ...base, headline, statLine: line } : null), [base, headline, line])

  const [style, setStyle] = useState<StoryStyle>(loadStyle)
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [view, setView] = useState<PhotoView>(DEFAULT_VIEW)
  // the front photos by slot (up to three: 連續動作), the slot being edited, and the 自動去背 run in progress
  const [fronts, setFronts] = useState<Array<Front | null>>(EMPTY)
  const [slot, setSlot] = useState(0)
  const [cutting, setCutting] = useState<{ slot: number; p: CutoutProgress } | null>(null)
  const [cutNote, setCutNote] = useState<{ slot: number; text: string } | null>(null)
  const cutRun = useRef(0)
  const [mark, setMark] = useState<HTMLImageElement | null>(null)
  const [panel, setPanel] = useState<Panel>('content')
  const [selected, setSelected] = useState<StoryTarget | null>(null)
  const [layer, setLayer] = useState<LayerKey>('headline')
  const [fonts, setFonts] = useState(0)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const bgFile = useRef<HTMLInputElement>(null)
  const fgFile = useRef<HTMLInputElement>(null)
  const boxes = useRef<StoryBoxes>({})
  const drag = useRef<{ x: number; y: number; target: StoryTarget | 'bg' } | null>(null)
  const shareable = useMemo(() => canShareFile(), [])
  const frame = photoFrame(style.layout)
  const template = isTemplate(style.layout)

  useEffect(() => { try { localStorage.setItem(STYLE_KEY, JSON.stringify(style)) } catch { /* private mode: the look is only kept while the dialog is open */ } }, [style])
  useEffect(() => {
    if (!open) return
    let live = true
    loadImage(teamAsset(TEAM.mark)).then((img) => { if (live) setMark(img) }).catch(() => undefined)
    // the typefaces may not have been used on this page yet: draw again once they are there
    const fs = (document as Document & { fonts?: FontFaceSet }).fonts
    if (fs?.load) Promise.all([fs.load('800 136px "Barlow Semi Condensed"'), fs.load('700 44px "Barlow Semi Condensed"'), fs.load('700 60px "Noto Serif TC"')]).then(() => { if (live) setFonts((n) => n + 1) }).catch(() => undefined)
    return () => { live = false }
  }, [open])
  // the poster templates' faces (and the name's characters in them)
  useEffect(() => {
    if (!open || !name) return
    let live = true
    void loadStoryFonts(name).then(() => { if (live) setFonts((n) => n + 1) })
    return () => { live = false }
  }, [open, name])
  const fgPhotos = useMemo(() => fronts.map((f) => (f ? (f.cut && f.useCut ? f.cut : f.photo) : null)), [fronts])
  const drawOpts = useMemo(() => ({ photo, view, fgs: fgPhotos, mark, style }), [photo, view, fgPhotos, mark, style])
  useEffect(() => {
    if (!open || !card || !canvas.current) return
    boxes.current = drawStory(canvas.current, card, { ...drawOpts, guides: true, selected }) ?? {}
  }, [open, card, drawOpts, selected, fonts])

  const setText = (key: LayerKey, patch: Partial<TextStyle>) => setStyle((st) => ({ ...st, text: { ...st.text, [key]: { ...st.text[key], ...patch } } }))
  const setFgStyle = (i: number, patch: Partial<FgStyle>) => setStyle((st) => ({ ...st, fgs: st.fgs.map((f, k) => (k === i ? { ...f, ...patch } : f)) }))
  const setFront = (i: number, f: Front | null) => setFronts((all) => all.map((x, k) => (k === i ? f : x)))
  /** a layout brings its own treatment of the photo and puts the front photos where it wants them */
  const chooseLayout = (l: StoryLayout) => setStyle((st) => ({ ...st, layout: l, ...layoutLook(l), fonts: { latin: '', cjk: '' }, fgs: st.fgs.map((f, i) => ({ ...defaultFg(l, i), frame: f.frame, shadow: f.shadow })) }))
  const pick = async (which: 'bg' | number, f?: File) => {
    if (!f) return
    setNote('')
    try {
      const p = await loadPhoto(f)
      if (which === 'bg') { setPhoto(p); setView(DEFAULT_VIEW); if (style.layout === 'plain') chooseLayout('full') }
      else { cutRun.current++; setCutting(null); setCutNote(null); setFront(which, { photo: p, cut: null, useCut: true }); setSlot(which); setSelected(fgTarget(which)) }
    } catch { setNote('這張照片讀不出來，換一張試試（建議 JPG 或 PNG）。') }
  }

  // ---- the preview is the desk: tap a block to pick it, drag to move it; dragging elsewhere moves the background photo
  const at = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), k = STORY_W / (r.width || STORY_W)
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, k }
  }
  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = at(e)
    const hit = hitTest(boxes.current, p.x, p.y)
    const target = hit ?? (photo && frame ? 'bg' : null)
    if (hit) { setSelected(hit); const i = fgIndex(hit); if (i >= 0) { setSlot(i); setPanel('photo') } else { setLayer(hit as LayerKey); setPanel('text') } }
    else setSelected(null)
    if (!target) return
    drag.current = { x: e.clientX, y: e.clientY, target }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    if (!d) return
    const { k } = at(e)
    const dx = (e.clientX - d.x) * k, dy = (e.clientY - d.y) * k
    drag.current = { ...d, x: e.clientX, y: e.clientY }
    const fi = d.target === 'bg' ? -1 : fgIndex(d.target)
    if (d.target === 'bg') { if (photo && frame) setView((v) => panView(v, dx, dy, photo.width, photo.height, frame.h, frame.w)) }
    else if (fi >= 0) setStyle((st) => ({ ...st, fgs: st.fgs.map((f, k) => (k === fi ? { ...f, cx: f.cx + dx, cy: f.cy + dy } : f)) }))
    else { const key = d.target as LayerKey; setStyle((st) => ({ ...st, text: { ...st.text, [key]: { ...st.text[key], dx: st.text[key].dx + dx, dy: st.text[key].dy + dy } } })) }
  }
  const up = () => { drag.current = null }

  const out = async (how: 'share' | 'download') => {
    if (!card) return
    setBusy(true); setNote('')
    try {
      // the shared image is drawn again without the editing aids
      const c = document.createElement('canvas')
      const blob = drawStory(c, card, drawOpts) ? await canvasBlob(c) : null
      if (!blob) { setNote('這台裝置做不出圖片，換個瀏覽器試試。'); return }
      const fileName = storyFileName(card, list.find((g) => g.id === gid)?.date)
      if (how === 'share') {
        const r = await shareBlob(blob, fileName)
        if (r === 'failed') { downloadBlob(blob, fileName); setNote('這台裝置不能直接分享，已改成下載圖片。') }
      } else { downloadBlob(blob, fileName); setNote('圖片已下載。到 Instagram 新增限時動態，選這張圖。') }
    } finally { setBusy(false) }
  }

  const cut = async (i: number) => {
    const f = fronts[i]
    if (!f || cutting) return
    const run = ++cutRun.current
    setCutNote(null); setCutting({ slot: i, p: { stage: 'prepare' } })
    try {
      const c = await removeBackground(f.photo, (p) => { if (cutRun.current === run) setCutting({ slot: i, p }) })
      if (cutRun.current !== run) return
      setFronts((all) => all.map((x, k) => (k === i && x ? { ...x, cut: c, useCut: true } : x)))
      setCutNote({ slot: i, text: '去背完成。不滿意可以取消勾選「使用去背」換回原圖。' })
    } catch (e) {
      if (cutRun.current === run) setCutNote({ slot: i, text: `去背沒有成功：${e instanceof Error ? e.message : '不明原因'}。可以換一張主體清楚的照片再試。` })
    } finally { if (cutRun.current === run) setCutting(null) }
  }
  const cp = cutting?.p
  const cuttingText = !cp ? '' : cp.stage === 'download' ? `下載去背工具 ${cp.total ? Math.round((cp.loaded / cp.total) * 100) : Math.round(cp.loaded / 1e6)}${cp.total ? '%' : ' MB'}（約 55 MB，只有第一次要下載）` : cp.stage === 'prepare' ? '準備去背工具…' : '正在去背，大約要 10～30 秒…'
  const layers = layersFor(style.layout)
  const layerNow: LayerKey = layers.some((l) => l.key === layer) ? layer : layers[0].key
  const front = fronts[slot]
  const fgStyle = style.fgs[slot]
  const filled = fronts.filter(Boolean).length
  // the slots offered: those with a photo, then one empty one to add the next
  const slots = fronts.map((_, i) => i).filter((i) => fronts[i] || i === fronts.findIndex((x) => !x))

  const t = style.text[layerNow]
  // which faces the card ends on (fonts are loaded by now or are redrawn when they arrive: `fonts` keeps this fresh)
  const face = useMemo(() => (card ? cardFace(style, card) : null), [style, card, fonts]) // eslint-disable-line react-hooks/exhaustive-deps
  const swatches = ['', '#ffffff', style.accent, '#1d1d1f', '#f2c14e', '#ff5a4e', '#7fb2ff']
  const hint = fgIndex(selected) >= 0 ? '拖曳移動前景照片' : selected ? '拖曳移動這段文字' : photo && frame ? '點文字或前景照片可以選取；拖曳空白處移動背景照片' : '點文字可以選取、拖曳移動'

  return (
    <Sheet open={open} onClose={onClose} ariaLabel="分享限時動態" side="bottom" desktopFrom="sm" panelClassName="sm:max-w-5xl max-h-[94vh]">
      <div className="p-5 flex flex-col gap-4">
        <div>
          <div className="text-[16px] font-semibold text-ink">分享限時動態</div>
          <p className="text-[13px] text-ink-2 mt-1">做一張 Instagram 限時動態尺寸（1080 × 1920）的成績圖。數字都是網站從紀錄算的，版面、照片、文字和顏色都可以自己調。</p>
        </div>
        {!card ? <p className="text-[13px] text-muted py-6 text-center">{players.length ? '這位球員還沒有可以做成卡片的紀錄。' : '這場比賽還沒有我隊球員的紀錄。'}</p> : (
          <div className="flex flex-col sm:flex-row gap-5">
            <div className="shrink-0 self-center sm:self-start flex flex-col items-center gap-2 sm:sticky sm:top-0">
              <canvas ref={canvas} width={STORY_W} height={STORY_H} role="img" aria-label={`限時動態預覽：${card.name}，${card.headline}`}
                onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                className="w-[230px] sm:w-[320px] aspect-[9/16] rounded-[14px] shadow-[var(--shadow-card)] select-none"
                style={{ background: style.shade, touchAction: 'none', cursor: drag.current ? 'grabbing' : 'grab' }} />
              <p className="text-[11.5px] text-muted text-center max-w-[320px]">{hint}。虛線外是 IG 會蓋住的地方，下載的圖不會有虛線。</p>
            </div>
            <div className="min-w-0 flex-1 flex flex-col gap-3.5">
              <Tabs aria-label="編輯" items={PANELS} value={panel} onChange={setPanel} />

              {panel === 'content' && (
                <div className="flex flex-col gap-3.5">
                  {players.length > 1 && <Select label="球員" aria-label="球員" value={name} onChange={(e) => setName(e.target.value)} options={players.map((n) => ({ value: n, label: n }))} />}
                  {kinds.length > 1 && <Tabs aria-label="卡片種類" size="sm" items={kinds.map((k) => ({ value: k, label: STORY_KIND_LABEL[k] }))} value={kind} onChange={setKind} />}
                  {list.length > 1 && <Select label="比賽" aria-label="比賽" value={gid ?? ''} onChange={(e) => setGame(e.target.value)} options={list.map((g) => ({ value: g.id, label: `${g.date.slice(5).replace('-', '/')} vs ${opponentLabel(g)}` }))} />}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="story-headline" className="text-[12px] text-muted">亮點文字（可以自己改）</label>
                      {custom?.id === id && custom.text !== base?.headline && <button type="button" onClick={() => setCustom(null)} className="inline-flex items-center gap-1 text-[12px] text-ink-2 hover:text-ink cursor-pointer"><RotateCcw className="size-3" />還原</button>}
                    </div>
                    <textarea id="story-headline" rows={2} maxLength={HEADLINE_MAX} value={headline} onChange={(e) => setCustom({ id, text: e.target.value.replace(/\n/g, '') })}
                      className="w-full rounded-[10px] bg-surface-3/60 border border-transparent px-3 py-2 text-[14px] text-ink resize-none focus:bg-surface focus:border-[color-mix(in_srgb,var(--ink)_30%,transparent)] focus:outline-none" />
                    <span className="text-[11.5px] text-muted text-right tnum">{headline.length} / {HEADLINE_MAX}</span>
                  </div>
                  {template && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label htmlFor="story-title" className="text-[12px] text-muted">海報標題（用「/」換行）</label>
                        {style.title !== DEFAULT_TITLE && <button type="button" onClick={() => setStyle((st) => ({ ...st, title: DEFAULT_TITLE }))} className="inline-flex items-center gap-1 text-[12px] text-ink-2 hover:text-ink cursor-pointer"><RotateCcw className="size-3" />還原</button>}
                      </div>
                      <input id="story-title" maxLength={TITLE_MAX} value={style.title} onChange={(e) => setStyle((st) => ({ ...st, title: e.target.value }))}
                        className="w-full h-10 rounded-[10px] bg-surface-3/60 border border-transparent px-3 text-[14px] text-ink focus:bg-surface focus:border-[color-mix(in_srgb,var(--ink)_30%,transparent)] focus:outline-none" />
                    </div>
                  )}
                  {template && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label htmlFor="story-statline" className="text-[12px] text-muted">數據行（可以自己改）</label>
                        {customLine?.id === id && customLine.text !== base?.statLine && <button type="button" onClick={() => setCustomLine(null)} className="inline-flex items-center gap-1 text-[12px] text-ink-2 hover:text-ink cursor-pointer"><RotateCcw className="size-3" />還原</button>}
                      </div>
                      <input id="story-statline" maxLength={STAT_MAX} value={line} onChange={(e) => setCustomLine({ id, text: e.target.value })}
                        className="w-full h-10 rounded-[10px] bg-surface-3/60 border border-transparent px-3 text-[14px] text-ink tnum focus:bg-surface focus:border-[color-mix(in_srgb,var(--ink)_30%,transparent)] focus:outline-none" />
                      <span className="text-[11.5px] text-muted">斜切海報、直排姓名用這一行；左欄數據直接列出各項數字。</span>
                    </div>
                  )}
                </div>
              )}

              {panel === 'photo' && (
                <div className="flex flex-col gap-4">
                  <Field label="數據卡">
                    <div className="flex flex-wrap gap-1.5">
                      {DATA_LAYOUTS.map((l) => <Chip key={l} on={style.layout === l} onClick={() => chooseLayout(l)}>{LAYOUT_LABEL[l]}</Chip>)}
                    </div>
                  </Field>
                  <Field label="海報模板（PLAYER OF THE GAME）">
                    <div className="flex flex-wrap gap-1.5">
                      {TEMPLATE_LAYOUTS.map((l) => <Chip key={l} on={style.layout === l} onClick={() => chooseLayout(l)}>{LAYOUT_LABEL[l]}</Chip>)}
                    </div>
                    {template && <p className="text-[11.5px] text-muted">建議：背景放一張動作照，前景放一到三張照片並按「自動去背」。換版型時，前景照片會回到這個版型的預設位置。</p>}
                  </Field>
                  <Group title="背景照片" note={photo && !frame ? '「純數據」版型不顯示背景照片，換成其他版型就會出現。' : style.layout === 'column' ? '左欄數據把背景照片放在右側的框裡。' : undefined}>
                    <input ref={bgFile} type="file" accept="image/*" className="sr-only" aria-label="選背景照片" onChange={(e) => { void pick('bg', e.target.files?.[0]); e.target.value = '' }} />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" icon={<ImagePlus />} onClick={() => bgFile.current?.click()}>{photo ? '換一張' : '選照片'}</Button>
                      {photo && <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setPhoto(null)}>拿掉</Button>}
                    </div>
                    {photo && <>
                      <Range label="放大" value={view.zoom} min={1} max={3} step={0.01} onChange={(v) => setView((x) => ({ ...x, zoom: v }))} />
                      <Range label="變暗" value={style.dim} min={0} max={0.8} step={0.01} onChange={(v) => setStyle((st) => ({ ...st, dim: v }))} />
                      <Range label="模糊" value={style.blur} min={0} max={20} step={0.5} onChange={(v) => setStyle((st) => ({ ...st, blur: v }))} />
                    </>}
                  </Group>
                  <Group title="前景照片" note="疊在前面，例如去背後的球員；最多三張，可以排成連續動作。">
                    {filled > 0 && (
                      <div className="flex flex-wrap gap-1.5" role="group" aria-label="前景照片">
                        {slots.map((i) => <Chip key={i} on={slot === i} onClick={() => { setSlot(i); if (fronts[i]) setSelected(fgTarget(i)) }}>{fronts[i] ? `前景 ${i + 1}` : '＋ 再加一張'}</Chip>)}
                      </div>
                    )}
                    <input ref={fgFile} type="file" accept="image/*" className="sr-only" aria-label={`選前景照片 ${slot + 1}`} onChange={(e) => { void pick(slot, e.target.files?.[0]); e.target.value = '' }} />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" icon={<ImagePlus />} onClick={() => fgFile.current?.click()}>{front ? '換一張' : '選照片'}</Button>
                      {front && <Button size="sm" variant="ghost" icon={<Crosshair />} onClick={() => { const d = defaultFg(style.layout, slot); setFgStyle(slot, { cx: d.cx, cy: d.cy, scale: d.scale }) }}>位置還原</Button>}
                      {front && <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => { if (cutting?.slot === slot) { cutRun.current++; setCutting(null) } setFront(slot, null); setCutNote(null); setSelected(null) }}>拿掉</Button>}
                    </div>
                    {front && canCutout() && (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex flex-wrap items-center gap-3">
                          {!front.cut && <Button size="sm" variant="primary" icon={<Wand2 />} disabled={!!cutting} onClick={() => void cut(slot)}>{cutting?.slot === slot ? '去背中…' : '自動去背'}</Button>}
                          {front.cut && <Check label="使用去背" checked={front.useCut} onChange={(v) => setFront(slot, { ...front, useCut: v })} />}
                        </div>
                        <p className="text-[11.5px] text-muted" role="status">{(cutting?.slot === slot && cuttingText) || (cutNote?.slot === slot && cutNote.text) || (cutting ? `前景 ${cutting.slot + 1} 正在去背，好了再做這張。` : '在這台裝置上計算，照片不會上傳。第一次要下載約 55 MB 的去背工具（建議用 Wi‑Fi），之後會快很多。')}</p>
                      </div>
                    )}
                    {front && fgStyle && <>
                      <Range label="大小" value={fgStyle.scale} min={FG_SCALE_MIN} max={FG_SCALE_MAX} step={0.01} onChange={(v) => setFgStyle(slot, { scale: v })} />
                      <div className="flex flex-wrap gap-4">
                        <Check label="白框" checked={fgStyle.frame} onChange={(v) => setFgStyle(slot, { frame: v })} />
                        <Check label="陰影" checked={fgStyle.shadow} onChange={(v) => setFgStyle(slot, { shadow: v })} />
                      </div>
                    </>}
                  </Group>
                  <p className="text-[11.5px] text-muted">照片只在這台裝置上用來做圖，不會上傳，也不會存到網站。</p>
                </div>
              )}

              {panel === 'text' && (
                <div className="flex flex-col gap-4">
                  <Group title="整張的字型" note="同一種語言整張只用一種字型：中文一種、英文和數字一種。">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Select label="中文" aria-label="中文字型" value={style.fonts.cjk} onChange={(e) => setStyle((st) => ({ ...st, fonts: { ...st.fonts, cjk: e.target.value as CjkFont } }))} options={(Object.keys(CJK_LABEL) as CjkFont[]).map((f) => ({ value: f, label: CJK_LABEL[f] }))} />
                      <Select label="英文數字" aria-label="英文數字字型" value={style.fonts.latin} onChange={(e) => setStyle((st) => ({ ...st, fonts: { ...st.fonts, latin: e.target.value as LatinFont } }))} options={(Object.keys(LATIN_LABEL) as LatinFont[]).map((f) => ({ value: f, label: LATIN_LABEL[f] }))} />
                    </div>
                    {face?.fellBack && <p className="text-[11.5px] text-muted">這張有毛筆字型沒有的字（例如「堉」），所以整張的中文改用明體。</p>}
                  </Group>
                  <Field label="要調整的文字">
                    <div className="flex flex-wrap gap-1.5">
                      {layers.map((l) => <Chip key={l.key} on={layerNow === l.key} dim={!style.text[l.key].show} onClick={() => { setLayer(l.key); setSelected(l.key) }}>{l.label}</Chip>)}
                    </div>
                  </Field>
                  <Group title={layers.find((l) => l.key === layerNow)!.label}>
                    <Check label="顯示" checked={t.show} onChange={(v) => setText(layerNow, { show: v })} />
                    <Range label="大小" value={t.scale} min={SCALE_MIN} max={SCALE_MAX} step={0.01} onChange={(v) => setText(layerNow, { scale: v })} format={(v) => `${Math.round(v * 100)}%`} />
                    <Field label="顏色">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {swatches.map((c, i) => (
                          <button key={i} type="button" aria-label={c ? `顏色 ${c}` : '預設顏色'} aria-pressed={t.color === c} onClick={() => setText(layerNow, { color: c })}
                            className={cx('size-8 rounded-full border cursor-pointer grid place-items-center text-[10px] text-ink-2', t.color === c ? 'ring-2 ring-offset-2 ring-[var(--accent)] ring-offset-[var(--surface)]' : 'border-border-strong')}
                            style={c ? { background: c } : undefined}>{c ? '' : '預設'}</button>
                        ))}
                        <label className="inline-flex items-center gap-1.5 text-[12px] text-ink-2 ml-1">自選
                          <input type="color" aria-label="自選顏色" value={t.color || style.ink} onChange={(e) => setText(layerNow, { color: e.target.value })} className="size-8 rounded cursor-pointer bg-transparent" />
                        </label>
                      </div>
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="ghost" icon={<Crosshair />} onClick={() => setText(layerNow, { dx: 0, dy: 0 })}>位置還原</Button>
                      <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => setText(layerNow, defaultStyle().text[layerNow])}>這段還原</Button>
                    </div>
                  </Group>
                  <p className="text-[11.5px] text-muted">也可以直接在預覽圖上點文字選取，按住拖曳移動。</p>
                </div>
              )}

              {panel === 'color' && (
                <div className="flex flex-col gap-4">
                  <Field label="配色組合">
                    <div className="flex flex-wrap gap-2">
                      {palettes().map((p) => {
                        const on = style.accent === p.accent && style.ink === p.ink && style.shade === p.shade
                        return (
                          <button key={p.name} type="button" aria-pressed={on} onClick={() => setStyle((st) => ({ ...st, accent: p.accent, ink: p.ink, shade: p.shade }))}
                            className={cx('inline-flex items-center gap-2 h-9 pl-1.5 pr-3 rounded-full border text-[13px] cursor-pointer', on ? 'border-ink text-ink' : 'border-border-strong text-ink-2 hover:text-ink')}>
                            <span className="inline-flex size-6 rounded-full overflow-hidden border border-border-strong" style={{ background: p.shade }}>
                              <span className="m-auto size-3 rounded-full" style={{ background: p.accent }} />
                            </span>{p.name}
                          </button>
                        )
                      })}
                    </div>
                  </Field>
                  <div className="grid grid-cols-3 gap-3">
                    <ColorField label="主色" value={style.accent} onChange={(v) => setStyle((st) => ({ ...st, accent: v }))} />
                    <ColorField label="文字色" value={style.ink} onChange={(v) => setStyle((st) => ({ ...st, ink: v }))} />
                    <ColorField label="底色" value={style.shade} onChange={(v) => setStyle((st) => ({ ...st, shade: v }))} />
                  </div>
                  <p className="text-[11.5px] text-muted">主色用在背號、第一個大數字、比分和線條；底色是照片下方的漸層和沒有照片時的底。單獨一段文字的顏色在「文字」裡改。</p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border mt-1 pt-3">
                {shareable && <Button variant="primary" icon={<Share2 />} disabled={busy} onClick={() => void out('share')}>分享</Button>}
                <Button variant={shareable ? 'outline' : 'primary'} icon={<Download />} disabled={busy} onClick={() => void out('download')}>下載圖片</Button>
                <Button variant="ghost" icon={<RotateCcw />} onClick={() => { setStyle(defaultStyle()); setView(DEFAULT_VIEW); setSelected(null); setCustomLine(null) }}>版面回到預設</Button>
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex flex-col gap-1.5"><span className="text-[12px] text-muted">{label}</span>{children}</div>
}
function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 rounded-[12px] border border-border p-3">
      <div><div className="text-[13px] font-semibold text-ink">{title}</div>{note && <p className="text-[11.5px] text-muted mt-0.5">{note}</p>}</div>
      {children}
    </section>
  )
}
function Chip({ on, dim, onClick, children }: { on: boolean; dim?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cx('h-9 px-3 rounded-full border text-[13px] cursor-pointer pointer-fine:h-8', on ? 'bg-ink text-bg border-ink' : 'border-border-strong text-ink-2 hover:text-ink', dim && 'line-through', dim && !on && 'opacity-60')}>
      {children}
    </button>
  )
}
function Range({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="flex items-center gap-2 text-[12px] text-muted">
      <span className="w-8 shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 min-w-0 accent-[var(--accent)]" />
      {format && <span className="w-11 text-right tnum text-ink-2">{format(value)}</span>}
    </label>
  )
}
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-[13px] text-ink cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--accent)]" />{label}
    </label>
  )
}
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5 text-[12px] text-muted">{label}
      <span className="flex items-center gap-2 h-10 px-2 rounded-[10px] border border-border-strong">
        <input type="color" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="size-7 rounded cursor-pointer bg-transparent" />
        <span className="tnum text-ink-2 text-[12px] uppercase">{value}</span>
      </span>
    </label>
  )
}
