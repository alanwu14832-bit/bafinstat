import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { EditorsPanel } from '../components/ui/EditorsPanel'

const LEVELS: Array<[string, string]> = [
  ['一般人（不用登入）', '即時比分、比賽（含每場成績）、紀錄簿、使用指南、數據字典；總覽只看戰績和最近比賽。'],
  ['球員、教練', '再加上完整總覽、打擊、投球、守備、球員頁、相簿。只能看，不能改。'],
  ['紀錄員', '再加上紀錄比賽、修改資料、資料匯入、先發陣容。'],
  ['管理者', '再加上帳號管理（新增帳號、改身分、重發邀請碼、移除）與網站版本。'],
]

/** /accounts — 帳號管理 (管理者): who may see and do what, and the account list itself. */
export function AccountsPage() {
  return (
    <>
      <PageHeader title="帳號管理" description="新增球員、紀錄員或管理者的帳號，調整身分、重發邀請碼。每個人用自己的 email 和密碼登入。" />
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 md:gap-5 items-start">
        <div className="xl:col-span-3"><EditorsPanel /></div>
        <Card className="xl:col-span-2" title="身分與權限" subtitle="由淺入深：每一層都包含上一層">
          <ol className="flex flex-col divide-y divide-border">
            {LEVELS.map(([who, what], i) => (
              <li key={who} className="py-3 first:pt-0 last:pb-0 flex gap-3">
                <span className="figure text-[15px] font-bold text-accent w-5 shrink-0">{i}</span>
                <div><div className="text-[14px] font-semibold text-ink">{who}</div><p className="text-[13px] text-ink-2 leading-relaxed mt-0.5">{what}</p></div>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  )
}
