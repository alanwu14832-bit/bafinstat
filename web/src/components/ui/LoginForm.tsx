import { useState } from 'react'
import { Button } from './Button'
import { Input } from './Input'
import { Tabs } from './Tabs'
import { sendMagicLink, signInWithPassword, verifyEmailCode } from '../../data/supabase'

/** Email + password (or email link) sign-in. Shared by the cloud panel and the sidebar dialog. */
export function LoginForm({ onDone, autoFocus, intro }: { onDone?: () => void; autoFocus?: boolean; intro?: string }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'password' | 'link'>('password')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const run = async (fn: () => Promise<void>, ok: string, done = false) => {
    setBusy(true); setMsg(null)
    try { await fn(); setMsg(ok); if (done) onDone?.() } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  return (
    <form className="flex flex-col gap-2.5 text-[13px]" onSubmit={(e) => {
      e.preventDefault()
      if (mode === 'password') void run(() => signInWithPassword(email.trim(), password), '登入成功', true)
      else void run(async () => { await sendMagicLink(email.trim()); setSent(true) }, '已寄出登入信，請開啟信中的連結（或輸入信中的 6 位數驗證碼）。')
    }}>
      <p className="text-muted">{intro ?? '紀錄員登入後才能紀錄與上傳；瀏覽不需登入。'}</p>
      <Tabs size="sm" aria-label="登入方式" value={mode} onChange={setMode} items={[{ value: 'password', label: '密碼登入' }, { value: 'link', label: 'Email 連結' }]} className="self-start" />
      <Input type="email" required autoComplete="username" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="email" autoFocus={autoFocus} />
      {mode === 'password' ? (
        <>
          <Input type="password" required autoComplete="current-password" placeholder="密碼" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="密碼" />
          <Button type="submit" variant="primary" disabled={busy} className="w-full">{busy ? '登入中…' : '登入'}</Button>
          <p className="text-xs text-muted">帳號由管理員在 Supabase 建立；忘記密碼請找管理員重設。</p>
        </>
      ) : (
        <>
          <Button type="submit" variant="primary" disabled={busy} className="w-full">寄送登入連結</Button>
          {sent && (
            <div className="flex gap-2">
              <Input inputMode="numeric" placeholder="6 位數驗證碼" value={code} onChange={(e) => setCode(e.target.value)} className="tnum" aria-label="驗證碼" />
              <Button disabled={busy || code.length < 6} onClick={() => void run(() => verifyEmailCode(email.trim(), code.trim()), '登入成功', true)}>驗證</Button>
            </div>
          )}
          <p className="text-xs text-muted">免費方案每小時只能寄 2 封信；被限制時請改用密碼登入。</p>
        </>
      )}
      {msg && <div role="status" className="text-xs text-ink-2">{msg}</div>}
    </form>
  )
}
