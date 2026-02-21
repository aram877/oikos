/**
 * Copies sqlite3.wasm from node_modules → public/sqlite3.wasm
 *
 * Only needed as a FALLBACK if webpack's asyncWebAssembly fails to load
 * the WASM inside the Web Worker. If you hit a "WASM load failed" error:
 *
 *   1. node scripts/copy-wasm.mjs
 *   2. In db.worker.ts, change the init() call to:
 *        await init({ locateFile: (f) => '/' + f })
 *      (older versions of the API support this option)
 */

import { copyFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src  = resolve(root, 'node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm')
const dest = resolve(root, 'public/sqlite3.wasm')

if (!existsSync(src)) {
  console.error('ERROR: sqlite3.wasm not found. Run: npm install @sqlite.org/sqlite-wasm')
  process.exit(1)
}

mkdirSync(resolve(root, 'public'), { recursive: true })
copyFileSync(src, dest)
console.log('✓ Copied dist/sqlite3.wasm → public/sqlite3.wasm')
console.log('  Add `locateFile: (f) => "/" + f` to init() in db.worker.ts if needed.')
