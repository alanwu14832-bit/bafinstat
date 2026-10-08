import { useState } from 'react'
import { Button } from './Button'
import { Input } from './Input'
import { Tabs } from './Tabs'
import { quickSignIn, signInWithPassword } from '../../data/supabase'
import { useDataStore } from '../../store/data'

type Mode = 'password' | 'quick'
// the way this device signed in last time opens first
const MODE_KEY = 'bafin.login.mode'
const readMode = (): Mode => { try { return localStorage.getItem(MODE_KEY) === 'quick' ? 'quick' : 'password' } catch { return 'password' } }
const keepMode = (m: Mode) => { try { localStorage.setItem(MODE_KEY, m) } catch { /* storage unavailable */ } }

/** Email + password sign-in, or 快速登入 with the shared password. Shared by the cloud panel and the sidebar dialog. */
export function LoginForm({ onDone, autoFocus, intro }: { onDone?: () => void; autoFocus?: boolean; intro?: string }) {
  const [mode, setMode] = useState<Mode>(readMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [quick, setQuick] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const recheckAccess = useDataStore((s) => s.recheckAccess)
  const run = async (fn: () => Promise<void>, ok: string, done = false) => {
    setBusy(true); setMsg(null)
    try { await fn(); setMsg(ok); keepMode(mode); if (done) onDone?.() } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  return (
    <form className="flex flex-col gap-2.5 text-[13px]" onSubmit={(e) => {
      e.preventDefault()
      if (mode === 'password') void run(() => signInWithPassword(email.trim(), password), '登入成功', true)
      else void run(async () => { await quickSignIn(quick); await recheckAccess() }, '已用快速登入', true)
    }}>
      <p className="text-muted">{intro ?? '紀錄員登入後才能紀錄與上傳；瀏覽不需登入。'}</p>
      <Tabs size="sm" aria-label="登入方式" value={mode} onChange={(m) => { setMode(m); setMsg(null) }} items={[{ value: 'password', label: '密碼登入' }, { value: 'quick', label: '快速登入' }]} className="self-start" />
      {mode === 'password' ? (
        <>
          <Input type="email" required autoComplete="username" placeholder="紀錄員 email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="email" autoFocus={autoFocus} />
          <Input type="password" required autoComplete="current-password" placeholder="密碼" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="密碼" />
          <Button type="submit" variant="primary" disabled={busy} className="w-full">{busy ? '登入中…' : '登入'}</Button>
          <p className="text-xs text-muted">帳號由管理員在 Supabase 建立；忘記密碼請找管理員重設。</p>
        </>
      ) : (
        <>
          <Input type="password" required autoComplete="current-password" placeholder="快速登入密碼" value={quick} onChange={(e) => setQuick(e.target.value)} aria-label="快速登入密碼" autoFocus={autoFocus} />
          <Button type="submit" variant="primary" disabled={busy} className="w-full">{busy ? '登入中…' : '快速登入'}</Button>
          <p className="text-xs text-muted">輸入紀錄員設定的共用密碼，這台裝置就能紀錄、修改比賽一段時間（不能管理紀錄員名單）。</p>
        </>
      )}
      {msg && <div role="status" className="text-xs text-ink-2">{msg}</div>}
    </form>
  )
}
