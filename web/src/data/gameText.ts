/**
 * Plate appearances in plain words (「中外野飛球出局」, 「揮棒落空三振」), shared by the 紀錄比賽 screen (this batter's
 * earlier plate appearances today) and the game pages. One table, so the wording is the same everywhere.
 */

/** Where the ball went, by 落點 code: the fielder 1–9, or the gap a ball nobody touched went through. */
export const WHERE: Record<number, string> = {
  1: '投手', 2: '捕手', 3: '一壘', 4: '二壘', 5: '三壘', 6: '游擊', 7: '左外野', 8: '中外野', 9: '右外野',
  56: '三游間', 46: '二游間', 34: '一二壘間', 78: '左中間', 89: '右中間',
}

/** A result in plain words; `pitches` decides how a strikeout ended (揮棒落空 / 看好球). */
export function resultPhrase(result: string, loc?: number, traj?: string, pitches?: string[]): string {
  const W = (loc && WHERE[loc]) || ''
  switch (result) {
    case '一安': return W ? `${W}安打` : '一壘安打'
    case '內安': return `${W}內野安打`
    case '二安': return `${W}二壘安打`
    case '場地二安': return `${W}場地二壘安打`
    case '三安': return `${W}三壘安打`
    case '全壘打': return `${W}全壘打`
    case '內滾': return `${W || '內野'}滾地球出局`
    case '雙殺': return W + (traj === 'L' ? '平飛球雙殺' : traj === 'F' || traj === 'P' ? '飛球雙殺' : '滾地球雙殺')
    case '內飛': return `${W || '內野'}飛球出局`
    case '外飛': return traj === 'L' ? `${W}平飛球出局` : `${W || '外野'}飛球出局`
    case '界外飛': return `${W}界外飛球出局`
    case '犧觸': case '犧牲': return `${W}犧牲觸擊`
    case '犧飛': return `${W}犧牲飛球`
    case '野選': return `${W}野手選擇`
    case '失誤': return `${W}失誤上壘`
    case '三振': {
      const last = pitches?.[pitches.length - 1]
      return last === 'SS' ? '揮棒落空三振' : last === 'CS' || last === 'S' ? '看好球三振' : '三振'
    }
    case '保送': return '四壞球保送'
    case '故四': return '故意四壞'
    case '觸身': return '觸身球'
    case '妨礙': return '捕手妨礙上壘'
    case '突破僵局': return '突破僵局上壘'
    default: return result
  }
}
