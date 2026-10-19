// Shows how a sticker's profile splits it into parts, for checking a profile
// by eye (plan, Iteration 4). Read-only on the stickers; writes exports/sheets/.
//
//   node scripts/parts-sheet.mjs              # samples/*.tgs
//   node scripts/parts-sheet.mjs a.tgs b.tgs  # explicit files
//   node scripts/parts-sheet.mjs --profile src/core/profiles/x.ts a.tgs
//                                             # try a profile not yet in profiles/index.ts
//
// Per sticker with a matching profile, <name>.parts.png: one row per part (in
// profile order) on three frames — the part in its colours, everything else
// faded, outlined in magenta — and a last row with the visible atoms no part holds. The legend
// (row → part, atoms, coverage) is printed. Stickers without a profile, or
// whose profile does not resolve, are reported with their fingerprint.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { Canvas, encodePng, engine as loadEngine, framesAt, load, ROOT } from './lib/sheets.mjs'

const OUT = join(ROOT, 'exports', 'sheets')
const CELL = 256
const LABEL = 22

const { readTgs } = await load('src/core/tgs.ts')
const { findAtoms, fingerprint } = await load('src/core/atoms.ts')
const { decodeId, idColorize } = await load('src/core/idmap.ts')
const { readColorSites } = await load('src/core/colors.ts')
const { resolveParts } = await load('src/core/parts.ts')

const args = process.argv.slice(2)
const flag = args.indexOf('--profile')
const extra = flag >= 0 ? args.splice(flag, 2)[1] : null
const PROFILES = extra
  ? Object.values(await load(extra)).filter((value) => value && typeof value === 'object' && Array.isArray(value.parts))
  : (await load('src/core/profiles/index.ts')).PROFILES

function matchProfile(anim) {
  for (const profile of PROFILES) {
    const parts = resolveParts(anim, profile)
    if (parts) return { profile, parts }
  }
  return null
}

async function listFiles(args) {
  if (args.length) return args.map((a) => resolve(ROOT, a))
  const dir = join(ROOT, 'samples')
  return (await readdir(dir)).filter((f) => f.endsWith('.tgs')).sort().map((f) => join(dir, f))
}

const engine = await loadEngine()
await mkdir(OUT, { recursive: true })

for (const file of await listFiles(args)) {
  const name = basename(file).replace(/\.(tgs|json)$/i, '')
  const anim = await readTgs(new Uint8Array(await readFile(file)))
  const print = fingerprint(anim)
  const match = matchProfile(anim)
  if (!match) {
    const named = PROFILES.find((p) => p.match.fingerprint === print || (p.match.nm !== undefined && p.match.nm === anim.nm))
    console.log(`${name}: ${named ? `profile «${named.id}» does not resolve` : 'no profile'} (nm ${JSON.stringify(anim.nm)}, fingerprint ${print})`)
    continue
  }

  const atoms = findAtoms(anim)
  // Atom → part row (index in match.parts); atoms with no site in any part → -1.
  const rowOf = new Map()
  for (const atom of atoms) {
    const row = match.parts.findIndex((part) => atom.sites.some((site) => part.sites.includes(site)))
    rowOf.set(atom.id, row)
  }

  const look = engine.create(JSON.stringify(anim))
  const maps = ['solid', 'translucent'].map((only) => engine.create(JSON.stringify(idColorize(anim, { only }))))
  const frames = framesAt(look.frameCount, 3).map((f) => f + Math.floor(look.frameCount / 6))
  const rows = match.parts.length + 1
  const sheet = new Canvas(CELL * 3, rows * (CELL + LABEL))
  const seen = new Map() // row → visible pixels over the frames
  const unassigned = new Set()

  frames.forEach((frame, col) => {
    const colour = look.render(frame, CELL, CELL).slice()
    const ids = maps.map((map) => map.render(frame, CELL, CELL, false).slice())
    const topAtom = (i) => {
      for (const px of ids) {
        const id = decodeId(px[i * 4], px[i * 4 + 1], px[i * 4 + 2], px[i * 4 + 3], atoms.length)
        if (id !== null) return id
      }
      return null
    }
    const owner = new Int16Array(CELL * CELL).fill(-2) // -2 nothing drawn
    for (let i = 0; i < CELL * CELL; i++) {
      const id = topAtom(i)
      if (id === null) continue
      owner[i] = rowOf.get(id)
      if (owner[i] === -1) unassigned.add(id)
    }
    for (let row = 0; row < rows; row++) {
      const want = row === match.parts.length ? -1 : row
      const oy = row * (CELL + LABEL)
      const ox = col * CELL
      const cell = new Uint8Array(colour)
      let count = 0
      for (let i = 0; i < CELL * CELL; i++) {
        if (owner[i] === want) { count++; continue }
        cell[i * 4 + 3] = Math.round(cell[i * 4 + 3] * 0.12)
      }
      seen.set(row, (seen.get(row) ?? 0) + count)
      sheet.draw(cell, CELL, ox, oy + LABEL)
      // Outline the part: faded white stays white, so the edge says what is in.
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          const i = y * CELL + x
          if (owner[i] !== want) continue
          const out = (dx, dy) => x + dx < 0 || y + dy < 0 || x + dx >= CELL || y + dy >= CELL || owner[i + dy * CELL + dx] !== want
          if (out(1, 0) || out(-1, 0) || out(0, 1) || out(0, -1)) sheet.set(ox + x, oy + LABEL + y, [230, 0, 120])
        }
      }
      sheet.text(`${row === match.parts.length ? 0 : row + 1}  f ${frame}`, ox + 4, oy + 5, [90, 90, 90])
    }
  })
  look.drop()
  for (const map of maps) map.drop()
  await writeFile(join(OUT, `${name}.parts.png`), encodePng(sheet.px, sheet.width, sheet.height))

  console.log(`${name} (profile «${match.profile.id}», fingerprint ${print}) → exports/sheets/${name}.parts.png`)
  const hexes = readColorSites(anim).map((site) => site.hex)
  match.parts.forEach((part, row) => {
    const n = atoms.filter((atom) => rowOf.get(atom.id) === row).length
    console.log(`  ${String(row + 1).padStart(2)}  ${part.name.padEnd(24)} ${String(n).padStart(4)} atoms  key ${hexes[part.keySite]}  ${seen.get(row) ? seen.get(row) + ' px' : 'NOT VISIBLE'}`)
  })
  const loose = [...unassigned].sort((a, b) => a - b)
  console.log(`   0  без части${' '.repeat(16)} ${String(loose.length).padStart(4)} visible atoms${loose.length ? ': ' + loose.join(' ') : ''}`)
}
