/**
 * Import a roster from any spreadsheet: finds the header row, maps columns by synonyms, normalizes
 * positions / hands, and merges into the existing roster with "newest file wins for filled cells".
 */
import * as XLSX from 'xlsx'
import type { Player } from './types'

export interface RosterImportResult { players: Player[]; sheet: string; mapping: Record<string, string>; warnings: string[] }
export interface RosterMerge { players: Player[]; added: string[]; updated: Array<{ name: string; changes: string[] }>; unchanged: number }

type Field = 'number' | 'name' | 'primaryPos' | 'secondaryPos' | 'bats' | 'throws' | 'status' | 'note'
const SYNONYMS: Record<Field, string[]> = {
  number: ['背號', '號碼', '球衣號碼', '背番号', 'no', 'no.', 'number', '#', '號'],
  name: ['姓名', '名字', '球員', '球員姓名', '選手', 'name', 'player'],
  primaryPos: ['主守位', '守位', '守備位置', '位置', '主要守位', 'pos', 'position', '守備'],
  secondaryPos: ['副守位', '次守位', '第二守位', '兼守', 'pos2', 'secondary'],
  bats: ['打擊慣用', '打擊', '打', '打擊手', 'bats', 'bat', '左右打'],
  throws: ['投球慣用', '投球', '投', '投球手', 'throws', 'throw', '左右投'],
  status: ['狀態', '身分', '身份', 'status', '在隊'],
  note: ['備註', '註', 'note', 'notes', 'remark', '備注'],
}
const POS_ALIASES: Record<string, string> = {
  投手: 'P', 捕手: 'C', 一壘: '1B', 一壘手: '1B', 二壘: '2B', 二壘手: '2B', 三壘: '3B', 三壘手: '3B', 游擊: 'SS', 游擊手: 'SS', 遊擊: 'SS', 遊擊手: 'SS',
  左外野: 'LF', 左外: 'LF', 中外野: 'CF', 中外: 'CF', 右外野: 'RF', 右外: 'RF', 指定打擊: 'DH', 外野: 'OF', 內野: 'IF',
  '1': 'P', '2': 'C', '3': '1B', '4': '2B', '5': '3B', '6': 'SS', '7': 'LF', '8': 'CF', '9': 'RF',
}
const VALID_POS = new Set(['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'OF', 'IF', 'UT'])

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, '')
export function normalizePos(v: unknown): string | undefined {
  const t = String(v ?? '').trim()
  if (!t) return undefined
  if (POS_ALIASES[t]) return POS_ALIASES[t]
  const u = t.toUpperCase().replace(/\s+/g, '')
  if (VALID_POS.has(u)) return u
  // "SS/2B" → first token
  const first = u.split(/[/、,，]/)[0]
  if (VALID_POS.has(first)) return first
  if (POS_ALIASES[first]) return POS_ALIASES[first]
  return t
}
export function normalizeHand(v: unknown): Player['bats'] | undefined {
  const t = String(v ?? '').trim().toUpperCase()
  if (!t) return undefined
  if (t === 'S' || t === 'B' || /左右|雙|兩/.test(t) || t === 'SWITCH') return 'S'
  if (t === 'L' || /左/.test(t) || t === 'LEFT') return 'L'
  if (t === 'R' || /右/.test(t) || t === 'RIGHT') return 'R'
  return undefined
}

function detectHeader(rows: unknown[][]): { index: number; map: Partial<Record<Field, number>> } | null {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i] ?? []
    const map: Partial<Record<Field, number>> = {}
    row.forEach((cell, c) => {
      const h = norm(cell)
      if (!h) return
      for (const [field, names] of Object.entries(SYNONYMS) as Array<[Field, string[]]>) {
        if (map[field] === undefined && names.some((n) => norm(n) === h)) { map[field] = c; return }
      }
    })
    if (map.name !== undefined) return { index: i, map }
  }
  return null
}

export function parseRosterWorkbook(data: ArrayBuffer): RosterImportResult {
  const wb = XLSX.read(new Uint8Array(data), { type: 'array' })
  const sheetName = wb.SheetNames.find((n) => /球員|名單|roster|名冊/i.test(n)) ?? wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
  const hdr = detectHeader(grid)
  const warnings: string[] = []
  if (!hdr) {
    // no recognizable header: assume first column is name, second is number if numeric
    warnings.push('沒找到「姓名」欄位標題，改以第一欄為姓名、第二欄為背號')
    const players = grid.map((r) => ({ name: String(r[0] ?? '').trim(), number: /^\d+$/.test(String(r[1] ?? '').trim()) ? String(r[1]).trim() : undefined })).filter((p) => p.name && !/姓名|名字/.test(p.name))
    return { players, sheet: sheetName, mapping: { 姓名: 'A', 背號: 'B' }, warnings }
  }
  const players: Player[] = []
  const seen = new Set<string>()
  for (const row of grid.slice(hdr.index + 1)) {
    const get = (f: Field) => (hdr.map[f] === undefined ? undefined : row[hdr.map[f]!])
    const name = String(get('name') ?? '').trim()
    if (!name) continue
    if (seen.has(name)) { warnings.push(`檔案裡「${name}」出現兩次，以後面那筆為準`); players.splice(players.findIndex((p) => p.name === name), 1) }
    seen.add(name)
    const numRaw = get('number'); const number = numRaw === undefined || numRaw === '' ? undefined : String(numRaw).trim().replace(/^#/, '')
    players.push({
      name, number, primaryPos: normalizePos(get('primaryPos')), secondaryPos: normalizePos(get('secondaryPos')),
      bats: normalizeHand(get('bats')), throws: normalizeHand(get('throws')),
      status: String(get('status') ?? '').trim() || undefined, note: String(get('note') ?? '').trim() || undefined,
    })
  }
  const labels: Record<Field, string> = { number: '背號', name: '姓名', primaryPos: '主守位', secondaryPos: '副守位', bats: '打擊慣用', throws: '投球慣用', status: '狀態', note: '備註' }
  const mapping: Record<string, string> = {}
  for (const [f, c] of Object.entries(hdr.map) as Array<[Field, number]>) mapping[labels[f]] = String(grid[hdr.index][c] ?? XLSX.utils.encode_col(c))
  if (!players.length) warnings.push('工作表裡沒有任何球員列')
  return { players, sheet: sheetName, mapping, warnings }
}

/** Merge: same name → the file's filled cells win, blanks keep the old value; new names appended; others untouched. */
export function mergeRoster(existing: Player[], incoming: Player[]): RosterMerge {
  const byName = new Map(existing.map((p) => [p.name, p]))
  const players = existing.map((p) => ({ ...p }))
  const added: string[] = []
  const updated: Array<{ name: string; changes: string[] }> = []
  const fields: Array<[keyof Player, string]> = [['number', '背號'], ['primaryPos', '主守位'], ['secondaryPos', '副守位'], ['bats', '打擊'], ['throws', '投球'], ['status', '狀態'], ['note', '備註']]
  for (const inc of incoming) {
    const cur = byName.get(inc.name)
    if (!cur) { players.push({ ...inc, status: inc.status ?? '現役' }); added.push(inc.name); continue }
    const target = players.find((p) => p.name === inc.name)!
    const changes: string[] = []
    for (const [k, label] of fields) {
      const v = inc[k]
      if (v === undefined || v === '') continue
      if (target[k] !== v) { changes.push(`${label} ${target[k] ?? '—'} → ${v}`); (target as Record<string, unknown>)[k] = v }
    }
    if (changes.length) updated.push({ name: inc.name, changes })
  }
  return { players, added, updated, unchanged: incoming.length - added.length - updated.length }
}
