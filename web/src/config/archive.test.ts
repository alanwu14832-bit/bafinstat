import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = resolve(process.cwd(), 'scripts', 'archive-index.mjs')
const save = (root: string, id: string) => {
  mkdirSync(join(root, 'v', id), { recursive: true })
  writeFileSync(join(root, 'v', id, 'index.html'), id)
  execFileSync('node', [script, root, id, `date ${id}`, id.slice(-3), `note ${id}`])
}

describe('網站版本 (site-archive)', () => {
  it('lists the newest first, keeps 30 and deletes the folders of older ones', () => {
    const root = mkdtempSync(join(tmpdir(), 'site-archive-'))
    for (let i = 1; i <= 32; i++) save(root, `v${String(i).padStart(3, '0')}`)
    const list = JSON.parse(readFileSync(join(root, 'v', 'versions.json'), 'utf8')) as Array<{ id: string; note: string }>
    expect(list).toHaveLength(30)
    expect(list[0]).toMatchObject({ id: 'v032', note: 'note v032' })
    expect(list[29].id).toBe('v003')
    expect(existsSync(join(root, 'v', 'v002'))).toBe(false)
    expect(existsSync(join(root, 'v', 'v003'))).toBe(true)
    // saving the same version again does not list it twice
    save(root, 'v032')
    expect((JSON.parse(readFileSync(join(root, 'v', 'versions.json'), 'utf8')) as unknown[]).length).toBe(30)
  })
})
