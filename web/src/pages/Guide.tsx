import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { TEAM, teamAsset } from '../config/team'
import { Card } from '../components/ui/Card'
import { PitchLegend } from '../components/ui/PlayByPlay'

const TEMPLATE_URL = (import.meta.env.VITE_TEMPLATE_URL as string | undefined) ?? `${import.meta.env.BASE_URL}BAFIN_棒球數據總表.xlsx`

const PAGES: Record<string, string> = { 相簿: '/photos', 比賽: '/games', 先發陣容: '/lineup', 紀錄比賽: '/record', 球員: '/players', 即時比分: '/live', 資料匯入: '/import', 數據字典: '/dictionary', 總覽: '/', 打擊: '/batting', 投球: '/pitching', 守備: '/fielding' }
const pageLink = 'text-ink underline decoration-[color-mix(in_srgb,var(--ink)_30%,transparent)] underline-offset-2 hover:decoration-[var(--ink)] transition-colors motion-reduce:transition-none'

/** A page name in running text, as a link to that page. */
function PageLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className={pageLink}>{children}</Link>
}

/** Turns 「相簿」-style page names (and 資料匯入頁) in an FAQ answer into links; sheet names such as 「設定」 stay text. */
function withPageLinks(text: string): ReactNode {
  const parts = text.split(/(「(?:相簿|比賽|先發陣容|紀錄比賽|球員|即時比分)」|資料匯入(?=頁))/)
  return parts.map((part, i) => {
    const name = part.replace(/[「」]/g, '')
    if (i % 2 === 0 || !PAGES[name]) return <Fragment key={i}>{part}</Fragment>
    return <Fragment key={i}>{part.startsWith('「') ? '「' : ''}<PageLink to={PAGES[name]}>{name}</PageLink>{part.startsWith('「') ? '」' : ''}</Fragment>
  })
}

/** Badge-shaped link to a page, for the 「賽後怎麼看數據」 list. */
function PageChip({ name }: { name: string }) {
  return (
    <Link to={PAGES[name]} className="press inline-flex items-center h-6 px-2 rounded-[6px] text-[12px] font-medium bg-surface-2 text-ink hover:bg-surface-3 transition-colors motion-reduce:transition-none whitespace-nowrap">
      {name}
    </Link>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="size-6 rounded-[6px] bg-surface-2 text-ink text-[12px] font-semibold grid place-items-center shrink-0 tnum mt-0.5">{n}</span>
      <div className="min-w-0"><div className="text-[13px] font-medium text-ink leading-6">{title}</div><div className="text-[13px] text-ink-2 mt-0.5 leading-relaxed">{children}</div></div>
    </li>
  )
}

const CODES: Array<[string, string]> = [
  ['一安 / 二安 / 三安 / 全壘打', '安打'], ['內安', '內野安打：球沒出內野就安全上壘，算一壘安打；預設只有被迫的跑者進壘'], ['場地二安', '球落地後彈出全壘打牆或卡在牆上：算二壘安打，所有跑者都只能進兩個壘'], ['保送 / 故四 / 觸身', '四壞、故意四壞、觸身球（不算打數）'], ['三振', '含不死三振'],
  ['內滾 / 內飛 / 外飛', '出局；軌跡欄填 G 滾地、F 飛球、L 平飛'], ['界外飛', '界外飛球被接殺；落點填接球的守備員，最後一球記 IP'], ['野選', '野手選擇，讓壘上跑者出局'], ['失誤', '靠對方失誤上壘（不算安打）'],
  ['犧觸 / 犧飛', '犧牲觸擊、犧牲飛球（不算打數）'], ['雙殺', '打成雙殺打（這一列算 2 個出局）'], ['妨礙', '捕手妨礙上壘'],
  ['突破僵局', '延長賽照規則放上壘的跑者，不是打席（不算打席、打數）'],
]

const FAQ: Array<[string, string]> = [
  ['比賽照片放哪裡？', '照片放在攝影師自己的 Google Drive：建一個資料夾、共用設成「知道連結的使用者：檢視者」，把連結給紀錄員；紀錄員到「相簿」頁「新增相簿連結」選那場比賽貼上。隊員不用登入，點「開啟相簿」就能看、單張或整個資料夾下載原檔。'],
  ['賽程怎麼排？', '紀錄員登入後到「比賽」頁切到「賽程」分頁，按「新增賽程」填日期、時間、對手、主客、場地與集合備註。隊員在同一個分頁看得到接下來的比賽並可加到 Google 日曆；打完的比賽在「成績」分頁。比賽當天紀錄員在「紀錄比賽」用「從賽程帶入」選這場，資料自動填好、比賽ID 沿用。排定但還沒記錄的比賽不會算進任何統計。'],
  ['三游穿越安打的落點要填三壘還是左外野？', '都不是：落點記「處理球的人」，沒人碰到的穿越球就填縫隙代碼——56 三游、46 二游（中間）、34 一二、78 左中、89 右中。紀錄比賽頁的落點區有「穿越／落地的縫隙」按鈕。出局一律填處理球的守備員 1–9（例如三游之間被游擊手接到就是 6）。'],
  ['一個人守很多位置，名單守位怎麼填？', '名單的主／副守位除了 P、C、1B…RF，也可以選 IF 內野手、OF 外野手、UT 工具人。比賽時每個打席的守位仍記當場實際站的位置。'],
  ['要先排陣容再開始記？', '登入後到「先發陣容」：先選這份陣容是哪一場，球場圖上每個守位有下拉選單選人，右邊排打序（可按「依守位填入」），再在「板凳（今天有到）」點選到場但沒先發的人。陣容存在這台裝置，開「紀錄比賽」時自動帶入那一場；也能複製成文字貼到群組。'],
  ['板凳、換人和當日登錄名單？', '從「先發陣容」帶到「紀錄比賽」後，換投、代打／換人會先列出板凳，被換下場的人預設不能再上（這場允許的話勾「允許再上場」）。「換人」可以選任一棒，我隊守備時也能用（守備調動；不選人就是只改守位）。每次換人都會記下，存檔時連同先發與板凳一起存成這場的當日登錄名單：到「比賽」點那一場，在「攻守成績」最下方看先發、替補上場與未上場。以前的比賽沒有名單，先發與替補由打席紀錄推定；紀錄員可以在「修改資料」的「登錄名單」分頁補上或修正。'],
  ['報名名單怎麼用？', '到「球員」頁展開名單，按「報名名單」：每個杯賽每年一份（例如 2026 大專盃），紀錄員按「新增報名名單」選年度、杯賽，點選報名的球員後儲存。之後「先發陣容」與「紀錄比賽」選到那個杯賽的比賽時只列出名單上的人；沒有名單的杯賽（例如友誼賽）照常列出全隊。上方篩選選了杯賽時，球員名單可以切換「全部球員／報名名單」，報名的人會標「已報名」。'],
  ['紀錄時怎麼知道現在是在記打擊還是投球？', '最上方的計分條往下捲也一直在：比分、局數、好壞球、出局、壘包都在上面，左下角的標籤寫「我隊打擊」或「我隊守備」（記我隊投手對每一棒）。局面一有變化計分條會閃一下；每送出一個動作，畫面下方會出現一句摘要（例如「蘇柏愷 一安・得 1 分・1：0」），記錯就按旁邊的「復原」。對方球員預設只記第幾棒（想記姓名見下面「要不要記對方打者姓名？」）。想專心記可按「全螢幕」；大太陽下看不清楚就按「大字」，按鈕和字會放大一級（這台裝置會記住）。'],
  ['比賽時間怎麼記？', '不用另外記：在「紀錄比賽」記第一球時，網站就記下時間，按鈕下方會出現「13:07 開賽」；最後一個打席的時間也會記下。按「結束比賽」時，開賽、結束時間會自動帶入並算出比賽時間（例如 2 小時 15 分），可以修改；看影片補記的話，請改成實際的時間。比賽頁標題下會顯示「13:07–15:22・2 小時 15 分」。之後也能在「修改資料」的比賽資訊改開賽時間與結束時間。'],
  ['對方投手左右投？', '我隊第一次打擊時，紀錄畫面上方會問「對方投手是？」：點「左投」或「右投」就好，也可以按「填姓名」，或按「不記」這場就不再問。之後我隊每個打席都會記上這位投手；對方換投時，點「代打」旁邊的「對方 右投」按鈕，改成新的投手（遇過的投手點一下就能帶入）。記這個是為了之後看「對左投／對右投」的成績。記錯了，到「修改資料」點那個打席改「對方投手」，會一起改到同一位投手的打席。雲端要先由管理員在 Supabase 執行一次 supabase/migrations/2026-10-14_record_fields.sql，執行前紀錄畫面不會問。'],
  ['要不要記對方打者姓名？', '選填，預設不記：只記對方第幾棒，和以前一樣。想記的話，在「紀錄比賽」開始前勾「記對方打者姓名」，可以先填對方打序（也能按「帶入上次對這隊的打序」），或比賽中在「對方第 3 棒」下面按「＋填姓名」補；比賽中改名字就是代打，前面的打席不會變。注意：記下的姓名和其他資料一樣是公開的，不用登入就看得到，建議只記背號，例如「12號」。'],
  ['中繼怎麼記？', '按「結束比賽」時，勝投／敗投／救援下面有「中繼」：點選拿到中繼的投手，可以複選，也可以不選。同一位投手只能是勝投、中繼、救援其中一個，選成勝投或救援的人會變灰。之後也能在「比賽」→「修改資料」的比賽資訊修改。'],
  ['紀錄時怎麼知道有沒有存到雲端？', '按鈕下方的狀態列：綠點「已同步到雲端」＝最新一球已經在雲端；黃點「尚未同步…」＝剛按的還在送（約 1 秒）；紅字「同步失敗」＝網路斷了，最新進度只在這台手機，按「重試儲存」就好。每按一下（包括壞球、盜壘、改打點）都會自動同步，即時比分頁也會跟著更新。'],
  ['暴投、盜壘這種投球之間的跑壘怎麼記？', '點計分條上的壘包（或「壘上跑者」）打開跑者面板，點跑者、再點發生的事（盜壘、暴投進壘、牽制出局…），一下就完成；暴投、捕逸讓所有跑者都進一壘的話，直接按投球按鈕下方的「暴投」「捕逸」。每一筆都會記在第幾球之後，逐球紀錄裡看得到「B  暴投 1B→2B  S  盜壘 2B→3B」。賽後在「比賽」→「修改資料」點一個打席，也能在「逐球」選第幾球後、哪位跑者、發生什麼來補記或刪除。安打時跑者（或打者）趁傳多跑的壘：在「跑者去向」把他設到比預設更遠的壘，旁邊會出現「趁傳？」，點一下標成趁傳進壘（修改資料的壘上跑者也一樣）。'],
  ['延長賽突破僵局怎麼記？', `預設從第 ${TEAM.innings + 1} 局起（規定局數的下一局），每個半局一開始一、二壘有人、無人出局；一壘跑者是這局第一位打者的前一棒，二壘是前兩棒。打到那一局時，紀錄畫面會先出現「延長賽突破僵局」卡片列出誰上哪一壘，按「放上跑者」就排好（按「復原」可以收回）；這局不用就按「這局不用」。從第幾局開始、放哪幾壘（一、二壘／二壘／滿壘），開賽前在比賽資訊的「突破僵局」「放哪幾壘」改，比賽中在卡片上按「改規則」。這些跑者不算打席；他跑回來算他的得分，打回他的人照算打點；對方的突破僵局跑者回來得分，一律算非自責分（也不算失誤）。賽後在「修改資料」延長局的標題按「＋ 突破僵局跑者」可以補上（按鈕出現在第 5 局之後、平手打進來的局），點那位跑者可以改名字、代跑或刪除。`],
  ['投手犯規怎麼記？', '壘上有人時才有投手犯規（壘上沒人時的違規投球照規則記一個壞球）。點計分條上的壘包打開跑者面板，按最上面的「投手犯規・全部進壘」：所有跑者各進一壘，這一球不算好壞球，打席繼續。我隊投手的投手犯規次數（BK）在「投球」頁的「進階」看得到；被投手犯規推進回來的分算自責分，沒有打點，也不算盜壘。賽後在「修改資料」的「逐球」選「投手犯規」補記，會一次移動所有跑者。'],
  ['讀取錯誤或記錯了，要怎麼改？', '到「比賽」點那一場，按右上角「修改資料」：比賽資訊、每個打席、守備都能直接改、增刪列，儲存後所有統計立即重算。雲端模式需先登入。也可以改總表後重傳（取代模式）。'],
  ['同一場比賽改了資料要重傳？', '上傳時選「以此檔取代雲端全部資料」會用總表覆蓋雲端；「合併」只會加入新的比賽ID。'],
  ['球員名字打錯了、要加新人或有人離隊？', '紀錄員登入後到「球員」頁展開名單，按「編輯名單」：可以新增、改背號守位、改名（所有紀錄會一起改）、把狀態改成離隊或畢業，或按「匯入 Excel」整份名冊套進來（同名以檔案為準、空白欄位保留舊值，會先顯示差異再套用）。'],
  ['ERA 為什麼是 7 局換算？', '社會組／校際多為 7 局制。可在「設定」工作表或網站的資料匯入頁改成 9。'],
  ['誰可以上傳？', '只有「紀錄員名單」上的人能寫入；其他人不用登入就能看。新紀錄員請現有紀錄員在「資料匯入」頁的紀錄員名單加入 email，對方會拿到一組 10 碼邀請碼；再用登入框的「第一次使用」輸入 email、邀請碼並設定密碼。忘記密碼請紀錄員按「重發邀請碼」。'],
  ['快速登入怎麼用？', '紀錄員（用自己帳號登入的）到「資料匯入」頁的「快速登入」卡片設一組密碼（至少 6 個字），告訴要紀錄的人。對方在登入框選「快速登入」輸入它，那台裝置就能紀錄、修改比賽一段時間（可選 1／7／30／90 天或永久），但不能管理紀錄員名單。每小時全隊合計只能輸錯 10 次；換密碼或關閉時，所有快速登入的裝置都會登出。'],
  ['登錄名單存不進雲端、報名名單說要管理員執行 SQL？', '雲端資料庫還沒加上當日登錄名單與報名名單。管理員到 Supabase 的 SQL Editor 執行一次 supabase/migrations/2026-09-26_rosters.sql（重複執行也安全，步驟見 docs/SUPABASE_SETUP.md）。執行前比賽照常紀錄與儲存，只是登錄名單不會存進雲端、報名名單無法使用。'],
]

export function GuidePage() {
  return (
    <>
      <PageHeader title="使用指南" description="比賽當天怎麼記、賽後怎麼把資料變成全隊看得到的數據。整個流程只需要一份 Excel 總表和這個網站。"
        actions={<img src={teamAsset(TEAM.logo)} alt={TEAM.short} className="h-14 w-auto rounded-[var(--radius-sm)] bg-white border border-border p-1" onError={(e) => { e.currentTarget.style.display = 'none' }} />} />

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
          <div className="mb-4 rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2 leading-relaxed"><span className="font-medium text-ink">不想用 Excel？</span>紀錄員登入後，直接到「<PageLink to="/record">紀錄比賽</PageLink>」頁逐球點按：局數、出局、壘上、得分、結果代碼都會自動寫好，賽後按「結束比賽」就存進資料庫，全隊即時看到。</div>
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
            <div className="text-xs font-medium text-ink mt-2">自責分怎麼判定</div>
            <div className="text-xs text-ink-2 leading-relaxed">
              在「紀錄比賽」和「修改資料」裡，系統會自動判定（棒球規則 9.16）：把這半局「沒有失誤、沒有捕逸」重打一次，在三出局前回本壘的分才是自責分。所以
              靠失誤、捕手妨礙上壘的打者，或靠捕逸、失誤才不死三振上壘的打者，得分都是非自責；靠失誤或捕逸多跑的壘才回本壘的，通常也是非自責；
              失誤讓這局該結束卻沒結束（例如兩出局後的失誤），之後的失分全部非自責。暴投、盜壘、保送造成的失分仍算自責。
              換投時，後援投手不能算前面錯過的出局機會；跑者算在讓他上壘的投手身上。
              系統沒辦法知道的情況（例如漏接界外飛球讓打者多了機會），請自己點一下該分改成自責或非自責，系統之後不會再改它。
            </div>
          </div>
        </Card>

        <Card title="3. 比賽後" subtitle="約 10 分鐘">
          <ol className="flex flex-col gap-4">
            <Step n={1} title="檢查單場-摘要">它會自動算出當場的逐局比分、每個人的打擊與投球成績。核對 R/H/E 跟記分板一致，順便在守備區塊填每個人的 PO / A / E（至少填失誤；沒填的 PO／A 網站會由投球紀錄推定）。</Step>
            <Step n={2} title="貼回三張紀錄表">把「單場-打擊」有資料的列（A 欄到「對方投手慣用」欄，最後一個黃色欄；灰色自動欄不用）複製，到「打席紀錄」最後一列下方<strong className="font-medium text-ink">貼上值</strong>；「單場-投球」貼到「投球紀錄」；守備區塊貼到「守備紀錄」。「總表」立刻更新。</Step>
            <Step n={3} title="上傳到網站"><PageLink to="/import">資料匯入</PageLink> → 紀錄員登入 → 拖入檔案 → 「合併（略過重複的比賽ID）」。整份總表、只含三張「單場-」工作表的檔案、或舊格式的單場紀錄表都可以，網站會自動辨識並算出一樣的數據。</Step>
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
            <li className="flex gap-2.5"><span className="mt-px shrink-0"><PageChip name="總覽" /></span><span>戰績、得失分、OPS 走勢、逐局得失分、落點熱區。上方篩選列可以只看某個杯賽、某段期間、某個對手或主客場。</span></li>
            <li className="flex gap-2.5"><span className="mt-px shrink-0 inline-flex gap-1"><PageChip name="打擊" /><PageChip name="投球" /></span><span>三組欄位：基本（AVG/OBP/SLG）、進階（wOBA、ISO、BABIP、得點圈）、過程（Whiff%、CSW%、GB/FB/LD%、Hard%）。點欄位標題排序，點球員進個人檔案。</span></li>
            <li className="flex gap-2.5"><span className="mt-px shrink-0"><PageChip name="比賽" /></span><span>點任一場：逐局比分、Box Score、當日登錄名單（先發／替補上場／未上場），以及「逐打席・打擊／投球」完整的逐球紀錄。</span></li>
            <li className="flex gap-2.5"><span className="mt-px shrink-0"><PageChip name="球員" /></span><span>個人數據、隊內百分位雷達、落點分佈、逐場紀錄與累積走勢；展開名單可看各杯賽的報名名單。</span></li>
            <li className="flex gap-2.5"><span className="mt-px shrink-0"><PageChip name="數據字典" /></span><span>每一項指標的定義與公式，和總表的「數據字典」工作表一致。</span></li>
          </ul>
        </Card>
      </div>

      <Card title="常見問題">
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          {FAQ.map(([q, a]) => (<div key={q}><dt className="text-[13px] font-medium text-ink">{q}</dt><dd className="text-[13px] text-ink-2 mt-1 leading-relaxed break-words">{withPageLinks(a)}</dd></div>))}
        </dl>
      </Card>
    </>
  )
}
