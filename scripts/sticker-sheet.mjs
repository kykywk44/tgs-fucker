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
import { basename, join, resolve } from 'node:path'
import { Canvas, encodePng, engine as loadEngine, framesAt, hue, load, ROOT } from './lib/sheets.mjs'

const OUT = join(ROOT, 'exports', 'sheets')
const FRAME_PX = 256 // frames sheet cell
const MARK_PX = 512 // marks sheet cell
const MIN_LABEL_AREA = 40 // px at MARK_PX: smaller atoms get an outline but no number

const { readTgs } = await load('src/core/tgs.ts')
const { findAtoms } = await load('src/core/atoms.ts')
const { readColorSites } = await load('src/core/colors.ts')
const { decodeId, idColorize, translucentAtoms } = await load('src/core/idmap.ts')

// ---------- sheets ----------

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

const engine = await loadEngine()
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
