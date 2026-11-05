import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { ARCHIVE } from '../../config/archive'
import { LEVEL_LABEL, ROLE_LABEL, useAccess, type Level } from '../../hooks/useAccess'
import { AuthDialog } from '../ui/AuthDialog'
import { HeroGlow } from '../ui/HeroGlow'
import { Reveal } from '../motion/Reveal'

/** A page for `level` and up: anyone below sees why, and (signed out) a way to sign in. */
export function RequireLevel({ level, title, children }: { level: Level; title?: string; children: ReactNode }) {
  const access = useAccess()
  if (access.pending) return <div aria-busy="true" className="min-h-[40vh]" />
  if (access.level >= level) return <>{children}</>
  return <GateNotice level={level} title={title} />
}

export function GateNotice({ level, title }: { level: Level; title?: string }) {
  const access = useAccess()
  const [open, setOpen] = useState(false)
  const signedIn = !!access.role
  const head = signedIn ? `這一頁要${LEVEL_LABEL[level]}以上的帳號` : level === 1 ? '登入後就看得到這一頁' : `這一頁要${LEVEL_LABEL[level]}登入`
  const text = ARCHIVE
    ? '這是以前的網站版本，不能登入：請到正式網站登入後再看。'
    : signedIn
      ? `你的帳號是${ROLE_LABEL[access.role!]}。需要更多權限的話，請管理者在「帳號管理」幫你調整身分。`
      : level === 1
        ? '打擊、投球、守備、球員等完整數據是球隊內部看的：球員、紀錄員用自己的帳號登入就能看。比賽、即時比分和紀錄簿不用登入。'
        : '請用紀錄員或管理者的帳號登入。'
  return (
    <section aria-label={title ?? head} className="relative overflow-hidden rounded-[var(--radius)] bg-surface shadow-[var(--shadow-card)] p-6 md:p-9">
      <HeroGlow size="sm" />
      <Reveal className="relative flex flex-col gap-4 max-w-xl">
        <span className="inline-flex items-center justify-center size-11 rounded-full bg-accent-soft text-accent"><Lock className="size-5" /></span>
        <div>
          {title && <div className="text-[12px] text-muted tracking-[0.08em]">{title}</div>}
          <h2 className="mt-1 text-[22px] md:text-[28px] leading-tight text-ink">{head}</h2>
          <p className="mt-2 text-[14px] text-ink-2 leading-relaxed">{text}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!signedIn && !ARCHIVE && (
            <button type="button" onClick={() => setOpen(true)} className="press inline-flex items-center h-10 px-5 rounded-full bg-accent text-accent-ink text-[14px] font-semibold hover:brightness-105 transition-[filter] cursor-pointer">登入</button>
          )}
          <Link to="/games" className="press inline-flex items-center h-10 px-5 rounded-full bg-surface-2 text-ink text-[14px] font-medium hover:bg-surface-3 transition-colors">看比賽</Link>
          <Link to="/live" className="press inline-flex items-center h-10 px-5 rounded-full bg-surface-2 text-ink text-[14px] font-medium hover:bg-surface-3 transition-colors">即時比分</Link>
        </div>
      </Reveal>
      <AuthDialog open={open} onClose={() => setOpen(false)} title="登入" />
    </section>
  )
}

/** Under the public 總覽: what the team's accounts see, and a way in. */
export function MembersTeaser() {
  const [open, setOpen] = useState(false)
  if (ARCHIVE) return null
  return (
    <section aria-label="登入看完整數據" className="relative overflow-hidden rounded-[var(--radius)] bg-surface shadow-[var(--shadow-card)] p-5 md:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
      <span className="inline-flex items-center justify-center size-10 rounded-full bg-accent-soft text-accent shrink-0"><Lock className="size-[18px]" /></span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold text-ink">球員與紀錄員登入後看完整數據</div>
        <p className="text-[13px] text-ink-2 mt-0.5 leading-relaxed">打擊、投球、守備排行，球員個人頁、走勢圖與落點分佈。帳號由球隊管理者開通。</p>
      </div>
      <button type="button" onClick={() => setOpen(true)} className="press shrink-0 inline-flex items-center justify-center h-10 px-5 rounded-full bg-accent text-accent-ink text-[14px] font-semibold hover:brightness-110 transition-[filter] cursor-pointer">登入</button>
      <AuthDialog open={open} onClose={() => setOpen(false)} title="登入" />
    </section>
  )
}
