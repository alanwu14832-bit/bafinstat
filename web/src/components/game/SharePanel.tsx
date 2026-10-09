import { useEffect, useRef, useState } from 'react'
import { Copy, Download, Link2, X } from 'lucide-react'
import { Button } from '../ui/Button'

export const COPIED = '已複製，可以貼到 LINE 群組'
export const COPY_BLOCKED = '這個瀏覽器不讓網站自動複製：文字已選取，請長按選「拷貝」'
export const LINK_BLOCKED = '這個瀏覽器不讓網站自動複製：連結已選取（在下面這一格），請長按選「拷貝」'

/**
 * 分享這場比賽: the exact text that will be copied (score, recap, video links, the game page's address), copied in one
 * tap. LINE's in-app browser often blocks the clipboard: the text is then selected for a long-press copy.
 * Shown inline under the game header (the quick view already sits in a Sheet).
 */
export function SharePanel({ text, link, onImage, onClose }: { text: string; link: string; onImage: () => void; onClose: () => void }) {
  const box = useRef<HTMLTextAreaElement>(null)
  const linkBox = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  // the link on its own line, shown when copying the link was blocked (selecting the whole text would copy the report)
  const [showLink, setShowLink] = useState(0)
  useEffect(() => { if (showLink) { linkBox.current?.focus(); linkBox.current?.select() } }, [showLink])
  const copy = async (value: string, what: 'text' | 'link') => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
      await navigator.clipboard.writeText(value)
      setMsg(COPIED)
    } catch {
      if (what === 'link') { setShowLink((n) => n + 1); setMsg(LINK_BLOCKED); return }
      box.current?.focus()
      box.current?.select()
      setMsg(COPY_BLOCKED)
    }
  }
  return (
    <section aria-label="分享這場比賽" className="rounded-[var(--radius)] bg-surface shadow-[var(--shadow-card)] p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[16px] text-ink leading-6">分享這場比賽</h3>
        <Button variant="ghost" size="sm" icon={<X />} onClick={onClose}>收起</Button>
      </div>
      <textarea ref={box} readOnly value={text} rows={Math.min(14, text.split('\n').length + 1)} aria-label="要分享的文字"
        className="w-full rounded-[var(--radius-sm)] border border-border bg-surface-2/50 px-3 py-2 text-[13px] leading-relaxed text-ink resize-y" />
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="primary" size="sm" icon={<Copy />} onClick={() => void copy(text, 'text')}>複製文字</Button>
        <Button variant="outline" size="sm" icon={<Download />} onClick={onImage} title="下載這場的戰報圖（PNG）">下載戰報圖</Button>
        <Button variant="ghost" size="sm" icon={<Link2 />} onClick={() => void copy(link, 'link')}>複製連結</Button>
      </div>
      {showLink > 0 && <input ref={linkBox} readOnly value={link} aria-label="這場比賽的連結" onFocus={(e) => e.currentTarget.select()}
        className="w-full min-h-9 rounded-[var(--radius-sm)] border border-border bg-surface-2/50 px-3 text-[13px] text-ink" />}
      <p role="status" className="text-[12px] text-ink-2 min-h-4">{msg}</p>
    </section>
  )
}
