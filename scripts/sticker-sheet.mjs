// Renders stickers to PNG sheets for marking up their parts by hand (plan,
// Iteration 4). Read-only on the stickers; writes into exports/sheets/.
//
//   node scripts/sticker-sheet.mjs              # samples/*.tgs
//   node scripts/sticker-sheet.mjs a.tgs b.tgs  # explicit files
//
// Per sticker:
//   <name>.frames.png  six frames spread over the animation, as Telegram draws them
//   <name>.marks.png   three frames with every visible solid atom outlined and
//                      numbered (atom ids of src/core/atoms.ts, from the ID map)
//   <name>.effects.png the same for translucent atoms (highlights, glows, shadows)
//   <name>.atoms.txt   one line per atom: id, layer, group path, colours, visible size

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { runnerImport } from 'vite'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'exports', 'sheets')
const FRAME_PX = 256 // frames sheet cell
const MARK_PX = 512 // marks sheet cell
const MIN_LABEL_AREA = 40 // px at MARK_PX: smaller atoms get an outline but no number

async function load(path) {
  return (await runnerImport(join(ROOT, path), { configFile: false, logLevel: 'silent', root: ROOT })).module
}
const { readTgs } = await load('src/core/tgs.ts')
const { findAtoms } = await load('src/core/atoms.ts')
const { readColorSites } = await load('src/core/colors.ts')
const { decodeId, idColorize, translucentAtoms } = await load('src/core/idmap.ts')
const { loadEngine } = await load('src/player/engine.ts')

// ---------- PNG ----------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}
function encodePng(rgba, width, height) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 6, 0, 0, 0], 8) // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------- drawing ----------

class Canvas {
  constructor(width, height, bg = [255, 255, 255]) {
    this.width = width
    this.height = height
    this.px = new Uint8Array(width * height * 4)
    for (let i = 0; i < width * height; i++) this.px.set([...bg, 255], i * 4)
  }
  set(x, y, [r, g, b], a = 1) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const i = (y * this.width + x) * 4
    this.px[i] = this.px[i] * (1 - a) + r * a
    this.px[i + 1] = this.px[i + 1] * (1 - a) + g * a
    this.px[i + 2] = this.px[i + 2] * (1 - a) + b * a
  }
  // Straight-alpha RGBA image over a checkerboard, at (ox, oy).
  draw(rgba, size, ox, oy, dim = 0) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4
        const check = ((x >> 4) + (y >> 4)) % 2 ? 236 : 250
        const a = rgba[i + 3] / 255
        const mix = (c) => Math.round((c * a + check * (1 - a)) * (1 - dim) + 255 * dim)
        this.set(ox + x, oy + y, [mix(rgba[i]), mix(rgba[i + 1]), mix(rgba[i + 2])])
      }
    }
  }
  rect(x0, y0, w, h, color, a = 1) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, color, a)
  }
  text(str, x, y, color, scale = 2) {
    let cx = x
    for (const ch of str) {
      const glyph = FONT[ch]
      if (glyph) {
        glyph.forEach((row, gy) => {
          for (let gx = 0; gx < 3; gx++) if (row[gx] === '1') this.rect(cx + gx * scale, y + gy * scale, scale, scale, color)
        })
      }
      cx += 4 * scale
    }
  }
}

// 3×5 bitmap digits (and a few letters for headings).
const FONT = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'],
  f: ['011', '100', '110', '100', '100'], ' ': ['000', '000', '000', '000', '000'],
}

// A distinct, readable outline colour per atom.
function hue(id) {
  const h = (id * 137.508) % 360
  const f = (n) => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (0.55 - 0.45 * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return [f(0), f(8), f(4)]
}

// ---------- sheets ----------

const framesAt = (count, n) => Array.from({ length: n }, (_, i) => Math.floor((i * count) / n))

function framesSheet(engine, anim) {
  const inst = engine.create(JSON.stringify(anim))
  const frames = framesAt(inst.frameCount, 6)
  const sheet = new Canvas(FRAME_PX * 3, (FRAME_PX + 20) * 2)
  frames.forEach((frame, i) => {
    const ox = (i % 3) * FRAME_PX
    const oy = Math.floor(i / 3) * (FRAME_PX + 20)
    sheet.draw(inst.render(frame, FRAME_PX, FRAME_PX).slice(), FRAME_PX, ox, oy + 20)
    sheet.text(`f ${frame}`, ox + 4, oy + 4, [90, 90, 90])
  })
  inst.drop()
  return sheet
}

function marksSheet(engine, anim, atomCount, only) {
  const look = engine.create(JSON.stringify(anim))
  const ids = engine.create(JSON.stringify(idColorize(anim, { only })))
  const frames = framesAt(look.frameCount, 3).map((f) => f + Math.floor(look.frameCount / 6))
  const sheet = new Canvas(MARK_PX * 3, MARK_PX + 24)
  const visible = new Map() // id → max area over the sheet frames
  frames.forEach((frame, i) => {
    const ox = i * MARK_PX
    sheet.draw(look.render(frame, MARK_PX, MARK_PX).slice(), MARK_PX, ox, 24, 0.35)
    sheet.text(`f ${frame}`, ox + 4, 4, [90, 90, 90])
    const px = ids.render(frame, MARK_PX, MARK_PX, false).slice()
    const at = (x, y) => (x < 0 || y < 0 || x >= MARK_PX || y >= MARK_PX ? null
      : decodeId(px[(y * MARK_PX + x) * 4], px[(y * MARK_PX + x) * 4 + 1], px[(y * MARK_PX + x) * 4 + 2], px[(y * MARK_PX + x) * 4 + 3], atomCount))
    const stats = new Map()
    for (let y = 0; y < MARK_PX; y++) {
      for (let x = 0; x < MARK_PX; x++) {
        const id = at(x, y)
        if (id === null) continue
        const s = stats.get(id) ?? { n: 0, sx: 0, sy: 0 }
        s.n++; s.sx += x; s.sy += y
        stats.set(id, s)
        if (at(x + 1, y) !== id || at(x, y + 1) !== id || at(x - 1, y) !== id || at(x, y - 1) !== id) {
          sheet.set(ox + x, 24 + y, hue(id))
        }
      }
    }
    for (const [id, s] of stats) {
      visible.set(id, Math.max(visible.get(id) ?? 0, s.n))
      if (s.n < MIN_LABEL_AREA) continue
      // Label at the atom pixel nearest its centroid, so ring-shaped atoms get a label on themselves.
      let lx = Math.round(s.sx / s.n), ly = Math.round(s.sy / s.n)
      if (at(lx, ly) !== id) {
        let best = Infinity
        for (let y = 0; y < MARK_PX; y += 2) for (let x = 0; x < MARK_PX; x += 2) {
          if (at(x, y) !== id) continue
          const d = (x - lx) ** 2 + (y - ly) ** 2
          if (d < best) { best = d; lx = x; ly = y }
        }
      }
      const label = String(id)
      const w = label.length * 8 + 2
      sheet.rect(ox + lx - w / 2 - 1, 24 + ly - 6, w + 2, 14, [255, 255, 255], 0.9)
      sheet.text(label, ox + lx - w / 2 + 1, 24 + ly - 5, hue(id).map((c) => c * 0.6))
    }
  })
  look.drop()
  ids.drop()
  return { sheet, visible }
}

function atomTable(anim, atoms, visible) {
  const sites = readColorSites(anim)
  const translucent = translucentAtoms(anim)
  return atoms.map((atom) => {
    const colours = [...new Set(atom.sites.map((s) => sites[s].hex))].join(' ')
    const where = `${atom.at.asset ? atom.at.asset + ' › ' : ''}${JSON.stringify(atom.layerName)} ${atom.at.groups.map((g) => '#' + g).join(' ')}`
    const shown = visible.get(atom.id) ?? 0
    const kind = translucent.has(atom.id) ? 'effect' : 'solid '
    return `${String(atom.id).padStart(4)}  ${kind}  ${where.padEnd(44)} ${colours.padEnd(24)} ${shown ? shown + ' px' : 'not visible'}${atom.instances > 1 ? `  ×${atom.instances}` : ''}`
  }).join('\n') + '\n'
}

async function listFiles(args) {
  if (args.length) return args.map((a) => resolve(ROOT, a))
  const dir = join(ROOT, 'samples')
  return (await readdir(dir)).filter((f) => f.endsWith('.tgs')).sort().map((f) => join(dir, f))
}

const engine = await loadEngine(await readFile(join(ROOT, 'node_modules', 'tlottie', 'dist', 'core', 'tlottie.wasm')))
await mkdir(OUT, { recursive: true })
for (const file of await listFiles(process.argv.slice(2))) {
  const name = basename(file).replace(/\.(tgs|json)$/i, '')
  const anim = await readTgs(new Uint8Array(await readFile(file)))
  const atoms = findAtoms(anim)
  const frames = framesSheet(engine, anim)
  const solid = marksSheet(engine, anim, atoms.length, 'solid')
  const effects = marksSheet(engine, anim, atoms.length, 'translucent')
  const visible = new Map([...solid.visible, ...effects.visible])
  await writeFile(join(OUT, `${name}.frames.png`), encodePng(frames.px, frames.width, frames.height))
  await writeFile(join(OUT, `${name}.marks.png`), encodePng(solid.sheet.px, solid.sheet.width, solid.sheet.height))
  await writeFile(join(OUT, `${name}.effects.png`), encodePng(effects.sheet.px, effects.sheet.width, effects.sheet.height))
  await writeFile(join(OUT, `${name}.atoms.txt`), atomTable(anim, atoms, visible))
  console.log(`${name}: ${atoms.length} atoms → exports/sheets/${name}.{frames,marks,effects}.png, .atoms.txt`)
}
