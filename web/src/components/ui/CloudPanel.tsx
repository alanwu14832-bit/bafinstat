import { useState } from 'react'
import { CloudOff, LogOut, RefreshCw } from 'lucide-react'
import { Card } from './Card'
import { Button } from './Button'
import { Badge } from './Badge'
import { Input } from './Input'
import { Tabs } from './Tabs'
import { sendMagicLink, signInWithPassword, signOut, verifyEmailCode } from '../../data/supabase'
import { useDataStore } from '../../store/data'

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
        <div className="flex items-start gap-2.5 text-[13px] text-ink-2 leading-relaxed"><CloudOff className="size-4 mt-0.5 shrink-0 text-muted" /><span>目前為本地模式：資料只存在這個瀏覽器。要讓全隊共用同一份資料，請依 README 的「Supabase 設定」加入環境變數後重新部署。</span></div>
      </Card>
    )
  }

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true); setMsg(null)
    try { await fn(); setMsg(ok) } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  const status = cloud.status === 'ready' ? '已連線' : cloud.status === 'loading' ? '載入中' : cloud.status === 'error' ? '連線失敗' : '關閉'

  return (
    <Card title="雲端資料庫" subtitle={cloud.lastSync ? `最後同步 ${new Date(cloud.lastSync).toLocaleString('zh-TW')}` : '尚未同步'}
      action={<Badge variant={cloud.status === 'ready' ? 'good' : cloud.status === 'error' ? 'critical' : 'neutral'}>{status}</Badge>}>
      <div className="flex flex-col gap-3 text-[13px]">
        {cloud.error && <div className="text-critical">{cloud.error}</div>}
        {cloud.user ? (
          <>
            <div className="rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2.5 text-ink-2 leading-relaxed">已以 <span className="font-medium text-ink">{cloud.user.email}</span> 登入。上傳的檔案會寫入雲端，所有人即時看到。</div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" icon={<RefreshCw />} onClick={() => void loadCloud()} disabled={cloud.status === 'loading'}>重新載入</Button>
              <Button size="sm" variant="ghost" icon={<LogOut />} onClick={() => void run(signOut, '已登出')}>登出</Button>
            </div>
          </>
        ) : (
          <form className="flex flex-col gap-2.5" onSubmit={(e) => {
            e.preventDefault()
            if (mode === 'password') void run(() => signInWithPassword(email.trim(), password), '登入成功')
            else void run(async () => { await sendMagicLink(email.trim()); setSent(true) }, '已寄出登入信，請開啟信中的連結（或輸入信中的 6 位數驗證碼）。')
          }}>
            <p className="text-muted">紀錄員登入後才能寫入；瀏覽不需登入。</p>
            <Tabs size="sm" aria-label="登入方式" value={mode} onChange={setMode} items={[{ value: 'password', label: '密碼登入' }, { value: 'link', label: 'Email 連結' }]} className="self-start" />
            <Input type="email" required autoComplete="username" placeholder="紀錄員 email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="email" />
            {mode === 'password' ? (
              <>
                <Input type="password" required autoComplete="current-password" placeholder="密碼" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="密碼" />
                <div className="flex gap-2 flex-wrap items-center">
                  <Button type="submit" variant="primary" disabled={busy}>登入</Button>
                  <Button size="md" variant="ghost" icon={<RefreshCw />} onClick={() => void loadCloud()} disabled={cloud.status === 'loading'}>重新載入</Button>
                </div>
                <p className="text-xs text-muted">密碼由管理員在 Supabase → Authentication → Users 設定。</p>
              </>
            ) : (
              <>
                <div className="flex gap-2 flex-wrap items-center">
                  <Button type="submit" variant="primary" disabled={busy}>寄送登入連結</Button>
                  {sent && (
                    <>
                      <Input inputMode="numeric" placeholder="6 位數驗證碼" value={code} onChange={(e) => setCode(e.target.value)} className="w-[150px] tnum" aria-label="驗證碼" />
                      <Button disabled={busy || code.length < 6} onClick={() => void run(() => verifyEmailCode(email.trim(), code.trim()), '登入成功')}>驗證</Button>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted">免費方案每小時只能寄 2 封信；被限制時請改用密碼登入。</p>
              </>
            )}
          </form>
        )}
        {msg && <div role="status" className="text-xs text-ink-2">{msg}</div>}
      </div>
    </Card>
  )
}
