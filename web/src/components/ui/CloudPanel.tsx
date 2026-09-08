import { useState } from 'react'
import { Cloud, CloudOff, LogIn, LogOut, RefreshCw } from 'lucide-react'
import { Card } from './Card'
import { Button } from './Button'
import { Badge } from './Badge'
import { sendMagicLink, signInWithPassword, signOut, verifyEmailCode } from '../../data/supabase'
import { useDataStore } from '../../store/data'

const inputCls = 'h-9 px-2.5 bg-surface border border-border rounded-[var(--radius-sm)] text-sm w-full'

/** Cloud (Supabase) status + sign-in. Rendered on the import page. */
export function CloudPanel() {
  const cloud = useDataStore((s) => s.cloud)
  const loadCloud = useDataStore((s) => s.loadCloud)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'password' | 'link'>('password')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  if (!cloud.configured) {
    return (
      <Card title="雲端資料庫" subtitle="未啟用">
        <div className="flex items-start gap-2 text-sm text-ink-2"><CloudOff className="size-4 mt-0.5 shrink-0 text-muted" /><span>目前為本地模式：資料只存在這個瀏覽器。要讓全隊共用同一份資料，請依 README 的「Supabase 設定」加入環境變數後重新部署。</span></div>
      </Card>
    )
  }

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true); setMsg(null)
    try { await fn(); setMsg(ok) } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  return (
    <Card title="雲端資料庫" subtitle="Supabase・全隊共用同一份資料"
      action={<Badge variant={cloud.status === 'ready' ? 'good' : cloud.status === 'error' ? 'critical' : 'neutral'} icon={<Cloud />}>{cloud.status === 'ready' ? '已連線' : cloud.status === 'loading' ? '載入中' : cloud.status === 'error' ? '連線失敗' : '關閉'}</Badge>}>
      <div className="flex flex-col gap-3 text-sm">
        <div className="text-ink-2">
          {cloud.lastSync ? `最後同步 ${new Date(cloud.lastSync).toLocaleString('zh-TW')}` : '尚未同步'}
          {cloud.error && <div className="text-critical mt-1">{cloud.error}</div>}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" icon={<RefreshCw />} onClick={() => void loadCloud()} disabled={cloud.status === 'loading'}>重新載入</Button>
          {cloud.user && <Button size="sm" variant="ghost" icon={<LogOut />} onClick={() => void run(signOut, '已登出')}>登出</Button>}
        </div>
        {cloud.user ? (
          <div className="rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2">已以 <span className="font-medium text-ink">{cloud.user.email}</span> 登入：上傳的總表會寫入雲端，所有人即時看到。</div>
        ) : (
          <form className="flex flex-col gap-2" onSubmit={(e) => {
            e.preventDefault()
            if (mode === 'password') void run(() => signInWithPassword(email.trim(), password), '登入成功')
            else void run(async () => { await sendMagicLink(email.trim()); setSent(true) }, '已寄出登入信，請開啟信中的連結（或輸入信中的 6 位數驗證碼）。')
          }}>
            <div className="text-xs text-muted">紀錄員登入後才能寫入。任何人不用登入都能瀏覽。</div>
            <div className="inline-flex rounded-[var(--radius-sm)] border border-border overflow-hidden self-start">
              {(['password', 'link'] as const).map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
                  className={`h-7 px-2.5 text-xs cursor-pointer border-r border-border last:border-r-0 ${mode === m ? 'bg-accent-soft text-ink font-medium' : 'text-ink-2 hover:bg-surface-2'}`}>
                  {m === 'password' ? '密碼登入' : 'Email 連結'}
                </button>
              ))}
            </div>
            <input type="email" required autoComplete="username" placeholder="紀錄員 email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} aria-label="email" />
            {mode === 'password' ? (
              <>
                <input type="password" required autoComplete="current-password" placeholder="密碼" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} aria-label="密碼" />
                <div className="flex gap-2 flex-wrap items-center">
                  <Button type="submit" size="sm" variant="primary" icon={<LogIn />} disabled={busy}>登入</Button>
                  <span className="text-[11px] text-muted">密碼由管理員在 Supabase → Authentication → Users 設定。</span>
                </div>
              </>
            ) : (
              <div className="flex gap-2 flex-wrap">
                <Button type="submit" size="sm" variant="primary" icon={<LogIn />} disabled={busy}>寄送登入連結</Button>
                {sent && (
                  <>
                    <input inputMode="numeric" placeholder="6 位數驗證碼" value={code} onChange={(e) => setCode(e.target.value)} className="h-8 px-2 bg-surface border border-border rounded-[var(--radius-sm)] text-sm w-[140px] tnum" aria-label="驗證碼" />
                    <Button size="sm" disabled={busy || code.length < 6} onClick={() => void run(() => verifyEmailCode(email.trim(), code.trim()), '登入成功')}>驗證</Button>
                  </>
                )}
                <span className="basis-full text-[11px] text-muted">免費方案每小時只能寄 2 封信；被限制時請改用密碼登入。</span>
              </div>
            )}
          </form>
        )}
        {msg && <div role="status" className="text-xs text-ink-2">{msg}</div>}
      </div>
    </Card>
  )
}
