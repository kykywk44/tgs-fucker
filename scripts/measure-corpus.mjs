// Measures how .tgs stickers split into "atoms" before the parts UI is built
// (plan, Iteration 4, task 10a). Read-only: prints a report, writes nothing.
//
//   node scripts/measure-corpus.mjs              # samples/*.tgs
//   node scripts/measure-corpus.mjs a.tgs b.tgs  # explicit files
//
// An atom is a shape list (a layer's `shapes` or a group's `it`) that directly
// holds at least one paint (fl / st / gf / gs). Its visible size comes from the
// ID map (src/core/idmap.ts) rendered by tlottie with antialiasing off at
// 512×512 on sampled frames.
// An atom that never owns a pixel (hidden or always covered) cannot be clicked.
// For stickers matched by a hand-written profile, every atom must fall wholly
// inside one part (or none): otherwise atoms are too coarse for click selection.

import { readFile, readdir } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runnerImport } from 'vite'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SIZE = 512
const FRAMES = 45 // sampled frames per sticker, evenly spread (every 4th at 180 frames)
const TINY = 16 // px: an atom whose largest visible bbox side stays below this is hard to click

async function load(path) {
  const options = { configFile: false, logLevel: 'silent', root: ROOT }
  return (await runnerImport(join(ROOT, path), options)).module
}
const { readTgs } = await load('src/core/tgs.ts')
const { findAtoms } = await load('src/core/atoms.ts')
const { matchProfile } = await load('src/core/parts.ts')
const { decodeId, idColorize } = await load('src/core/idmap.ts')
const { loadEngine } = await load('src/player/engine.ts')

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

// ---------- feature counts ----------

function countFeatures(anim) {
  const counts = { tm: 0, rp: 0, grad: 0, matte: 0, mask: 0, refs: new Map() }
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!isObject(node)) return
    if (node.ty === 'tm') counts.tm++
    if (node.ty === 'rp') counts.rp++
    if (node.ty === 'gf' || node.ty === 'gs') counts.grad++
    if (node.tt || node.td) counts.matte++
    if (node.hasMask || (Array.isArray(node.masksProperties) && node.masksProperties.length)) counts.mask++
    if (node.ty === 0 && typeof node.refId === 'string') {
      counts.refs.set(node.refId, (counts.refs.get(node.refId) ?? 0) + 1)
    }
    for (const value of Object.values(node)) if (typeof value === 'object' && value !== null) visit(value)
  }
  visit(anim)
  return counts
}

// ---------- ID render ----------

// Per atom: largest pixel area and largest bbox side over the sampled frames;
// plus the share of drawn pixels that are not an exact ID colour.
function measureVisibility(anim, atomCount, engine) {
  const anim2 = engine.create(JSON.stringify(idColorize(anim)))
  if (!anim2) return null
  const area = new Array(atomCount).fill(0)
  const side = new Array(atomCount).fill(0)
  let drawn = 0
  let impure = 0
  for (let f = 0; f < FRAMES; f++) {
    const frame = Math.floor((f * anim2.frameCount) / FRAMES)
    const px = anim2.render(frame, SIZE, SIZE, false)
    if (!px) continue
    const frameArea = new Map()
    const box = new Map()
    for (let i = 0; i < SIZE * SIZE; i++) {
      const a = px[i * 4 + 3]
      if (a === 0) continue
      drawn++
      const id = decodeId(px[i * 4], px[i * 4 + 1], px[i * 4 + 2], a, atomCount)
      if (id === null) { impure++; continue }
      frameArea.set(id, (frameArea.get(id) ?? 0) + 1)
      const x = i % SIZE
      const y = (i / SIZE) | 0
      const b = box.get(id) ?? [x, y, x, y]
      box.set(id, [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)])
    }
    for (const [id, n] of frameArea) area[id] = Math.max(area[id], n)
    for (const [id, b] of box) side[id] = Math.max(side[id], b[2] - b[0] + 1, b[3] - b[1] + 1)
  }
  anim2.drop()
  return { area, side, impure: drawn ? impure / drawn : 0 }
}

// ---------- profile alignment ----------

// For a sticker matched by a hand profile: how many atoms each part needs, and
// which atoms straddle a part boundary (sites in two parts, or in a part and
// outside every part).
function profileAlignment(anim, atoms) {
  const match = matchProfile(anim)
  if (!match) return null
  const owner = new Map()
  for (const part of match.parts) for (const s of part.sites) owner.set(s, part.id)
  const perPart = new Map(match.parts.map((p) => [p.id, 0]))
  const split = []
  for (const atom of atoms) {
    const owners = new Set(atom.sites.map((s) => owner.get(s) ?? '—'))
    if (owners.size > 1) split.push({ atom, owners: [...owners] })
    else {
      const only = [...owners][0]
      if (only !== '—') perPart.set(only, perPart.get(only) + 1)
    }
  }
  return { profile: match.profile.id, perPart, split }
}

// ---------- report ----------

async function listFiles(args) {
  if (args.length) return args.map((a) => resolve(ROOT, a))
  const dir = join(ROOT, 'samples')
  return (await readdir(dir)).filter((f) => f.endsWith('.tgs')).sort().map((f) => join(dir, f))
}

const pad = (v, n) => String(v).padStart(n)
const engine = await loadEngine(await readFile(join(ROOT, 'node_modules', 'tlottie', 'dist', 'core', 'tlottie.wasm')))
const files = await listFiles(process.argv.slice(2))
const names = new Map()
const rows = []
const alignments = []

console.log(
  'file'.padEnd(26) + pad('KB', 6) + pad('layers', 7) + pad('atoms', 6) + pad('max/L', 6) +
    pad('tiny', 5) + pad('unpick', 7) + pad('tm', 4) + pad('rp', 4) + pad('grad', 5) +
    pad('matte', 6) + pad('depth', 6) + pad('impure', 8) + '  precomp reuse',
)
for (const file of files) {
  const bytes = new Uint8Array(await readFile(file))
  const anim = await readTgs(bytes)
  const nm = typeof anim.nm === 'string' ? anim.nm : null
  names.set(nm, [...(names.get(nm) ?? []), basename(file)])

  const atoms = findAtoms(anim)
  const maxDepth = Math.max(0, ...atoms.map((a) => a.at.groups.length))
  const perLayer = new Map()
  for (const a of atoms) {
    const key = `${a.at.asset ?? ''}/${a.at.layer}`
    perLayer.set(key, (perLayer.get(key) ?? 0) + 1)
  }
  const features = countFeatures(anim)
  const vis = measureVisibility(anim, atoms.length, engine)
  const hidden = vis ? vis.area.filter((n) => n === 0).length : '?'
  const tiny = vis ? vis.side.filter((s, i) => s > 0 && s < TINY).length : '?'
  const reuse = [...features.refs].filter(([, n]) => n > 1).map(([id, n]) => `${id}×${n}`).join(' ')
  const row = {
    atoms: atoms.length, tiny: vis ? tiny : 0, hidden: vis ? hidden : 0,
    reuse: reuse !== '', impure: vis?.impure ?? 0,
  }
  rows.push(row)
  console.log(
    basename(file).padEnd(26) + pad((bytes.length / 1024).toFixed(1), 6) + pad(anim.layers.length, 7) +
      pad(atoms.length, 6) + pad(Math.max(0, ...perLayer.values()), 6) + pad(tiny, 5) + pad(hidden, 7) +
      pad(features.tm, 4) + pad(features.rp, 4) + pad(features.grad, 5) +
      pad(features.matte + features.mask, 6) + pad(maxDepth, 6) +
      pad(vis ? (vis.impure * 100).toFixed(2) + '%' : 'n/a', 8) + '  ' + (reuse || '—'),
  )
  const alignment = profileAlignment(anim, atoms)
  if (alignment) alignments.push({ file: basename(file), ...alignment })
}

const sum = (k) => rows.reduce((s, r) => s + r[k], 0)
const atomCounts = rows.map((r) => r.atoms).sort((a, b) => a - b)
console.log(`\n${rows.length} files · atoms total ${sum('atoms')}, median ${atomCounts[atomCounts.length >> 1] ?? 0}, ` +
  `max ${atomCounts.at(-1) ?? 0} · tiny (< ${TINY} px) ${sum('tiny')} · never topmost (unpickable) on ${FRAMES} frames ${sum('hidden')} · ` +
  `files with precomp reuse ${rows.filter((r) => r.reuse).length} · worst impure ${(Math.max(0, ...rows.map((r) => r.impure)) * 100).toFixed(2)}%`)

console.log('\nRoot nm:')
for (const [nm, list] of names) {
  const flag = nm === null ? '  ← missing' : list.length > 1 ? '  ← duplicate' : ''
  if (flag) console.log(`  ${JSON.stringify(nm)}: ${list.join(', ')}${flag}`)
}
if ([...names].every(([nm, list]) => nm !== null && list.length === 1)) console.log('  all present and unique')

console.log('\nHand profiles vs atoms:')
if (!alignments.length) console.log('  no sticker matched a profile')
for (const a of alignments) {
  const parts = [...a.perPart].map(([id, n]) => `${id} ${n}`).join(', ')
  console.log(`  ${a.file} (${a.profile}): ${a.split.length ? `${a.split.length} atom(s) SPLIT` : 'aligned to atoms'} · atoms per part: ${parts}`)
  for (const { atom, owners } of a.split.slice(0, 5)) {
    console.log(`    split: ${atom.at.asset ? atom.at.asset + ' › ' : ''}layer ${JSON.stringify(atom.layerName)} ${atom.at.groups.map((g) => '#' + g).join(' ')} → ${owners.join(' + ')}`)
  }
}
