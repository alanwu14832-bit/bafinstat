import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { PitchLegend } from '../components/ui/PlayByPlay'

const TEMPLATE_URL = (import.meta.env.VITE_TEMPLATE_URL as string | undefined) ?? `${import.meta.env.BASE_URL}BAFIN_棒球數據總表.xlsx`

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="size-6 rounded-[6px] bg-surface-2 text-ink text-[12px] font-semibold grid place-items-center shrink-0 tnum mt-0.5">{n}</span>
      <div className="min-w-0"><div className="text-[13px] font-medium text-ink leading-6">{title}</div><div className="text-[13px] text-ink-2 mt-0.5 leading-relaxed">{children}</div></div>
    </li>
  )
}

const CODES: Array<[string, string]> = [
  ['一安 / 二安 / 三安 / 全壘打', '安打，含內野安打'], ['保送 / 故四 / 觸身', '四壞、故意四壞、觸身球（不算打數）'], ['三振', '含不死三振'],
  ['內滾 / 內飛 / 外飛', '出局；軌跡欄填 G 滾地、F 飛球、L 平飛'], ['界外飛', '界外飛球被接殺；落點填接球的守備員，最後一球記 IP'], ['野選', '野手選擇，讓壘上跑者出局'], ['失誤', '靠對方失誤上壘（不算安打）'],
  ['犧觸 / 犧飛', '犧牲觸擊、犧牲飛球（不算打數）'], ['雙殺', '打成雙殺打（這一列算 2 個出局）'], ['妨礙', '捕手妨礙上壘'],
]

const FAQ: Array<[string, string]> = [
  ['比賽照片放哪裡？', '「相簿」頁。攝影師（或紀錄員）登入後按「上傳照片」，選這場比賽或自訂相簿名稱，把照片拖進來即可；手機會先縮成 2048px 再上傳。隊員不用登入，點照片放大、右上角下載，或按「選取」勾多張一次打包。原始檔請攝影師自己留在雲端硬碟。'],
  ['三游穿越安打的落點要填三壘還是左外野？', '都不是：落點記「處理球的人」，沒人碰到的穿越球就填縫隙代碼——56 三游、46 二游（中間）、34 一二、78 左中、89 右中。紀錄比賽頁的落點區有「穿越／落地的縫隙」按鈕。出局一律填處理球的守備員 1–9（例如三游之間被游擊手接到就是 6）。'],
  ['一個人守很多位置，名單守位怎麼填？', '名單的主／副守位除了 P、C、1B…RF，也可以選 IF 內野手、OF 外野手、UT 工具人。比賽時每個打席的守位仍記當場實際站的位置。'],
  ['要先排陣容再開始記？', '登入後到「先發陣容」：球場圖上每個守位有下拉選單選人，右邊排打序（可按「依守位填入」）。陣容存在這台裝置，開「紀錄比賽」時自動帶入；也能複製成文字貼到群組。'],
  ['紀錄時怎麼知道現在是在記打擊還是投球？', '打席區上方有一條狀態列：黑底「現在紀錄：打擊」是我隊進攻，橘色「現在紀錄：投球」是對方進攻、記我隊投手。對方球員不記姓名，只記第幾棒。想專心記可按「全螢幕」。'],
  ['讀取錯誤或記錯了，要怎麼改？', '到「比賽」點那一場，按右上角「修改資料」：比賽資訊、每個打席、守備都能直接改、增刪列，儲存後所有統計立即重算。雲端模式需先登入。也可以改總表後重傳（取代模式）。'],
  ['同一場比賽改了資料要重傳？', '上傳時選「以此檔取代雲端全部資料」會用總表覆蓋雲端；「合併」只會加入新的比賽ID。'],
  ['球員名字打錯了、要加新人或有人離隊？', '紀錄員登入後到「球員」頁展開名單，按「編輯名單」：可以新增、改背號守位、改名（所有紀錄會一起改）、把狀態改成離隊或畢業，或按「匯入 Excel」整份名冊套進來（同名以檔案為準、空白欄位保留舊值，會先顯示差異再套用）。'],
  ['ERA 為什麼是 7 局換算？', '社會組／校際多為 7 局制。可在「設定」工作表或網站的資料匯入頁改成 9。'],
  ['誰可以上傳？', '只有在 Supabase 建立帳號的紀錄員能寫入；其他人不用登入就能看。'],
]

export function GuidePage() {
  return (
    <>
      <PageHeader title="使用指南" description="比賽當天怎麼記、賽後怎麼把資料變成全隊看得到的數據。整個流程只需要一份 Excel 總表和這個網站。"
        actions={<img src={`${import.meta.env.BASE_URL}logo.png`} alt="NTU BaFiN" className="h-14 w-auto rounded-[var(--radius-sm)] bg-white border border-border p-1" onError={(e) => { e.currentTarget.style.display = 'none' }} />} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
        <Card title="1. 比賽前" subtitle="約 5 分鐘">
          <ol className="flex flex-col gap-4">
            <Step n={1} title="下載或打開總表">
              <a className="underline underline-offset-2 text-ink" href={TEMPLATE_URL} download>BAFIN_棒球數據總表.xlsx</a>。整隊只維護這一個檔案，建議放在共用雲端硬碟。
            </Step>
            <Step n={2} title="在「比賽清單」新增一列">比賽ID 用 <code className="text-[12px] bg-surface-2 rounded px-1 py-0.5">G+日期+場次</code>，例如 <code className="text-[12px] bg-surface-2 rounded px-1 py-0.5 tnum">G20251010-01</code>；填日期、杯賽、對手、主客、場地。杯賽與對手名稱要先在「設定」工作表的清單裡。</Step>
            <Step n={3} title="複製三張單場模板">右鍵工作表 → 移動或複製 → 建立副本：<strong className="font-medium text-ink">單場-摘要</strong>、<strong className="font-medium text-ink">單場-打擊</strong>、<strong className="font-medium text-ink">單場-投球</strong>。在單場-摘要的 C2 填同一個比賽ID，填先發打序與守位；賽後在同一區塊填勝投／敗投／救援（網站的 W／L／SV 由這裡來）。</Step>
          </ol>
        </Card>

        <Card title="2. 比賽中" subtitle="用哪一張表">
          <div className="mb-4 rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2 leading-relaxed"><span className="font-medium text-ink">不想用 Excel？</span>紀錄員登入後，直接到「紀錄比賽」頁逐球點按：局數、出局、壘上、得分、結果代碼都會自動寫好，賽後按「結束比賽」就存進資料庫，全隊即時看到。</div>
          <ol className="flex flex-col gap-4">
            <Step n={1} title="我隊進攻 → 單場-打擊">每個打席一列：局、棒次、打者、逐球（球1…球12 填 SS/CS/F/IP/B）、打擊結果、落點 1–9、軌跡 G/F/L、強度 強/中/弱、盜壘、得分、打點、結果代碼。</Step>
            <Step n={2} title="對方進攻 → 單場-投球">同樣每個打席一列，主角是我方投手；多了被盜壘、暴投、捕逸、牽制出局。結果代碼 R = 非自責失分、ER = 自責分。</Step>
            <Step n={3} title="新欄位（可選，但很值得）">「出局(前)」「壘上(前)」：打席開始時幾出局、壘上有誰（無／1／2／3／12／13／23／123）。有了它才能算得點圈打擊率與優質打席。</Step>
          </ol>
          <div className="mt-5 pt-4 border-t border-border flex flex-col gap-2">
            <div className="text-xs font-medium text-ink">逐球代碼</div>
            <PitchLegend />
            <div className="text-xs font-medium text-ink mt-2">結果代碼（沿用原表）</div>
            <div className="text-xs text-ink-2 leading-relaxed">I／II／III 這個打席造成第 1／2／3 個出局・L 殘壘・R 得分（投球表：R 非自責、ER 自責）</div>
          </div>
        </Card>

        <Card title="3. 比賽後" subtitle="約 10 分鐘">
          <ol className="flex flex-col gap-4">
            <Step n={1} title="檢查單場-摘要">它會自動算出當場的逐局比分、每個人的打擊與投球成績。核對 R/H/E 跟記分板一致，順便在守備區塊填每個人的 PO / A / E（至少填失誤；沒填的 PO／A 網站會由投球紀錄推定）。</Step>
            <Step n={2} title="貼回三張紀錄表">把「單場-打擊」有資料的列（A 欄到「備註」欄）複製，到「打席紀錄」最後一列下方<strong className="font-medium text-ink">貼上值</strong>；「單場-投球」貼到「投球紀錄」；守備區塊貼到「守備紀錄」。「總表」立刻更新。</Step>
            <Step n={3} title="上傳到網站">資料匯入 → 紀錄員登入 → 拖入檔案 → 「合併（略過重複的比賽ID）」。整份總表、只含三張「單場-」工作表的檔案、或舊格式的單場紀錄表都可以，網站會自動辨識並算出一樣的數據。</Step>
          </ol>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <Card title="打擊結果怎麼填" subtitle="「打擊結果」欄的固定用詞（有下拉選單）">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            {CODES.map(([k, v]) => (<div key={k}><dt className="text-[13px] font-medium text-ink">{k}</dt><dd className="text-xs text-ink-2 mt-0.5">{v}</dd></div>))}
          </dl>
        </Card>
        <Card title="賽後怎麼看數據">
          <ul className="text-[13px] text-ink-2 flex flex-col gap-3 leading-relaxed">
            <li className="flex gap-2.5"><Badge className="mt-0.5 shrink-0">總覽</Badge><span>戰績、得失分、OPS 走勢、逐局得失分、落點熱區。上方篩選列可以只看某個杯賽、某段期間、某個對手或主客場。</span></li>
            <li className="flex gap-2.5"><Badge className="mt-0.5 shrink-0">打擊 / 投球</Badge><span>三組欄位：基本（AVG/OBP/SLG）、進階（wOBA、ISO、BABIP、得點圈）、過程（Whiff%、CSW%、GB/FB/LD%、Hard%）。點欄位標題排序，點球員進個人檔案。</span></li>
            <li className="flex gap-2.5"><Badge className="mt-0.5 shrink-0">比賽</Badge><span>點任一場：逐局比分、Box Score，以及「逐打席・打擊／投球」完整的逐球紀錄。</span></li>
            <li className="flex gap-2.5"><Badge className="mt-0.5 shrink-0">球員</Badge><span>個人數據、隊內百分位雷達、落點分佈、逐場紀錄與累積走勢。</span></li>
            <li className="flex gap-2.5"><Badge className="mt-0.5 shrink-0">數據字典</Badge><span>每一項指標的定義與公式，和總表的「數據字典」工作表一致。</span></li>
          </ul>
        </Card>
      </div>

      <Card title="常見問題">
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          {FAQ.map(([q, a]) => (<div key={q}><dt className="text-[13px] font-medium text-ink">{q}</dt><dd className="text-[13px] text-ink-2 mt-1 leading-relaxed">{a}</dd></div>))}
        </dl>
      </Card>
    </>
  )
}
