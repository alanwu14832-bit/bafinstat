import { useState } from 'react'
import { LoginForm } from './LoginForm'
import { CloudOff, LogOut, RefreshCw } from 'lucide-react'
import { Card } from './Card'
import { Button } from './Button'
import { Badge } from './Badge'
import { signOut } from '../../data/supabase'
import { useDataStore } from '../../store/data'

/** Cloud (Supabase) status + sign-in. Rendered on the import page. */
export function CloudPanel() {
  const cloud = useDataStore((s) => s.cloud)
  const loadCloud = useDataStore((s) => s.loadCloud)
  const [msg, setMsg] = useState<string | null>(null)

  if (!cloud.configured) {
    return (
      <Card title="雲端資料庫" subtitle="未啟用">
        <div className="flex items-start gap-2.5 text-[13px] text-ink-2 leading-relaxed"><CloudOff className="size-4 mt-0.5 shrink-0 text-muted" /><span>目前為本地模式：資料只存在這個瀏覽器。要讓全隊共用同一份資料，請依 README 的「Supabase 設定」加入環境變數後重新部署。</span></div>
      </Card>
    )
  }

  const run = async (fn: () => Promise<void>, ok: string) => {
    setMsg(null)
    try { await fn(); setMsg(ok) } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) }
  }
  const status = cloud.status === 'ready' ? '已連線' : cloud.status === 'loading' ? '載入中' : cloud.status === 'error' ? '連線失敗' : '關閉'

  return (
    <Card title="雲端資料庫" subtitle={cloud.lastSync ? `最後同步 ${new Date(cloud.lastSync).toLocaleString('zh-TW')}` : '尚未同步'}
      action={<Badge variant={cloud.status === 'ready' ? 'good' : cloud.status === 'error' ? 'critical' : 'neutral'}>{status}</Badge>}>
      <div className="flex flex-col gap-3 text-[13px]">
        {cloud.error && <div className="text-critical">{cloud.error}</div>}
        {cloud.user ? (
          <>
            <div className="rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2.5 text-ink-2 leading-relaxed">已以 <span className="font-medium text-ink">{cloud.user.email}</span> 登入。{cloud.isEditor ? '上傳的檔案會寫入雲端，所有人即時看到。' : '這個帳號不在紀錄員名單，只能瀏覽；請管理員把 email 加進 editors 表。'}</div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" icon={<RefreshCw />} onClick={() => void loadCloud()} disabled={cloud.status === 'loading'}>重新載入</Button>
              <Button size="sm" variant="ghost" icon={<LogOut />} onClick={() => void run(signOut, '已登出')}>登出</Button>
            </div>
          </>
        ) : (
          <LoginForm onDone={() => setMsg('登入成功')} />
        )}
        {msg && <div role="status" className="text-xs text-ink-2">{msg}</div>}
      </div>
    </Card>
  )
}
