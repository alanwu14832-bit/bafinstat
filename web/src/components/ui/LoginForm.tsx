import { useMemo, useState } from 'react'
import { Button } from './Button'
import { Input } from './Input'
import { Tabs } from './Tabs'
import { PlayerSelect, rosterNames } from './PlayerSelect'
import { useDataStore } from '../../store/data'
import { sendMagicLink, signInWithPassword, signUpPlayer, verifyEmailCode } from '../../data/supabase'

export type AuthMode = 'signin' | 'signup'

/** Sign in, or register as a player: pick your name from the roster and the account is linked to it. */
export function LoginForm({ onDone, autoFocus, intro, initialMode = 'signin' }: { onDone?: () => void; autoFocus?: boolean; intro?: string; initialMode?: AuthMode }) {
  const roster = useDataStore((s) => s.base.roster)
  const names = useMemo(() => rosterNames(roster), [roster])
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [how, setHow] = useState<'password' | 'link'>('password')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const run = async (fn: () => Promise<void>, ok: string, done = false) => {
    setBusy(true); setMsg(null)
    try { await fn(); setMsg(ok); if (done) onDone?.() } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  const signUp = () => {
    if (!name) { setMsg('請選你的名字'); return }
    if (password.length < 6) { setMsg('密碼至少 6 個字'); return }
    void run(async () => {
      const { needsConfirm } = await signUpPlayer(email.trim(), password, name)
      if (needsConfirm) setSent(true)
      else onDone?.()
    }, '', false)
  }

  return (
    <form className="flex flex-col gap-2.5 text-[13px]" onSubmit={(e) => {
      e.preventDefault()
      if (mode === 'signup') { signUp(); return }
      if (how === 'password') void run(() => signInWithPassword(email.trim(), password), '登入成功', true)
      else void run(async () => { await sendMagicLink(email.trim()); setSent(true) }, '已寄出登入信，請開啟信中的連結（或輸入信中的 6 位數驗證碼）。')
    }}>
      <p className="text-muted">{intro ?? '紀錄員登入後才能紀錄與上傳；瀏覽不需登入。'}</p>
      <Tabs size="sm" aria-label="登入或註冊" value={mode} onChange={(m) => { setMode(m); setMsg(null); setSent(false) }} items={[{ value: 'signin', label: '登入' }, { value: 'signup', label: '註冊' }]} className="self-start" />

      {mode === 'signup' ? (
        sent ? (
          <div className="flex flex-col gap-2">
            <p className="text-ink">確認信已寄到 <span className="font-medium">{email.trim()}</span>。</p>
            <p className="text-muted">點開信裡的連結就完成註冊，回到網站即可回覆練球。沒收到請看垃圾郵件。</p>
            <Button variant="ghost" onClick={() => { setSent(false); setMsg(null) }}>用別的信箱</Button>
          </div>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-muted">你的名字</span>
              <PlayerSelect value={name} onChange={setName} names={names} placeholder="從球員名單選你的名字" className="w-full" />
            </label>
            <Input type="email" required autoComplete="email" placeholder="常用的 email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="email" autoFocus={autoFocus} />
            <Input type="password" required autoComplete="new-password" placeholder="設一組密碼（至少 6 個字）" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="密碼" />
            <Button type="submit" variant="primary" disabled={busy} className="w-full">{busy ? '註冊中…' : '註冊'}</Button>
            <p className="text-xs text-muted">名字要在球員名單上才選得到；找不到自己請找管理員先加進名單。註冊只能回覆練球，不會有紀錄員權限。</p>
          </>
        )
      ) : (
        <>
          <Tabs size="sm" aria-label="登入方式" value={how} onChange={setHow} items={[{ value: 'password', label: '密碼登入' }, { value: 'link', label: 'Email 連結' }]} className="self-start" />
          <Input type="email" required autoComplete="username" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="email" autoFocus={autoFocus} />
          {how === 'password' ? (
            <>
              <Input type="password" required autoComplete="current-password" placeholder="密碼" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="密碼" />
              <Button type="submit" variant="primary" disabled={busy} className="w-full">{busy ? '登入中…' : '登入'}</Button>
              <p className="text-xs text-muted">球員按上面的「註冊」自己開帳號；紀錄員帳號由管理員建立，忘記密碼請找管理員重設。</p>
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
        </>
      )}
      {msg && <div role="status" className="text-xs text-ink-2">{msg}</div>}
    </form>
  )
}
