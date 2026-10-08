import { useEffect, useState } from 'react'
import { Zap } from 'lucide-react'
import { Card } from './Card'
import { Button } from './Button'
import { Badge } from './Badge'
import { Input } from './Input'
import { Select } from './Select'
import { fetchQuickLogin, saveQuickLogin, type QuickLoginStatus } from '../../data/supabase'
import { useDataStore } from '../../store/data'

const DAYS = [1, 7, 30, 90]

/**
 * 快速登入 settings: the shared password that makes a device a recorder for some days (登入框 → 快速登入). Only for
 * recorders signed in with their own account; the database enforces the same (supabase/migrations/2026-10-10_quick_login.sql).
 */
export function QuickLoginSettings() {
  const cloud = useDataStore((s) => s.cloud)
  const own = cloud.configured && !!cloud.user && cloud.isEditor && !cloud.user.is_anonymous
  const [status, setStatus] = useState<QuickLoginStatus | null | undefined>(undefined)
  const [code, setCode] = useState('')
  const [days, setDays] = useState(30)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const load = () => fetchQuickLogin().then((s) => { setStatus(s); if (s) setDays(s.days) }, (e) => { setStatus(undefined); setMsg(e instanceof Error ? e.message : String(e)) })
  useEffect(() => { if (own) void load() }, [own])
  if (!own) return null

  const save = async (next: string) => {
    if (next && next.trim().length < 6) { setMsg('快速登入密碼至少要 6 個字'); return }
    const sure = status?.active ? `目前有 ${status.active} 個裝置用快速登入，${next ? '換密碼' : '關閉'}後它們都會被登出。確定嗎？` : null
    if (sure && !window.confirm(sure)) return
    setBusy(true); setMsg(null)
    try {
      await saveQuickLogin(next, days)
      setCode('')
      setMsg(next ? `已設定。把這組密碼告訴要紀錄的人：登入框選「快速登入」輸入它，那台裝置就能紀錄 ${days} 天。` : '已關閉快速登入，用快速登入的裝置都已登出。')
      await load()
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  return (
    <Card title="快速登入" subtitle="一組共用密碼，輸入就能紀錄，不用帳號"
      action={status ? <Badge variant={status.enabled ? 'good' : 'neutral'}>{status.enabled ? '開啟中' : '關閉'}</Badge> : undefined}>
      <div className="flex flex-col gap-3 text-[13px]">
        {status === null ? (
          <p className="text-ink-2 leading-relaxed">資料庫還沒有快速登入。請管理員在 Supabase 的 SQL Editor 執行 <span className="font-mono text-[12px]">supabase/migrations/2026-10-10_quick_login.sql</span>，並到 Authentication → Sign In / Providers 打開「Allow anonymous sign-ins」。</p>
        ) : status === undefined ? (
          <p className="text-muted">讀取中…</p>
        ) : (
          <>
            <p className="text-ink-2 leading-relaxed">
              {status.enabled
                ? <>知道密碼的人在登入框選「快速登入」輸入它，那台裝置就能紀錄、修改比賽 {status.days} 天（不能管理紀錄員名單和這個設定）。目前 <span className="font-medium text-ink tnum">{status.active}</span> 個裝置用快速登入。</>
                : '設一組密碼後，知道它的人不用帳號也能紀錄、修改比賽。'}
              {status.updated_at && <span className="text-muted">（{status.updated_by ?? '紀錄員'} 於 {new Date(status.updated_at).toLocaleDateString('zh-TW')} 設定）</span>}
            </p>
            {status.locked_until && <p role="alert" className="text-[12px] text-critical">有人輸錯太多次，快速登入暫停到 {new Date(status.locked_until).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}；重新設定密碼會解除。</p>}
            <div className="flex flex-col sm:flex-row gap-2">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={status.enabled ? '新的快速登入密碼（至少 6 個字）' : '快速登入密碼（至少 6 個字）'} aria-label="快速登入密碼" autoComplete="off" spellCheck={false} className="w-full sm:flex-1" />
              <Select aria-label="有效天數" value={String(days)} onChange={(e) => setDays(Number(e.target.value))} options={DAYS.map((d) => ({ value: String(d), label: `有效 ${d} 天` }))} />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="primary" icon={<Zap />} disabled={busy || !code.trim()} onClick={() => void save(code)}>{status.enabled ? '換成這組密碼' : '開啟快速登入'}</Button>
              {status.enabled && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save('')}>關閉快速登入</Button>}
            </div>
            <p className="text-[12px] text-muted leading-relaxed">密碼越簡單越容易被猜到：系統只允許每小時錯 10 次，錯滿就暫停一小時。換密碼或關閉時，所有用快速登入的裝置都會被登出；密碼外流時請馬上換一組。</p>
          </>
        )}
        {msg && <div role="status" className="text-xs text-ink-2">{msg}</div>}
      </div>
    </Card>
  )
}
