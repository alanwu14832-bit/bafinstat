// 網站版本: record a newly saved copy in v/versions.json (newest first), keep the latest KEEP copies and delete the
// folders of older ones. Used by the 保存這一版 step of .github/workflows/auto-deploy.yml:
//   node archive-index.mjs <dir with v/> <id> <date> <sha> <note>
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const KEEP = 30
const [root, id, date, sha, note] = process.argv.slice(2)
const v = join(root, 'v')
const file = join(v, 'versions.json')
let list = []
try { list = JSON.parse(readFileSync(file, 'utf8')) } catch { list = [] }
list = [{ id, date, sha, note }, ...list.filter((x) => x && x.id !== id && existsSync(join(v, x.id)))].slice(0, KEEP)
const keep = new Set(list.map((x) => x.id))
for (const d of readdirSync(v, { withFileTypes: true })) if (d.isDirectory() && !keep.has(d.name)) rmSync(join(v, d.name), { recursive: true, force: true })
writeFileSync(file, JSON.stringify(list, null, 1))
console.log(`versions.json: ${list.length} versions, newest ${id}`)
