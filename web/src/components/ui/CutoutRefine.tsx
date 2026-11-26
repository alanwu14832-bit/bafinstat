import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Eraser, Paintbrush, Undo2 } from 'lucide-react'
import { Button } from './Button'
import { cx } from '../../lib/format'

type Photo = CanvasImageSource & { width: number; height: number }

/**
 * 手動修邊 after 自動去背: the cut-out over a checkerboard, painted with 擦掉 (take away what the model left of the
 * background) or 補回 (bring back a bit of the player, his bat or glove that it took away), one brush size, 復原 for the
 * last strokes. It paints on a copy of the mask; 完成 hands the new mask back (the photo is cut again with it).
 */
export function CutoutRefine({ photo, mask, onDone, onCancel }: { photo: Photo; mask: HTMLCanvasElement; onDone: (mask: HTMLCanvasElement) => void; onCancel: () => void }) {
  const view = useRef<HTMLCanvasElement>(null)
  const work = useRef<HTMLCanvasElement | null>(null)
  const undo = useRef<ImageData[]>([])
  const last = useRef<{ x: number; y: number } | null>(null)
  const [mode, setMode] = useState<'erase' | 'restore'>('erase')
  const [size, setSize] = useState(0.04)
  const [steps, setSteps] = useState(0)
  const [dark, setDark] = useState(false)

  // the mask being painted (a copy: 取消 leaves the old one as it was)
  if (!work.current) {
    const c = document.createElement('canvas'); c.width = mask.width; c.height = mask.height
    c.getContext('2d')?.drawImage(mask, 0, 0)
    work.current = c
  }
  const W = mask.width, H = mask.height
  // shown within 360 × 520 (a phone's width), its own shape kept
  const shownW = Math.max(60, Math.min(360, Math.round(520 * (W / H))))
  const shownH = Math.round(shownW * (H / W))

  const draw = () => {
    const v = view.current, m = work.current
    const g = v?.getContext('2d')
    if (!v || !m || !g) return
    v.width = shownW; v.height = shownH
    // the checkerboard (or a dark ground) shows what is transparent
    if (dark) { g.fillStyle = '#1b1c1f'; g.fillRect(0, 0, shownW, shownH) }
    else { for (let y = 0; y < shownH; y += 12) for (let x = 0; x < shownW; x += 12) { g.fillStyle = ((x + y) / 12) % 2 ? '#d9d9de' : '#f4f4f6'; g.fillRect(x, y, 12, 12) } }
    const t = document.createElement('canvas'); t.width = shownW; t.height = shownH
    const tg = t.getContext('2d')
    if (!tg) return
    tg.drawImage(photo, 0, 0, shownW, shownH)
    tg.globalCompositeOperation = 'destination-in'
    tg.drawImage(m, 0, 0, shownW, shownH)
    // the part taken away, faint, so 補回 can see where the player was
    g.save(); g.globalAlpha = 0.18; g.drawImage(photo, 0, 0, shownW, shownH); g.restore()
    g.drawImage(t, 0, 0)
  }
  useEffect(draw)

  const toMask = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / (r.width || 1)) * W, y: ((e.clientY - r.top) / (r.height || 1)) * H }
  }
  const paint = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const g = work.current?.getContext('2d')
    if (!g) return
    const rad = Math.max(2, size * Math.max(W, H))
    g.save()
    g.globalCompositeOperation = mode === 'erase' ? 'destination-out' : 'source-over'
    g.strokeStyle = g.fillStyle = '#ffffff'; g.lineCap = 'round'; g.lineWidth = rad * 2
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke()
    g.beginPath(); g.arc(b.x, b.y, rad, 0, Math.PI * 2); g.fill()
    g.restore()
    draw()
  }
  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const g = work.current?.getContext('2d')
    if (!g) return
    undo.current = [...undo.current.slice(-9), g.getImageData(0, 0, W, H)]
    setSteps(undo.current.length)
    const p = toMask(e); last.current = p; paint(p, p)
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => { if (!last.current) return; const p = toMask(e); paint(last.current, p); last.current = p }
  const up = () => { last.current = null }
  const back = () => {
    const prev = undo.current.pop()
    if (prev) work.current?.getContext('2d')?.putImageData(prev, 0, 0)
    setSteps(undo.current.length); draw()
  }

  const tool = (on: boolean) => cx('inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-[13px] cursor-pointer pointer-fine:h-8', on ? 'bg-ink text-bg border-ink' : 'border-border-strong text-ink-2 hover:text-ink')
  return (
    <div className="flex flex-col gap-2.5 rounded-[12px] border border-border bg-surface-2/50 p-3" role="group" aria-label="手動修邊">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" aria-pressed={mode === 'erase'} onClick={() => setMode('erase')} className={tool(mode === 'erase')}><Eraser className="size-4" />擦掉</button>
        <button type="button" aria-pressed={mode === 'restore'} onClick={() => setMode('restore')} className={tool(mode === 'restore')}><Paintbrush className="size-4" />補回</button>
        <Button size="sm" variant="ghost" icon={<Undo2 />} disabled={!steps} onClick={back}>復原</Button>
        <label className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-ink-2 cursor-pointer"><input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} className="size-4 accent-[var(--accent)]" />深色底</label>
      </div>
      <label className="flex items-center gap-2 text-[12px] text-muted"><span className="w-8 shrink-0">筆刷</span>
        <input type="range" min={0.01} max={0.1} step={0.005} value={size} aria-label="筆刷大小" onChange={(e) => setSize(Number(e.target.value))} className="flex-1 min-w-0 accent-[var(--accent)]" />
      </label>
      <canvas ref={view} width={shownW} height={shownH} role="img" aria-label="去背結果，可以在上面擦掉或補回"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        className="self-center rounded-[8px] border border-border max-w-full select-none" style={{ touchAction: 'none', cursor: 'crosshair', width: shownW, height: shownH }} />
      <p className="text-[11.5px] text-muted">「擦掉」把留下來的背景塗掉；「補回」把被去掉的人、衣服、球棒塗回來（淡淡的地方是原本的照片）。</p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>取消</Button>
        <Button size="sm" variant="primary" onClick={() => work.current && onDone(work.current)}>完成修邊</Button>
      </div>
    </div>
  )
}
