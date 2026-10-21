// «6-7»: two blue hands, palms up with the fingers towards the viewer, bobbing up and down in turn.
// Made from the blue 🤲 (library 129 → exports/blue/palms-up-together.tgs): its sparkles are
// dropped, the hands are frozen in the cupped pose of frame `POSE` and set apart, and each hand
// gets a looping vertical swing (opposite phases) with a tilt that lags behind it.
// Usage: node scripts/restyle.mjs blue/palms-up-together && node packs/blue/six-seven/build.mjs
//   → exports/blue/six-seven.tgs, exports/sheets/blue-six-seven.png

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = join(import.meta.dirname, '..', '..', '..')
const { Canvas, encodePng, engine, framesAt, load } = await import(pathToFileURL(join(ROOT, 'scripts', 'lib', 'sheets.mjs')).href)
const { readTgs, writeTgs, sizeKb } = await load('src/core/tgs.ts')
const { easeAt } = await load('src/core/motion/easing.ts')
const { telegramChecks } = await load('src/core/checks.ts')

const cfg = JSON.parse(await readFile(join(import.meta.dirname, 'motion.json'), 'utf8'))
const { pose: POSE, period: PERIOD, lift: LIFT, tilt: TILT, lag: LAG, apart: APART, frames: FRAMES, view: VIEW } = cfg

// ---------- freezing a pose ----------

const pick = (v, d) => (Array.isArray(v) ? v[Math.min(d, v.length - 1)] : v)
const lerp = (a, b, u) => a + (b - a) * u
const mix = (a, b, u) => {
  if (typeof a === 'number') return lerp(a, b, u)
  if (Array.isArray(a)) return a.map((v, i) => mix(v, b[i], u))
  if (a && typeof a === 'object') return { ...a, i: mix(a.i, b.i, u), o: mix(a.o, b.o, u), v: mix(a.v, b.v, u) }
  return a
}
const cubic = (p0, c0, c1, p1, u) =>
  p0.map((_, d) => (1 - u) ** 3 * p0[d] + 3 * (1 - u) ** 2 * u * c0[d] + 3 * (1 - u) * u ** 2 * c1[d] + u ** 3 * p1[d])

// A keyframed property's value at `frame`, as Lottie plays it: eased per dimension (one ease for
// paths), along the spatial curve when the keys have to/ti.
function frozen(prop, frame) {
  const keys = prop.k
  if (frame <= keys[0].t) return keys[0].s
  for (let n = 0; n < keys.length - 1; n++) {
    const a = keys[n]
    const b = keys[n + 1]
    if (frame >= b.t) continue
    const to = b.s ?? a.e
    if (a.h === 1 || !a.o || !a.i || !to) return a.s
    const x = (frame - a.t) / (b.t - a.t)
    const ease = (d) => easeAt({ x1: pick(a.o.x, d), y1: pick(a.o.y, d), x2: pick(a.i.x, d), y2: pick(a.i.y, d) }, x)
    if (a.to && a.ti) {
      const u = ease(0)
      return cubic(a.s, a.s.map((v, d) => v + a.to[d]), to.map((v, d) => v + a.ti[d]), to, u)
    }
    if (typeof a.s[0] === 'object') return mix(a.s, to, ease(0)) // [shape]
    return a.s.map((v, d) => lerp(v, to[d], ease(d)))
  }
  const last = keys[keys.length - 1]
  return last.s ?? keys[keys.length - 2].e
}

function freeze(node, frame) {
  if (Array.isArray(node)) return node.forEach((n) => freeze(n, frame))
  if (!node || typeof node !== 'object') return
  for (const [key, v] of Object.entries(node)) {
    if (v && typeof v === 'object' && v.a === 1 && Array.isArray(v.k) && v.k[0] && 't' in v.k[0]) {
      const value = frozen(v, frame)
      node[key] = { a: 0, k: Array.isArray(value) && value.length === 1 && typeof value[0] === 'object' ? value[0] : value }
    } else freeze(v, frame)
  }
}

// ---------- motion ----------

const SINE = { o: { x: [0.45], y: [0] }, i: { x: [0.55], y: [1] } }

// Keys at the swing's ends every half period from `start` (may be < 0 or past the end, so a
// lagging channel still loops), alternating +amp / -amp around `base`.
function swing(base, amp, start, phase) {
  const half = PERIOD / 2
  const keys = []
  for (let t = start - half, k = 0; t <= FRAMES + half; t += half, k++) {
    const sign = (k + phase) % 2 === 0 ? 1 : -1
    keys.push({ t, s: base.map((v, d) => v + amp[d] * sign), ...SINE })
  }
  return { a: 1, k: keys }
}

// ---------- build ----------

const anim = await readTgs(new Uint8Array(await readFile(join(ROOT, 'exports', 'blue', 'palms-up-together.tgs'))))
const keep = new Set(['ULTRA HANDS', 'Null 97', 'Hand'])
anim.layers = anim.layers.filter((l) => keep.has(l.nm))
anim.assets = anim.assets.filter((a) => anim.layers.some((l) => l.refId === a.id))
freeze(anim.layers, POSE)
freeze(anim.assets, POSE)

const hands = anim.layers.filter((l) => l.nm === 'Hand')
hands.forEach((hand, i) => {
  hand.ip = 0
  hand.op = FRAMES
  const out = (hand.ks.s?.k?.[0] ?? 100) < 0 ? 1 : -1 // the mirrored copy is the right hand
  const p = hand.ks.p.k
  const r = hand.ks.r?.k ?? 0
  const phase = i % 2
  hand.ks.p = swing([p[0] + out * APART, p[1], p[2] ?? 0], [0, -LIFT, 0], 0, phase)
  hand.ks.r = swing([typeof r === 'number' ? r : r[0]], [out * TILT], LAG, phase)
})
for (const l of anim.layers) { l.ip = 0; l.op = FRAMES; l.st = 0 }
// The view: the root null scaled about the canvas centre and moved, so the swing fills the canvas.
const root = anim.layers.find((l) => l.nm === 'ULTRA HANDS')
const [px, py] = root.ks.p.k
const k = VIEW.scale / 100
root.ks.p.k = [256 + (px - 256) * k + VIEW.dx, 256 + (py - 256) * k + VIEW.dy, 0]
root.ks.s.k = root.ks.s.k.map((v, d) => (d < 2 ? v * k : v))
anim.ip = 0
anim.op = FRAMES

const bytes = await writeTgs(anim)
await writeFile(join(ROOT, 'exports', 'blue', 'six-seven.tgs'), bytes)

const eng = await engine()
const inst = eng.create(JSON.stringify(anim))
const C = 160
const frames = framesAt(inst.frameCount, 16)
const sheet = new Canvas(C * 8, (C + 16) * 2)
frames.forEach((f, i) => {
  sheet.draw(inst.render(f, C, C).slice(), C, (i % 8) * C, Math.floor(i / 8) * (C + 16) + 16)
  sheet.text(`f ${f}`, (i % 8) * C + 4, Math.floor(i / 8) * (C + 16) + 4, [90, 90, 90])
})
inst.drop()
await writeFile(join(ROOT, 'exports', 'sheets', 'blue-six-seven.png'), encodePng(sheet.px, sheet.width, sheet.height))
const checks = telegramChecks(anim, bytes.length)
console.log(`exports/blue/six-seven.tgs ${sizeKb(bytes)} KB, проверки Telegram ${checks.every((c) => c.ok) ? '✓' : '✕'}; exports/sheets/blue-six-seven.png`)
