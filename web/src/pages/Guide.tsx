import { ClipboardList, FileSpreadsheet, UploadCloud, BarChart3, ShieldCheck } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { PitchLegend } from '../components/ui/PlayByPlay'

const TEMPLATE_URL = (import.meta.env.VITE_TEMPLATE_URL as string | undefined) ?? `${import.meta.env.BASE_URL}BAFIN_棒球數據總表.xlsx`

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="size-7 rounded-full bg-accent text-accent-ink font-display font-bold grid place-items-center shrink-0">{n}</span>
      <div className="min-w-0"><div className="font-medium text-ink">{title}</div><div className="text-sm text-ink-2 mt-1 leading-relaxed">{children}</div></div>
    </li>
  )
}

const CODES: Array<[string, string]> = [
  ['一安 / 二安 / 三安 / 全壘打', '安打，含內野安打'], ['保送 / 故四 / 觸身', '四壞、故意四壞、觸身球（不算打數）'], ['三振', '含不死三振'],
  ['內滾 / 內飛 / 外飛', '出局；軌跡欄填 G 滾地、F 飛球、L 平飛'], ['野選', '野手選擇，讓壘上跑者出局'], ['失誤', '靠對方失誤上壘（不算安打）'],
  ['犧觸 / 犧飛', '犧牲觸擊、犧牲飛球（不算打數）'], ['雙殺', '打成雙殺打（這一列算 2 個出局）'], ['妨礙', '捕手妨礙上壘'],
]

export function GuidePage() {
  return (
    <>
      <PageHeader eyebrow="How to" title="使用指南" description="比賽當天怎麼記、賽後怎麼把資料變成全隊看得到的數據。整個流程只需要一份 Excel 總表和這個網站。"
        actions={<img src={`${import.meta.env.BASE_URL}logo.png`} alt="NTU BaFiN" className="h-20 w-auto rounded-[var(--radius-sm)] bg-white p-1" onError={(e) => { e.currentTarget.style.display = 'none' }} />} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="1. 比賽前" subtitle="5 分鐘" action={<ClipboardList className="size-4 text-muted" />}>
          <ol className="flex flex-col gap-3">
            <Step n={1} title="下載或打開總表">
              <a className="underline" href={TEMPLATE_URL} download>BAFIN_棒球數據總表.xlsx</a>。整隊只維護這一個檔案，建議放在共用雲端硬碟。
            </Step>
            <Step n={2} title="在「比賽清單」新增一列">比賽ID 用 <code>G+日期+場次</code>，例如 <code>G20251010-01</code>；填日期、杯賽、對手、主客、場地。杯賽與對手名稱要先在「設定」工作表的清單裡。</Step>
            <Step n={3} title="複製三張單場模板">右鍵工作表 → 移動或複製 → 建立副本：<strong>單場-摘要</strong>、<strong>單場-打擊</strong>、<strong>單場-投球</strong>。在單場-摘要的 C2 填同一個比賽ID，填先發打序與守位。</Step>
          </ol>
        </Card>

        <Card title="2. 比賽中" subtitle="用哪一張表" action={<FileSpreadsheet className="size-4 text-muted" />}>
          <ol className="flex flex-col gap-3">
            <Step n={1} title="我隊進攻 → 單場-打擊">每個打席一列：局、棒次、打者、逐球（球1…球12 填 SS/CS/F/IP/B）、打擊結果、落點 1–9、軌跡 G/F/L、強度 強/中/弱、盜壘、得分、打點、結果代碼。</Step>
            <Step n={2} title="對方進攻 → 單場-投球">同樣每個打席一列，主角是我方投手；多了被盜壘、暴投、捕逸、牽制出局。結果代碼 R = 非自責失分、ER = 自責分。</Step>
            <Step n={3} title="新欄位（可選，但很值得）">「出局(前)」「壘上(前)」：打席開始時幾出局、壘上有誰（無／1／2／3／12／13／23／123）。有了它才能算得點圈打擊率與優質打席。</Step>
          </ol>
          <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-2 p-3 flex flex-col gap-2">
            <div className="text-xs font-medium text-ink">逐球代碼</div>
            <PitchLegend />
            <div className="text-xs font-medium text-ink mt-1">結果代碼（沿用原表）</div>
            <div className="text-xs text-ink-2">I／II／III 這個打席造成第 1／2／3 個出局・L 殘壘・R 得分（投球表：R 非自責、ER 自責）</div>
          </div>
        </Card>

        <Card title="3. 比賽後" subtitle="10 分鐘" action={<UploadCloud className="size-4 text-muted" />}>
          <ol className="flex flex-col gap-3">
            <Step n={1} title="檢查單場-摘要">它會自動算出當場的逐局比分、每個人的打擊與投球成績。核對 R/H/E 跟記分板一致，順便在守備區塊填每個人的 PO / A / E（至少填失誤）。</Step>
            <Step n={2} title="貼回三張紀錄表">把「單場-打擊」有資料的列（A 欄到「備註」欄）複製，到「打席紀錄」最後一列下方 <strong>貼上值</strong>；「單場-投球」貼到「投球紀錄」；守備區塊貼到「守備紀錄」。「總表」立刻更新。</Step>
            <Step n={3} title="上傳到網站">資料匯入 → 紀錄員登入 → 拖入整個總表 → 「合併（略過重複的比賽ID）」。全隊打開網站就看到最新資料，手機也可以。</Step>
          </ol>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="打擊結果怎麼填" subtitle="「打擊結果」欄的固定用詞（有下拉選單）">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {CODES.map(([k, v]) => (<div key={k} className="flex flex-col"><dt className="font-medium text-ink">{k}</dt><dd className="text-ink-2 text-xs">{v}</dd></div>))}
          </dl>
        </Card>
        <Card title="賽後怎麼看數據" action={<BarChart3 className="size-4 text-muted" />}>
          <ul className="text-sm text-ink-2 flex flex-col gap-2 leading-relaxed">
            <li><Badge variant="accent">總覽</Badge> 戰績、得失分、OPS 走勢、逐局得失分、落點熱區。上方篩選列可以只看某個杯賽、某段期間、某個對手或主客場。</li>
            <li><Badge variant="accent">打擊 / 投球</Badge> 三組欄位：基本（AVG/OBP/SLG）、進階（wOBA、ISO、BABIP、得點圈）、過程（Whiff%、CSW%、GB/FB/LD%、Hard%）。點欄位標題排序，點球員進個人檔案。</li>
            <li><Badge variant="accent">比賽</Badge> 點任一場：逐局比分、Box Score，以及「逐打席・打擊／投球」完整的逐球紀錄。</li>
            <li><Badge variant="accent">球員</Badge> 個人數據、隊內百分位雷達、落點分佈、逐場紀錄與累積走勢。</li>
            <li><Badge variant="accent">數據字典</Badge> 每一項指標的定義與公式，和總表的「數據字典」工作表一致。</li>
          </ul>
        </Card>
      </div>

      <Card title="常見問題" action={<ShieldCheck className="size-4 text-muted" />}>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div><dt className="font-medium text-ink">同一場比賽改了資料要重傳？</dt><dd className="text-ink-2 mt-1">上傳時選「以此檔取代雲端全部資料」會用總表覆蓋雲端；「合併」只會加入新的比賽ID。</dd></div>
          <div><dt className="font-medium text-ink">球員名字打錯了怎麼辦？</dt><dd className="text-ink-2 mt-1">名字必須和「球員名單」完全一致。在總表用尋找取代修正後重新上傳（取代模式）。</dd></div>
          <div><dt className="font-medium text-ink">ERA 為什麼是 7 局換算？</dt><dd className="text-ink-2 mt-1">社會組／校際多為 7 局制。可在「設定」工作表或網站的資料匯入頁改成 9。</dd></div>
          <div><dt className="font-medium text-ink">誰可以上傳？</dt><dd className="text-ink-2 mt-1">只有在 Supabase 建立帳號的紀錄員能寫入；其他人不用登入就能看。</dd></div>
        </dl>
      </Card>
    </>
  )
}
