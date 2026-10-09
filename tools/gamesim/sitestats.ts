// The site's own numbers for a dataset (what the 打擊／投球／守備 pages and the game list show), as JSON, so excel.mjs
// can hold the exported workbook's 總表 against them. Bundled by excel.mjs with web/'s esbuild.
import { readFileSync } from 'node:fs'
import { battingLines, fieldingLines, fipConstantFrom, pitchingLines, summarizeGame, teamBatting, teamPitching, teamSummary } from '../../web/src/data/stats'
import { DEFAULT_PARAMS, type Dataset } from '../../web/src/data/types'

const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const ds: Dataset = raw.base ?? raw
const P = { ...DEFAULT_PARAMS, fipConstant: fipConstantFrom(ds.pitching, DEFAULT_PARAMS.inningsPerGame) }
const sums = ds.games.map((g) => summarizeGame(ds, g))
console.log(JSON.stringify({
  bat: battingLines(ds, ds.batting, P), pit: pitchingLines(ds.pitching, ds.games, P), fld: fieldingLines(ds.fielding),
  tb: teamBatting(ds, ds.batting, P), tp: teamPitching(ds.pitching, P, ds.games), sums, team: teamSummary(sums),
}))
