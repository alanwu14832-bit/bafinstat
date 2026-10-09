import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { ArrowLeft, Printer } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../ui/Button'
import { useFilterUrlSync } from '../layout/FilterChips'

export interface PrintLayoutProps {
  /** A4 landscape (記分表) or portrait (成績表、陣容卡) */
  orientation: 'landscape' | 'portrait'
  /** where 「← 返回」 goes when the print page was opened directly (no page before it) */
  back: string
  /** per-layout options (Tabs, checkboxes) */
  options?: ReactNode
  /** the tab title while this page is open (also the default file name of 存成 PDF) */
  title?: string
  /** one or more .paper sheets */
  children: ReactNode
}

/** The print page's frame: a screen-only toolbar (返回、列印／存成 PDF、options), the page size for the printer, and the
 *  paper scaled down to the screen width (zoom, reset to 1 by print.css when printing). */
export function PrintLayout({ orientation, back, options, title, children }: PrintLayoutProps) {
  // a link with filters (?cup=…) prints that scope, even without the site's shell around it
  useFilterUrlSync()
  const navigate = useNavigate()
  const location = useLocation()
  const stage = useRef<HTMLDivElement>(null)
  const goBack = () => {
    // opened from a page of the site: go back to it; opened from a shared link: go to the page it prints from
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1); else navigate(back)
  }
  // fit the fixed-size sheets into the screen width (a phone sees the whole page; printing resets the zoom)
  useLayoutEffect(() => {
    const el = stage.current
    if (!el) return
    const fit = () => {
      const avail = el.clientWidth - 32
      for (const paper of el.querySelectorAll<HTMLElement>('.paper')) {
        paper.style.zoom = ''
        const w = paper.offsetWidth
        if (w > 0 && avail > 0 && w > avail) paper.style.zoom = String(Math.max(0.2, avail / w))
      }
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [children, location.search])
  useEffect(() => {
    if (!title) return
    const before = document.title
    document.title = title
    return () => { document.title = before }
  }, [title])
  return (
    <div className="print-stage" ref={stage}>
      {/* the page size and margins of the printout (a <style> element is allowed by the CSP; no script) */}
      <style>{`@page { size: A4 ${orientation}; margin: 8mm }`}</style>
      <div className="print-toolbar print:hidden flex flex-col gap-2 rounded-[var(--radius)] bg-surface text-ink shadow-[var(--shadow-card)] px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" icon={<ArrowLeft />} onClick={goBack}>返回</Button>
          <Button variant="primary" size="sm" icon={<Printer />} onClick={() => window.print()}>列印／存成 PDF</Button>
          {options && <div className="flex items-center gap-2 flex-wrap">{options}</div>}
        </div>
        <p className="text-[12px] text-muted leading-5">列印視窗裡選『另存為 PDF』就能存檔；{orientation === 'landscape' ? '手機若印成直的，請在列印設定選『橫向』' : '這張是直的 A4，列印設定請選『直向』'}。在 LINE 裡打開時，請先選『用瀏覽器開啟』。</p>
      </div>
      {children}
    </div>
  )
}
