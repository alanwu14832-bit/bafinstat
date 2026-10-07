import { useEffect, useState } from 'react'
import { ExternalLink, History } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { ARCHIVE, LIVE_BASE, type SiteVersion } from '../config/archive'

/** 網站版本: the saved copies of earlier versions of this site, newest first, each one openable (read-only). */
export function VersionsPage() {
  const [versions, setVersions] = useState<SiteVersion[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    fetch(`${LIVE_BASE}v/versions.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : []))
      .then((v: unknown) => { if (live) setVersions(Array.isArray(v) ? (v as SiteVersion[]) : []) })
      .catch(() => { if (live) { setFailed(true); setVersions([]) } })
    return () => { live = false }
  }, [])

  return (
    <>
      <PageHeader title="網站版本" description="網站每次更新都會保存一份，可以打開以前的版本看（只能瀏覽，資料是現在的資料）。最多保留最近 30 版。" />
      <Card flush>
        {versions === null ? (
          <div className="px-5 py-10 text-center text-[13px] text-muted">讀取中…</div>
        ) : versions.length === 0 ? (
          <EmptyState icon={<History />} title={failed ? '讀不到版本清單' : '還沒有保存的舊版本'} description={failed ? '請稍後再試。' : '下一次網站更新之後，這裡就會開始出現以前的版本。'} />
        ) : (
          <ul className="divide-y divide-border">
            {versions.map((v, i) => {
              const here = ARCHIVE?.id === v.id
              return (
                <li key={v.id} className="px-4 md:px-5 py-3 flex items-start gap-3 flex-wrap sm:flex-nowrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-semibold text-ink tnum">{v.date}</span>
                      {i === 0 && <Badge variant="accent">最近一次更新</Badge>}
                      {here && <Badge>你正在看這一版</Badge>}
                      <span className="text-[11px] text-muted tnum">{v.sha}</span>
                    </div>
                    <p className="text-[13px] text-ink-2 leading-relaxed mt-1 break-words">{v.note}</p>
                  </div>
                  <a href={`${LIVE_BASE}v/${v.id}/`} className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-[var(--radius-sm)] border border-border bg-surface text-[13px] font-medium text-ink hover:bg-surface-2">
                    打開這一版 <ExternalLink className="size-3.5" />
                  </a>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      <p className="text-[12px] text-muted leading-relaxed">
        想把整個網站退回某一版（不只是看）：把上面的日期和編號告訴維護網站的人，他可以在 Vercel／Cloudflare 的 Deployments 把那一版設回正式網站，或把程式退回那一版。
      </p>
    </>
  )
}
