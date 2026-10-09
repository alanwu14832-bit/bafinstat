import { lineupCard, type Lineup } from '../../record/lineup'
import type { Game, Player } from '../../data/types'
import { TEAM_NAME } from '../../data/seed'
import { TEAM } from '../../config/team'

const SLOT_POS: Record<string, string> = { P: '投手', C: '捕手', '1B': '一壘', '2B': '二壘', '3B': '三壘', SS: '游擊', LF: '左外野', CF: '中外野', RF: '右外野', DH: '指定打擊' }

/** One card: 先發名單 with the nine, the pitcher who does not bat under a DH, the bench and a signature line. Our own
 *  dugout's card, not an official lineup form. */
function Card({ lineup, roster, game, subs }: { lineup: Lineup; roster: Player[]; game?: Game; subs: boolean }) {
  const card = lineupCard(lineup, roster)
  return (
    <section className="lineup-card" data-testid="lineup-card">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '0.5mm solid #222', paddingBottom: '1.5mm' }}>
        <div>
          <h1 style={{ fontSize: '16pt' }}>先發名單</h1>
          <div style={{ fontSize: '12pt', fontWeight: 600 }}>{TEAM_NAME}{game ? ` vs ${game.opponent}` : ''}</div>
        </div>
        <div className="muted" style={{ textAlign: 'right' }}>
          {game ? <>{game.date}{game.time ? ` ${game.time}` : ''}<br />{[game.tournament, game.homeAway === '主' ? '主場（後攻）' : '客場（先攻）', game.venue].filter(Boolean).join('・')}</> : <>日期 ____________<br />{TEAM.org}</>}
        </div>
      </header>
      <table>
        <thead>
          <tr><th style={{ width: '12mm' }}>棒次</th><th style={{ width: '14mm' }}>背號</th><th style={{ textAlign: 'left' }}>姓名</th><th style={{ width: '26mm' }}>守位</th>{subs && <th style={{ width: '62mm' }}>替補（局・姓名・守位）</th>}</tr>
        </thead>
        <tbody>
          {card.rows.map((r) => (
            <tr key={r.order}>
              <td style={{ textAlign: 'center', fontWeight: 700 }}>{r.order}</td>
              <td style={{ textAlign: 'center' }}>{r.number ?? ''}</td>
              <td style={{ fontWeight: 600 }}>{r.name}</td>
              <td>{r.pos ? `${r.pos} ${SLOT_POS[r.pos] ?? ''}` : ''}</td>
              {subs && <td />}
            </tr>
          ))}
          {card.pitcher && (
            <tr>
              <td style={{ textAlign: 'center', fontSize: '9pt' }} colSpan={1}>—</td>
              <td style={{ textAlign: 'center' }}>{card.pitcher.number ?? ''}</td>
              <td style={{ fontWeight: 600 }}>{card.pitcher.name}</td>
              <td>投手（不打擊）</td>
              {subs && <td />}
            </tr>
          )}
        </tbody>
      </table>
      <div><span style={{ fontWeight: 700 }}>板凳　</span>{card.bench.length ? card.bench.map((b) => `${b.number ? `${b.number} ` : ''}${b.name}`).join('、') : '—'}</div>
      <div style={{ marginTop: 'auto', textAlign: 'right' }}>教練簽名 ________________</div>
    </section>
  )
}

/** 陣容卡 (A4 portrait): one card, or two with a dashed cut line between them. */
export function LineupCard({ lineup, roster, game, copies, subs }: { lineup: Lineup; roster: Player[]; game?: Game; copies: 1 | 2; subs: boolean }) {
  return (
    <article className="paper portrait" aria-label="陣容卡" style={{ fontSize: '11pt' }}>
      {Array.from({ length: copies }, (_, i) => <Card key={i} lineup={lineup} roster={roster} game={game} subs={subs} />)}
    </article>
  )
}
