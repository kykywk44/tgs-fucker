// Builds the index and thumbnails of the editor's «Эмодзи» tab (src/ui/Library.tsx):
//   library/emoji/*.tgs   Telegram's animated emoji, numbered 001…997 (library/README.md)
//   packs/blue/ready/*.tgs the finished blue pack, exports/blue/*.tgs its drafts (restyle.mjs output)
// → library/index.json, library/thumbs/<set>-<n>.png (sprites of THUMB px cells, CHUNK per sprite)
// A pack item made from a library emoji names it in packs/<pack>/<name>/recipe.json ("library": "167"),
// so the index marks that emoji as done. The finished pack is listed newest first: the reverse of
// packs/blue/emoji.txt, where each sticker added to the pack is appended. Read-only on the stickers.
// Usage: node scripts/library.mjs

import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Canvas, ROOT, encodePng, engine, load } from './lib/sheets.mjs'

const THUMB = 128
const COLS = 10
const CHUNK = COLS * COLS
const PROBE = 32 // px of the coverage probe that picks the thumbnail frame

const { readTgs } = await load('src/core/tgs.ts')

const SETS = [
  { id: 'emoji', title: 'Эмодзи Telegram', dir: 'library/emoji' },
  { id: 'blue', title: 'Синий пак · готово', dir: 'packs/blue/ready', order: 'packs/blue/emoji.txt' },
  { id: 'drafts', title: 'Синий пак · черновики', dir: 'exports/blue' },
]

// pack item name → library emoji it was made from
async function packSources() {
  const done = new Map() // library id → [pack/name]
  const byName = new Map() // name → library id
  for (const pack of await readdir(join(ROOT, 'packs'), { withFileTypes: true })) {
    if (!pack.isDirectory()) continue
    for (const item of await readdir(join(ROOT, 'packs', pack.name), { withFileTypes: true })) {
      const recipe = join(ROOT, 'packs', pack.name, item.name, 'recipe.json')
      if (!item.isDirectory() || !existsSync(recipe)) continue
      const { library } = JSON.parse(await readFile(recipe, 'utf8'))
      if (!library) continue
      // one emoji, or several ("library": ["153", "147"]) for a scene made of them
      for (const id of [library].flat()) done.set(id, [...(done.get(id) ?? []), `${pack.name}/${item.name}`])
      byName.set(item.name, [library].flat().join('+'))
    }
  }
  return { done, byName }
}

// The frame that shows the most of the drawing: some emoji start or end empty.
function bestFrame(inst) {
  const n = inst.frameCount
  let best = 0
  let most = -1
  for (const f of [0.5, 0.25, 0.75, 0].map((u) => Math.floor(u * n))) {
    const px = inst.render(f, PROBE, PROBE)
    let cover = 0
    for (let i = 3; i < px.length; i += 4) cover += px[i]
    if (cover > most * 1.15) { most = cover; best = f }
  }
  return best
}

const eng = await engine()
const { done, byName } = await packSources()
await rm(join(ROOT, 'library', 'thumbs'), { recursive: true, force: true })
await mkdir(join(ROOT, 'library', 'thumbs'), { recursive: true })

const index = { thumb: THUMB, cols: COLS, sets: [] }
for (const set of SETS) {
  const dir = join(ROOT, set.dir)
  const files = existsSync(dir) ? (await readdir(dir)).filter((f) => f.endsWith('.tgs')).sort() : []
  if (set.order) {
    // newest first; a file the list does not name goes last
    const lines = (await readFile(join(ROOT, set.order), 'utf8')).split(/\r?\n/).filter((l) => l && !l.startsWith('#'))
    const added = new Map(lines.map((l, n) => [`${l.split(' ', 1)[0]}.tgs`, n]))
    files.sort((a, b) => (added.get(b) ?? -1) - (added.get(a) ?? -1))
  }
  const items = []
  let sheet = null
  const flush = async () => {
    if (!sheet) return
    await writeFile(join(ROOT, 'library', 'thumbs', sheet.file), encodePng(sheet.canvas.px, sheet.canvas.width, sheet.canvas.height))
    sheet = null
  }
  for (const [i, file] of files.entries()) {
    const bytes = await readFile(join(dir, file))
    const id = file.replace(/\.tgs$/, '')
    const item = { id, file, nm: null, kb: Math.round((bytes.length / 1024) * 10) / 10, frames: 0 }
    if (i % CHUNK === 0) {
      await flush()
      const rows = Math.ceil(Math.min(CHUNK, files.length - i) / COLS)
      sheet = { file: `${set.id}-${i / CHUNK + 1}.png`, canvas: new Canvas(THUMB * COLS, THUMB * rows, [0, 0, 0]) }
      sheet.canvas.px.fill(0) // transparent
    }
    try {
      const anim = await readTgs(new Uint8Array(bytes))
      item.nm = typeof anim.nm === 'string' ? anim.nm : null
      const inst = eng.create(JSON.stringify(anim))
      if (inst) {
        item.frames = inst.frameCount
        const cell = i % CHUNK
        drawRgba(sheet.canvas, inst.render(bestFrame(inst), THUMB, THUMB), (cell % COLS) * THUMB, Math.floor(cell / COLS) * THUMB)
        inst.drop()
      }
    } catch (err) {
      item.error = String(err.message ?? err)
    }
    item.sprite = sheet.file
    item.cell = i % CHUNK
    if (set.id === 'emoji' && done.has(id)) item.done = done.get(id)
    if (set.id !== 'emoji' && byName.has(id)) item.from = byName.get(id)
    items.push(item)
  }
  await flush()
  index.sets.push({ id: set.id, title: set.title, dir: set.dir, items })
  console.log(`${set.id}: ${items.length} stickers, ${items.filter((it) => it.error || !it.frames).length} unreadable`)
}
await writeFile(join(ROOT, 'library', 'index.json'), JSON.stringify(index))
console.log('library/index.json, library/thumbs/')

// Copies straight-alpha RGBA into the sprite as is (Canvas.draw composites onto its background).
function drawRgba(canvas, rgba, ox, oy) {
  for (let y = 0; y < THUMB; y++) {
    canvas.px.set(rgba.subarray(y * THUMB * 4, (y + 1) * THUMB * 4), ((oy + y) * canvas.width + ox) * 4)
  }
}
