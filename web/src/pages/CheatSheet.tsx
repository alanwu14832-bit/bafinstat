import { useMemo, type ReactNode } from 'react'
import { PenLine, Printer } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { CODE_HELP, CONTACT_HELP, CONTACT_RULE, contactShare, LOC_HELP, RESULT_HELP, TRAJ_HELP } from '../data/recordingHelp'
import { PITCH_BUTTONS, RESULT_GROUPS } from '../record/widgets'
import { RUNNER_EVENTS } from '../record/LiveParts'
import { useDataStore } from '../store/data'
import { ARCHIVE } from '../config/archive'

const pct = (x: number) => `${Math.round(x * 100)}%`

/** One numbered block; never split across the two printed columns. */
function Block({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid mb-4 print:mb-2.5 rounded-[var(--radius-sm)] bg-surface shadow-[var(--shadow-card)] print:shadow-none p-4 print:p-0">
      <h2 className="text-[15px] print:text-[12px] font-semibold text-ink mb-1.5 print:mb-1"><span className="tnum mr-1.5">{'①②③④⑤⑥⑦⑧⑨'[n - 1]}</span>{title}</h2>
      <div className="flex flex-col gap-1.5 print:gap-0.5">{children}</div>
    </section>
  )
}

const Term = ({ k, children }: { k: ReactNode; children: ReactNode }) => (
  <div className="flex gap-2 min-w-0"><span className="font-medium text-ink shrink-0">{k}</span><span className="text-ink-2 min-w-0">{children}</span></div>
)

/**
 * 紀錄員小抄 (/guide/cheatsheet): every button and code of 紀錄比賽 on one page, printed on one A4 sheet (two columns,
 * light, without the site's menus). Built from the same constants as the buttons, so it follows them.
 */
export function CheatSheetPage() {
  const base = useDataStore((s) => s.base)
  const share = useMemo(() => contactShare(base), [base])
  return (
    <>
      <PageHeader title="紀錄員小抄" description="紀錄比賽會用到的按鈕和代碼，印成一張 A4 帶到球場。"
        actions={<div className="flex items-center gap-2 print:hidden">
          <Button variant="primary" size="sm" icon={<Printer />} onClick={() => window.print()}>列印</Button>
          {!ARCHIVE && <Button variant="outline" size="sm" icon={<PenLine />} to="/record?practice=1">練習紀錄</Button>}
        </div>} />
      <div className="columns-1 md:columns-2 print:columns-2 gap-5 print:gap-6 text-[13px] print:text-[10.5px] leading-relaxed print:leading-snug text-ink-2">
        <Block n={1} title="紀錄流程">
          <ol className="list-decimal pl-5 flex flex-col gap-0.5">
            <li>點每一球（壞球、好球、界外…）</li>
            <li>打席結束時選打擊結果（三振、四壞會自動跳出）</li>
            <li>擊進場內的球點落點、軌跡、強度</li>
            <li>確認跑者去向後按「送出這個打席」</li>
          </ol>
          <p>記錯了：按計分條右邊的復原鍵（↶，一次退一步），或剛送出時跳出的提示上的「復原」。</p>
        </Block>
        <Block n={2} title="逐球按鈕">
          {PITCH_BUTTONS.map((b) => <Term key={b.code} k={<span className="tnum">{b.hint}</span>}>{b.label}</Term>)}
          <p>界外球在兩好球後也照按「界外」，不會變成三振。</p>
        </Block>
        <Block n={3} title="打擊結果">
          {RESULT_GROUPS.map((g) => <Term key={g.label} k={g.label}>{g.items.join('・')}</Term>)}
          <dl className="mt-1 flex flex-col gap-0.5">
            {RESULT_HELP.map(([k, v]) => <div key={k}><dt className="inline font-medium text-ink">{k}：</dt><dd className="inline">{v}</dd></div>)}
          </dl>
        </Block>
        <Block n={4} title="落點">
          <p>{LOC_HELP.rule}</p>
          <p className="tnum">{LOC_HELP.fielders.map(([n, l]) => `${n} ${l}`).join('・')}</p>
          <p className="tnum">縫隙：{LOC_HELP.holes.map(([n, l]) => `${n} ${l}`).join('・')}</p>
        </Block>
        <Block n={5} title="軌跡">
          {TRAJ_HELP.map(([k, v]) => <Term key={k} k={k}>{v}</Term>)}
        </Block>
        <Block n={6} title="強度：強／中／弱">
          {CONTACT_HELP.map(([k, v]) => <Term key={k} k={k}>{v}</Term>)}
          <p>{CONTACT_RULE}</p>
          {share.n > 0 && <p className="text-ink">本隊目前記錄：強 {pct(share.強)}・中 {pct(share.中)}・弱 {pct(share.弱)}（{share.n} 個場內球）{share.中 > 0.8 ? '：大多記成中了' : ''}</p>}
        </Block>
        <Block n={7} title="跑者面板（點計分條上的壘包）">
          <p>{RUNNER_EVENTS.map((e) => e.label).join('・')}</p>
          <Term k="投手犯規">按面板最上面的「投手犯規・全部進壘」：所有跑者各進一壘，打席繼續。壘上有人才有投手犯規；壘上無人的違規投球記一個壞球。</Term>
          <Term k="暴投／捕逸">我隊守備、所有跑者都進一壘：直接按逐球按鈕下面的「暴投」「捕逸」一鍵；只有部分跑者動（或我隊打擊時），就在面板點那位跑者再點「暴投進壘」「捕逸進壘」。</Term>
          <Term k="突破僵局">延長賽照規則放跑者：畫面會先出現卡片，按「放上跑者」；這局不用就按「這局不用」。</Term>
        </Block>
        <Block n={8} title="結果代碼（網站自動填）">
          {CODE_HELP.map(([k, v]) => <Term key={k} k={k}>{v}</Term>)}
        </Block>
        <Block n={9} title="常見情況">
          <Term k="界外飛球被接殺">記「界外飛」，最後一球是 IP，落點填接球的人。</Term>
          <Term k="安打＋失誤">結果選安打，跑者去向設到實際到的壘，旁邊點「失誤進壘」（我隊守備時再點誰失誤）。</Term>
          <Term k="不死三振">結果選三振，打者去向改成 1B。</Term>
          <Term k="對方換投">我隊打擊時點「代打」旁邊的「對方投手」按鈕（記過之後會寫「對方 右投」這樣），選左投／右投或填姓名。</Term>
          <Term k="換投、代打">我隊守備時按「換投」；代打、代跑、守備調動按「代打」或「換人」。</Term>
          <Term k="半局提早結束">盜壘或牽制出局造成第三個出局，網站會自動換局；手動結束按「結束半局」。</Term>
        </Block>
      </div>
    </>
  )
}
