import { useState } from 'react'
import { Button } from './Button'
import { Input } from './Input'
import { Tabs } from './Tabs'
import { quickSignIn, signInWithPassword, signUpWithPassword } from '../../data/supabase'
import { checkNewPassword } from '../../data/editors'
import { useDataStore } from '../../store/data'

// 快速登入 (the shared password a 紀錄員 sets on 資料匯入) makes this device a 紀錄員 for some days; 球員, 紀錄員 and
// 管理者 otherwise sign in with their own account
type Mode = 'password' | 'quick' | 'signup'
// the way this device signed in last time opens first (password or 快速登入)
const MODE_KEY = 'bafin.login.mode'
const readMode = (): Mode => { try { return localStorage.getItem(MODE_KEY) === 'quick' ? 'quick' : 'password' } catch { return 'password' } }
const keepMode = (m: Mode) => { try { localStorage.setItem(MODE_KEY, m === 'quick' ? 'quick' : 'password') } catch { /* storage unavailable */ } }

/** Email + password sign-in, 快速登入 with the shared password, and the first-time 邀請碼 sign-up. Shared by the cloud panel and the sign-in dialog. */
export function LoginForm({ onDone, autoFocus, intro }: { onDone?: () => void; autoFocus?: boolean; intro?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [invite, setInvite] = useState('')
  const claimWithCode = useDataStore((s) => s.claimWithCode)
  const [mode, setMode] = useState<Mode>(readMode)
  const [quick, setQuick] = useState('')
  const recheckAccess = useDataStore((s) => s.recheckAccess)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const run = async (fn: () => Promise<void>, ok: string, done = false) => {
    setBusy(true); setMsg(null)
    try { await fn(); setMsg(ok); keepMode(mode); if (done) onDone?.() } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  return (
    <form className="flex flex-col gap-2.5 text-[13px]" onSubmit={(e) => {
      e.preventDefault()
      if (mode === 'password') void run(() => signInWithPassword(email.trim(), password), '登入成功', true)
      else if (mode === 'quick') void run(async () => { await quickSignIn(quick); await recheckAccess() }, '已用快速登入', true)
      else {
        const bad = checkNewPassword(password, again) ?? (invite.replace(/[^A-Za-z0-9]/g, '').length < 10 ? '請輸入管理者給你的 10 碼邀請碼' : null)
        if (bad) setMsg(bad)
        else void run(async () => {
          await signUpWithPassword(email.trim(), password)
          // the 邀請碼 binds this new account to the email's place on the list (球員 / 紀錄員 / 管理者); without it the
          // account sees only what anyone may see
          const a = await claimWithCode(invite)
          if (a !== 'ok') throw new Error(a === 'bad_code' ? '密碼已設定，但邀請碼不對：請在下方重新輸入' : a === 'expired' ? '密碼已設定，但邀請碼已過期：請管理者重發' : a === 'not_listed' ? '密碼已設定，但這個 email 不在帳號名單：請管理者先新增你' : '密碼已設定，但帳號還沒啟用：請在下方輸入邀請碼')
        }, '已設定密碼並啟用帳號', true)
      }
    }}>
      <p className="text-muted">{intro ?? '球員、紀錄員、管理者用自己的 email 登入；要紀錄比賽也可以用快速登入。比賽、即時比分、紀錄簿不用登入就看得到。'}</p>
      <Tabs size="sm" aria-label="登入方式" value={mode} onChange={(m) => { setMode(m); setMsg(null) }} items={[{ value: 'password', label: '登入' }, { value: 'quick', label: '快速登入' }, { value: 'signup', label: '第一次使用' }]} className="self-start" />
      {mode !== 'quick' && <Input type="email" required autoComplete="username" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="email" autoFocus={autoFocus} />}
      {mode === 'quick' ? (
        <>
          <Input type="password" required autoComplete="current-password" placeholder="快速登入密碼" value={quick} onChange={(e) => setQuick(e.target.value)} aria-label="快速登入密碼" autoFocus={autoFocus} />
          <Button type="submit" variant="primary" disabled={busy} className="w-full">{busy ? '登入中…' : '快速登入'}</Button>
          <p className="text-xs text-muted">輸入紀錄員設定的共用密碼，這台裝置就能當紀錄員一段時間：紀錄、修改比賽，但不能管理帳號。</p>
        </>
      ) : mode === 'password' ? (
        <>
          <Input type="password" required autoComplete="current-password" placeholder="密碼" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="密碼" />
          <Button type="submit" variant="primary" disabled={busy} className="w-full">{busy ? '登入中…' : '登入'}</Button>
          <p className="text-xs text-muted">第一次登入請先選「第一次使用」，用邀請碼設定密碼；忘記密碼請找管理者重發邀請碼。</p>
        </>
      ) : (
        <>
          <Input required value={invite} onChange={(e) => setInvite(e.target.value.toUpperCase())} placeholder="邀請碼（管理者新增你時拿到的 10 碼）" aria-label="邀請碼" autoComplete="one-time-code" className="tnum tracking-wider" />
          <Input type="password" required autoComplete="new-password" placeholder="設定密碼（至少 8 個字元）" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="設定密碼" />
          <Input type="password" required autoComplete="new-password" placeholder="再輸入一次密碼" value={again} onChange={(e) => setAgain(e.target.value)} aria-label="再輸入一次密碼" />
          <Button type="submit" variant="primary" disabled={busy} className="w-full">{busy ? '設定中…' : '設定密碼並登入'}</Button>
          <p className="text-xs text-muted">請管理者先在「帳號管理」新增你的 email，他會給你一組邀請碼；沒有邀請碼的帳號只能看公開的頁面。</p>
        </>
      )}
      {msg && <div role="status" className="text-xs text-ink-2">{msg}</div>}
    </form>
  )
}
