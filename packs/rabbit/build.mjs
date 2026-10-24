// node packs/rabbit/build.mjs — deterministic, offline, shared editable SVG -> TGS.
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { createHash as hash } from 'node:crypto'
import { ROOT } from '../../scripts/lib/sheets.mjs'
import { readSvg, mapPath, rotate, radians, round, svgPath } from './vector.mjs'
import { pose } from './motion.mjs'

const dir = join(ROOT, 'packs/rabbit'), out = join(ROOT, 'exports/rabbit')
await mkdir(out, { recursive: true })
const rig = JSON.parse(await readFile(join(dir, 'rig.json'), 'utf8'))
const emotions = JSON.parse(await readFile(join(dir, 'emotions.json'), 'utf8'))
const svg = await readFile(join(dir, rig.geometry), 'utf8')
const master = readSvg(svg)
const N = rig.frames, STEP = rig.bakeStep
const times = [...new Set([...Array.from({ length: Math.ceil(N / STEP) }, (_, i) => i * STEP), N - 1, N])]
const prop = (x) => ({ a: 0, k: x })
const rgb = (x) => (x === 'white' ? [1, 1, 1] : x.replace('#', '').match(/../g).map((v) => parseInt(v, 16) / 255))
function baked(fn, isShape = false) {
  const values = times.map(fn)
  if (values.every((x) => JSON.stringify(x) === JSON.stringify(values[0]))) return prop(values[0])
  // Remove only keys whose interpolated controls stay within 0.20 source px
  // (less than 0.11 screen px). Dense source sampling remains reproducible.
  const flatten = (v) => isShape ? ['v', 'i', 'o'].flatMap((k) => v[k].flat()) : Array.isArray(v) ? v : [v]
  const vectors = values.map(flatten), keep = new Set([0, times.length - 1])
  function simplify(a, b) {
    let worst = isShape ? 0.20 : 0.015, index = -1
    for (let j = a + 1; j < b; j++) {
      const t = (times[j] - times[a]) / (times[b] - times[a])
      const error = Math.max(...vectors[j].map((x, k) => Math.abs(x - (vectors[a][k] + (vectors[b][k] - vectors[a][k]) * t))))
      if (error > worst) { worst = error; index = j }
    }
    if (index >= 0) { keep.add(index); simplify(a, index); simplify(index, b) }
  }
  simplify(0, times.length - 1)
  const keys = [...keep].sort((a, b) => a - b)
  return { a: 1, k: keys.map((j, n) => ({ t: times[j], s: isShape ? [values[j]] : Array.isArray(values[j]) ? values[j] : [values[j]],
    ...(n + 1 < keys.length ? { o: { x: 0.333333, y: 0.333333 }, i: { x: 0.666667, y: 0.666667 },
      e: isShape ? [values[keys[n + 1]]] : Array.isArray(values[keys[n + 1]]) ? values[keys[n + 1]] : [values[keys[n + 1]]] } : {}) })) }
}
// A curved surface turn: the silhouette changes nonlinearly with x/y; facial
// features sit 68 source px forward and the far eye narrows. Ear roots and skull
// share the same projection, so the attachment never separates during a turn.
function project(p, pose, face = false) {
  const [x, y] = p, dx = x - 280, dy = y - 550
  const ya = radians(pose.yaw), pi = radians(pose.pitch)
  const z = 35 + dx * dx * 0.00012 - dy * 0.03 + (face ? 68 : 0)
  return [280 + dx * Math.cos(ya) + Math.sin(ya) * z,
    550 + dy * Math.cos(pi) - Math.sin(pi) * z + Math.sin(ya) * dx * dy * 0.00013]
}
function deform(record, p) {
  const path = record.path
  const id = record.id, head = record.ancestors.includes('head'), face = record.ancestors.includes('face')
  return mapPath(path, (point) => {
    let [x, y] = point
    if (id.endsWith('-pupil')) {
      const left = id.startsWith('eye-left'), cx = left ? 166 : 390
      const open = left ? p.eyeL : p.eyeR, t = (x - cx) / 64, slope = left ? 0.42 : -0.42
      const arch = 610 - 27 * (1 - t * t) + (y - 610 - slope * (x - cx)) * 0.14
      y = 614 + ((y + (arch - y) * p.smile) - 614) * Math.max(0.015, open)
      x = cx + (x - cx) * (1 + (left ? -1 : 1) * p.yaw * 0.0035)
    }
    if (record.group.startsWith('ear-')) {
      const left = record.group === 'ear-left', pivot = rig.earPivots[left ? 'left' : 'right']
      // Bend vanishes at the root (y >= 340/365); the broad root fill overlaps
      // the skull even at extremal flexion. No closed black cap across the seam.
      const w = Math.max(0, Math.min(1, ((left ? 340 : 365) - y) / (left ? 310 : 190)))
      ;[x, y] = rotate([x, y], pivot, (left ? p.earL : p.earR) * w)
    }
    return head ? project([x, y], p, face) : [x, y]
  })
}
function groupOpacity(id, p) {
  if (id.startsWith('eyelid-')) {
    const open = id.endsWith('left') ? p.eyeL : p.eyeR
    return Math.max(0, 1 - open * 5) * 100
  }
  return 100
}
function compile(mode, emotion) {
  const view = rig.views[mode], groups = master.groups.filter((g) => mode === 'full' || !['leg-left', 'leg-right', 'torso', 'paw-left', 'paw-right'].includes(g.id))
  const indices = new Map(groups.map((g, i) => [g.id, i + 1]))
  const controls = times.map((f) => pose(emotion.kind, f)), at = (f) => controls[times.indexOf(f)]
  const layers = groups.map((g) => {
    const pivot = g.pivot
    const ks = { a: prop([...pivot, 0]), p: prop([...pivot, 0]), s: prop([100, 100, 100]), r: prop(0), o: baked((f) => round(groupOpacity(g.id, at(f)))) }
    if (g.id === 'root') {
      ks.a = prop([...rig.headPivot, 0])
      ks.p = baked((f) => [round(view.position[0] + at(f).x * view.scale), round(view.position[1] + at(f).y * view.scale), 0])
      ks.s = prop([view.scale * 100, view.scale * 100, 100])
    }
    if (g.id === 'body') {
      ks.r = baked((f) => mode === 'full' ? at(f).bodyR : 0)
      if (mode === 'full') ks.s = baked((f) => { const s = at(f).squash * 0.6; return [round(100 / (1 + s * 0.4)), round(100 * (1 + s)), 100] })
    }
    if (g.id === 'head') {
      ks.r = baked((f) => round(at(f).headR))
      ks.s = baked((f) => { const s = at(f).squash; return [round(100 / (1 + s * 0.6)), round(100 * (1 + s)), 100] })
    }
    if (g.id.startsWith('paw-')) ks.p = baked((f) => { const offset = g.id.endsWith('left') ? at(f).pawL : at(f).pawR; return pivot.map((x, d) => round(x + offset[d])).concat(0) })
    if (g.id.startsWith('leg-')) ks.r = baked((f) => g.id.endsWith('left') ? at(f).legL : at(f).legR)
    const parent = g.id === 'head' ? 'body' : g.parent
    return { ddd: 0, ind: indices.get(g.id), ty: 3, nm: g.id, ...(indices.has(parent) ? { parent: indices.get(parent) } : {}), ks, ip: 0, op: N, st: 0, sr: 1 }
  })
  const paths = master.paths.filter((p) => mode === 'full' || p.ancestors.includes('head'))
  // Paws are foreground actors: the sleepy stretch can rub the cheek.
  const ordered = [...paths.filter((p) => !p.group.startsWith('paw-')), ...paths.filter((p) => p.group.startsWith('paw-'))]
  for (const [j, record] of ordered.entries()) {
    const shape = { ty: 'sh', nm: record.id, ks: baked((f) => deform(record, at(f)), true) }
    const paint = []
    if (record.fill && record.fill !== 'none') paint.push({ ty: 'fl', nm: `${record.id}/fill`, c: prop(rgb(record.fill)), o: prop(100), r: 1 })
    if (record.stroke && record.stroke !== 'none') paint.unshift({ ty: 'st', nm: `${record.id}/outline`, c: prop(rgb(record.stroke)), o: prop(100), w: prop(Number(record['stroke-width'] ?? 1)), lc: 2, lj: 2, ml: 4 })
    const tr = { ty: 'tr', a: prop([0, 0]), p: prop([0, 0]), s: prop([100, 100]), r: prop(0), o: prop(100), sk: prop(0), sa: prop(0) }
    layers.unshift({ ddd: 0, ind: 100 + j, ty: 4, nm: record.id, parent: indices.get(record.group), ks: { a: prop([0, 0, 0]), p: prop([0, 0, 0]), s: prop([100, 100, 100]), r: prop(0),
      // Lottie parenting inherits transforms, not opacity: apply visibility to
      // the actual painted layer, including all hidden control ancestors.
      o: baked((f) => round(record.ancestors.reduce((o, id) => o * groupOpacity(id, at(f)) / 100, 100))) },
      shapes: [{ ty: 'gr', nm: record.id, it: [shape, ...paint, tr] }], ip: 0, op: N, st: 0, sr: 1 })
  }
  return { v: '5.7.4', tgs: 1, fr: rig.frameRate, ip: 0, op: N, w: 512, h: 512,
    nm: `Заяц · ${mode === 'head' ? 'голова' : 'целиком'} · ${emotion.title}`, ddd: 0, assets: [], layers }
}
const manifest = { version: 1, sourceSha256: hash('sha256').update(await readFile(join(dir, rig.source))).digest('hex'),
  geometrySha256: hash('sha256').update(svg).digest('hex'), frameRate: rig.frameRate, frames: N,
  geometryNodes: master.paths.reduce((sum, p) => sum + p.path.v.length, 0), items: [] }
for (const [id, emotion] of Object.entries(emotions)) for (const mode of ['head', 'full']) {
  const name = `rabbit-${mode}-${id}`, anim = compile(mode, emotion)
  const json = JSON.stringify(anim), bytes = gzipSync(json, { level: 9, mtime: 0 })
  if (bytes.length > 65536) throw new Error(`${name}: ${bytes.length} > 64 KB`)
  await writeFile(join(out, `${name}.json`), json)
  await writeFile(join(out, `${name}.tgs`), bytes)
  manifest.items.push({ id: name, reference: emotion.reference, title: emotion.title, mode, bytes: bytes.length, sha256: hash('sha256').update(bytes).digest('hex') })
  if (id === 'neutral') {
    const view = rig.views[mode]
    const paths = master.paths.filter((p) => mode === 'full' || p.ancestors.includes('head'))
    const body = paths.filter((p) => p.opacity !== '0').map((p) => `<path id="${p.id}" d="${svgPath(p.path)}" fill="${p.fill ?? 'none'}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${p['stroke-width']}" stroke-linecap="round" stroke-linejoin="round"` : ''}/>`).join('\n')
    await writeFile(join(out, `${name}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><g transform="translate(${view.position}) scale(${view.scale}) translate(-280 -550)">${body}</g></svg>\n`)
  }
  console.log(`${name}: ${(bytes.length / 1024).toFixed(1)} KB`)
}
await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2))
