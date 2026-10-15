// batch 18: the two questions the 紀錄比賽 pitch pad waits for — the opponent pitcher's hand (左投／右投／不知道) while we
// bat, and their batter's side (左打／右打／不知道) while they bat. The scripts answer them before pitching; `hand` /
// `bats` are the button to press when asked (default 不知道, which stores nothing, so the answer keys stay the same).
// Returns what happened to the batter question: 'asked' (pressed), 'prefilled' (his slot had one), or null (not shown).
export async function answerAsks(p, main, { hand = '不知道', bats = '不知道' } = {}) {
  const strip = main.getByRole('group', { name: '對方投手左右投' })
  if (await strip.count()) { await strip.getByRole('button', { name: hand, exact: true }).click(); await p.waitForTimeout(150) }
  const chips = main.getByRole('group', { name: '對方打者左打或右打' })
  if (!(await chips.count())) return null
  if (await chips.locator('[aria-pressed="true"]').count()) return 'prefilled'
  await chips.getByRole('button', { name: bats, exact: true }).click(); await p.waitForTimeout(150)
  return 'asked'
}
