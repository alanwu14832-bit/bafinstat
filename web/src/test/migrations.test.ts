/**
 * save_games() is defined in three places (schema.sql for new projects, and the two migrations people re-run on old
 * ones). Re-running an older file must never bring back a save_games() that forgets a column, so all three must be
 * the same function.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const supabase = (file: string) => readFileSync(resolve(process.cwd(), '..', 'supabase', file), 'utf8')
const saveGamesOf = (sql: string) => {
  const a = sql.indexOf('create or replace function save_games')
  const b = sql.indexOf('end $$;', a)
  if (a < 0 || b < 0) return ''
  return sql.slice(a, b + 'end $$;'.length).replace(/\s+/g, ' ').trim()
}

describe('save_games() in schema.sql and the migrations', () => {
  const schema = saveGamesOf(supabase('schema.sql'))
  const m13 = saveGamesOf(supabase('migrations/2026-10-13_save_games.sql'))
  const m14 = saveGamesOf(supabase('migrations/2026-10-14_record_fields.sql'))
  it('is the same function in all three files', () => {
    expect(schema).not.toBe('')
    expect(m13).toBe(schema)
    expect(m14).toBe(schema)
  })
  it('saves the end time', () => {
    expect(schema).toContain('end_time = excluded.end_time')
  })
})
