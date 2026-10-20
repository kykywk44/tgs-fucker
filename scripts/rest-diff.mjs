// Finds drawing bugs the motion compiler introduced: frame 0 of exports/<name>.tgs (the sticker at
// rest) must look exactly like the static sketch with its hidden parts hidden. Renders both with
// tlottie at 2× and reports where they differ.
//   node scripts/rest-diff.mjs <name>  → exports/sheets/<name>.rest-diff.png, regions on stdout
// The sketch side reads exports/<name>.sketch.base.json, written by `node scripts/motion.mjs <name>`.

import { readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { Canvas, ROOT, encodePng, engine, load } from './lib/sheets.mjs'

const { readTgs } = await load('src/core/tgs.ts')
const name = basename(process.argv[2] ?? '')
if (!name) {
  console.error('usage: node scripts/rest-diff.mjs <name>')
  process.exit(1)
}
const N = 1024, CELL = 16, THRESHOLD = 48

const spec = JSON.parse(await readFile(join(ROOT, 'stickers', name, 'motion.json'), 'utf8'))
const sketch = JSON.parse(await readFile(join(ROOT, 'exports', `${name}.sketch.base.json`), 'utf8'))
const anim = await readTgs(await readFile(join(ROOT, 'exports', `${name}.tgs`)))

// hide the rig's hidden parts in the sketch, as the compiler does
const globs = Object.entries(spec.rig ?? {}).filter(([, e]) => e.hidden).map(([p]) => new RegExp(`^${p.split('*').join('.*')}$`))
const hide = (items) => {
  for (const it of items ?? []) {
    if (it.ty !== 'gr') continue
    if (it.nm && globs.some((g) => g.test(it.nm))) {
      const tr = it.it.find((x) => x.ty === 'tr')
      if (tr) tr.o = { a: 0, k: 0 }
    }
    hide(it.it)
  }
}
for (const l of sketch.layers) hide(l.shapes)
sketch.w ||= 512
sketch.h ||= 512

const eng = await engine()
const render = (a) => { const inst = eng.create(JSON.stringify(a)); const px = inst.render(0, N, N).slice(); inst.drop(); return px }
const a = render(sketch), b = render(anim)

// pixels that differ, on a white ground (premultiplied compare)
const over = (px, i, k) => (px[i + k] * px[i + 3] + 255 * (255 - px[i + 3])) / 255
const out = new Canvas(N, N)
const cells = new Map()
let total = 0
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4
    const d = Math.max(...[0, 1, 2].map((k) => Math.abs(over(a, i, k) - over(b, i, k))))
    const g = Math.round((over(b, i, 0) + over(b, i, 1) + over(b, i, 2)) / 3)
    out.set(x, y, [g, g, g], 1)
    if (d > THRESHOLD) {
      out.set(x, y, [230, 30, 30], 1)
      total++
      const key = `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`
      cells.set(key, (cells.get(key) ?? 0) + 1)
    }
  }
}
await writeFile(join(ROOT, 'exports', 'sheets', `${name}.rest-diff.png`), encodePng(out.px, N, N))

// group neighbouring cells into regions (canvas px at 1×)
const seen = new Set(), regions = []
for (const key of cells.keys()) {
  if (seen.has(key)) continue
  const stack = [key], cellsIn = []
  seen.add(key)
  while (stack.length) {
    const k = stack.pop(); cellsIn.push(k)
    const [cx, cy] = k.split(',').map(Number)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = `${cx + dx},${cy + dy}`
      if (cells.has(n) && !seen.has(n)) { seen.add(n); stack.push(n) }
    }
  }
  const xs = cellsIn.map((k) => +k.split(',')[0]), ys = cellsIn.map((k) => +k.split(',')[1])
  const px = cellsIn.reduce((s, k) => s + cells.get(k), 0)
  regions.push({ px, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs) + 1, Math.max(...ys) + 1].map((v) => (v * CELL * 512) / N) })
}
regions.sort((p, q) => q.px - p.px)
console.log(`${name}: ${total} differing px at 2× (${regions.length} regions) → exports/sheets/${name}.rest-diff.png`)
for (const r of regions.slice(0, 12)) console.log(`  ${String(r.px).padStart(6)} px  x ${r.box[0]}–${r.box[2]}  y ${r.box[1]}–${r.box[3]}`)
process.exit(total > 20 ? 1 : 0) // a few px are antialiasing
