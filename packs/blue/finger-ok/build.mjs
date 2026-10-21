// 👉👌 «палец в окей»: the user's static scene (source.tgs: the OK hand's back, the pointing
// hand, the OK ring drawn over it) restyled blue, then animated: the pointing hand slides along
// its finger in and out of the ring, the OK hand sways left-right against it, looped.
// The ring is a layer above the pointing hand, so the finger passes through it by itself.
// Usage: node packs/blue/finger-ok/build.mjs → exports/blue/finger-ok.tgs, exports/sheets/blue-finger-ok.png

import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = join(import.meta.dirname, '..', '..', '..')
const { Canvas, encodePng, engine, framesAt, load } = await import(pathToFileURL(join(ROOT, 'scripts', 'lib', 'sheets.mjs')).href)
const { readTgs, writeTgs, sizeKb } = await load('src/core/tgs.ts')
const { telegramChecks } = await load('src/core/checks.ts')

const cfg = JSON.parse(await readFile(join(import.meta.dirname, 'motion.json'), 'utf8'))
const { frames: FRAMES, strokes: STROKES, finger: F, ok: OK, view: VIEW } = cfg
const PERIOD = FRAMES / STROKES

// The restyled static scene (restyle.mjs rebuilds it each time, so this script is repeatable).
execFileSync(process.execPath, [join(ROOT, 'scripts', 'restyle.mjs'), 'blue/finger-ok'], { stdio: 'ignore' })
const anim = await readTgs(new Uint8Array(await readFile(join(ROOT, 'exports', 'blue', 'finger-ok.tgs'))))
anim.ip = 0
anim.op = FRAMES
for (const l of anim.layers) { l.ip = 0; l.op = FRAMES }

const ease = (o, i) => ({ o: { x: [o[0]], y: [o[1]] }, i: { x: [i[0]], y: [i[1]] } })
// One stroke: in (fast, soft landing), a short hold deep in the ring, out (slower), rest outside.
// Values are offsets 0 (out) … 1 (in) at fractions of the period.
const STROKE = [
  [0, 0, ease([0.5, 0], [0.2, 1])],
  [F.in, 1, ease([0.4, 0], [0.6, 1])],
  [F.in + F.hold, 1, ease([0.45, 0], [0.4, 1])],
  [F.in + F.hold + F.out, 0, ease([0.5, 0], [0.5, 1])],
]

// Keys of `base + amount(u) · delta` for every stroke, the phase shifted by `lag` frames.
function strokes(base, delta, lag = 0, curve = STROKE) {
  const keys = []
  for (let n = -1; n <= STROKES; n++) {
    for (const [at, amount, e] of curve) {
      const t = Math.round((n + at) * PERIOD + lag)
      keys.push({ t, s: base.map((v, d) => v + (delta[d] ?? 0) * amount), ...e })
    }
  }
  return { a: 1, k: keys.sort((a, b) => a.t - b.t).filter((k, i, all) => i === 0 || k.t !== all[i - 1].t) }
}

const byName = (nm) => anim.layers.find((l) => l.nm === nm)

// Every shading is drawn as three identical stacked copies («Group 1..3», shapes at 40 % in a group
// at 60 %): one copy at the combined opacity looks the same and is a third of the work to animate.
for (const layer of anim.layers) {
  const stack = (layer.shapes ?? []).filter((g) => /^Group [123]$/.test(g.nm))
  if (stack.length < 2) continue
  const [keep, ...rest] = stack
  layer.shapes = layer.shapes.filter((g) => !rest.includes(g))
  const groupTr = keep.it.find((it) => it.ty === 'tr')
  for (const sub of keep.it.filter((it) => it.ty === 'gr')) {
    const tr = sub.it.find((it) => it.ty === 'tr')
    const one = (tr.o.k / 100) * (groupTr.o.k / 100)
    tr.o = { a: 0, k: (1 - (1 - one) ** stack.length) * 100 }
  }
  groupTr.o = { a: 0, k: 100 }
}
const finger = byName('Shape Layer 2')
const okLayers = [byName('Shape Layer 3'), byName('Shape Layer 1')]

// The finger's axis on the canvas: the layer's rotation (the drawing points along +x).
const angle = ((finger.ks.r?.k ?? 0) * Math.PI) / 180
const axis = [Math.cos(angle), Math.sin(angle)]
const fp = finger.ks.p.k
const outAt = [fp[0] - axis[0] * F.out_px, fp[1] - axis[1] * F.out_px, 0]
const inDelta = [axis[0] * (F.out_px + F.in_px), axis[1] * (F.out_px + F.in_px), 0]
finger.ks.p = strokes(outAt, inDelta)
// The hand tips a little as it pushes in.
const fingerRefR = finger.ks.r?.k ?? 0 // as drawn
finger.ks.r = strokes([fingerRefR], [F.tilt], 2)

// The OK hand gives way to each push (right) and comes back, a few frames behind the finger.
for (const l of okLayers) {
  const p = l.ks.p.k
  l.ks.p = strokes([p[0] - OK.sway / 2, p[1], 0], [OK.sway, 0, 0], OK.lag)
  l.ks.r = strokes([l.ks.r?.k ?? 0], [OK.tilt], OK.lag)
}

// ---------- cast shadows ----------
// Baked into the drawing for one pose; now they move with what casts them. Every shadow is drawn
// three times (stacked groups «Group 1..3»), so each copy gets the same keys.
const { valueAt } = await load('src/core/motion/easing.ts')
const SAMPLE = 2 // frames between baked keys
const okLayer = okLayers[0]
const fpRef = [fp[0], fp[1]] // the reference pose: the finger as drawn
const rot = (v, deg) => {
  const r = (deg * Math.PI) / 180
  return [v[0] * Math.cos(r) - v[1] * Math.sin(r), v[0] * Math.sin(r) + v[1] * Math.cos(r)]
}
// canvas vector → a layer's own units (layers are rotated r and scaled s)
const toLocal = (l, v) => {
  const s = (l.ks.s?.k?.[0] ?? 100) / 100
  const r = typeof l.ks.r.k === 'number' ? l.ks.r.k : valueAt(l.ks.r, 0)[0]
  return rot(v, -r).map((x) => x / s)
}
const okStaticR = -8

const fingerAt = (t) => { const p = valueAt(finger.ks.p, t); return [p[0] - fpRef[0], p[1] - fpRef[1]] }
const okAt = (t) => { const p = valueAt(okLayer.ks.p, t); const b = okLayer.ks.p.k[0].s; return [p[0] - (b[0] + OK.sway / 2), p[1] - b[1]] }
const baked = (f) => {
  const keys = []
  for (let t = 0; t <= FRAMES; t += SAMPLE) keys.push({ t, s: f(t), o: { x: [0], y: [0] }, i: { x: [1], y: [1] } })
  return { a: 1, k: keys }
}

const fillsOnly = (list) => list
  .filter((it) => it.ty !== 'st')
  .map((it) => (it.ty === 'gr' ? { ...it, it: fillsOnly(it.it) } : it))
const pathsIn = (list) => list.flatMap((it) => (it.ty === 'sh' ? [it] : it.ty === 'gr' ? pathsIn(it.it) : []))

// The finger's shadow on the palm inside the ring. The drawn one («Shape 4» of the ring layer) is
// jagged and, on the top layer, showed over the thumb; it is replaced by the pointing hand's own
// silhouette («Shape 5», hand and finger in one fill) offset down-right, on a layer under the
// pointing hand: a child of it, so it follows the push and the tilt; the thumb and the ring's fingers
// cover it, and an alpha matte of the palm keeps it on the palm.
{
  const shadeGroup = okLayer.shapes.find((g) => g.nm === 'Group 3')
  const drawn = shadeGroup.it.find((it) => it.nm === 'Shape 4')
  shadeGroup.it = shadeGroup.it.filter((it) => it !== drawn)
  const drawnFill = drawn.it.find((it) => it.ty === 'fl')
  const back = byName('Shape Layer 1')
  let ind = Math.max(...anim.layers.map((l) => l.ind ?? 0))
  const matte = { ...structuredClone(back), nm: 'Palm silhouette (matte)', ind: ++ind, td: 1, shapes: fillsOnly(structuredClone(back.shapes)) }
  const silhouette = finger.shapes.find((g) => g.nm === 'Shape 5')
  const fs = (finger.ks.s?.k?.[0] ?? 100) / 100
  const off = rot(cfg.palm_shadow.offset, -fingerRefR).map((x) => x / fs)
  const tr = { ...structuredClone(silhouette.it.find((it) => it.ty === 'tr')) }
  tr.p = { a: 0, k: [tr.p.k[0] + off[0], tr.p.k[1] + off[1]] }
  const shadow = {
    ...structuredClone(finger), nm: 'Finger shadow on palm', ind: ++ind, tt: 1, parent: finger.ind,
    ks: { o: { a: 0, k: cfg.palm_shadow.opacity }, r: { a: 0, k: 0 }, p: { a: 0, k: [0, 0, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } },
    shapes: [{ ...silhouette, it: [...pathsIn([silhouette]).map((sh) => structuredClone(sh)), { ...structuredClone(drawnFill), o: { a: 0, k: 100 } }, tr] }],
  }
  anim.layers.splice(anim.layers.indexOf(back), 0, matte, shadow)
}

// The OK hand's shadow on the finger («Shape 11», a strip along the finger's underside up to and
// through the ring) stays under the ring and shows only where the finger is: it moves with the OK
// hand, under an alpha matte made of the finger's silhouette, which moves with the finger. Its left
// end, out of the ring, rides with the finger and the strip stretches between the two.
{
  const fingerShadow = finger.shapes.find((g) => /^Group /.test(g.nm) && g.it.some((it) => it.nm === 'Shape 11'))
  const strip = fingerShadow.it.find((it) => it.nm === 'Shape 11')
  fingerShadow.it = fingerShadow.it.filter((it) => it !== strip)
  const at = anim.layers.indexOf(finger)
  let ind = Math.max(...anim.layers.map((l) => l.ind ?? 0))
  const matte = {
    ...structuredClone(finger), nm: 'Finger silhouette (matte)', ind: ++ind, td: 1,
    shapes: fillsOnly(structuredClone(finger.shapes.filter((g) => !/^Group /.test(g.nm)))),
  }
  const shadow = {
    ...structuredClone(finger), nm: 'OK shadow on finger', ind: ++ind, tt: 1,
    shapes: [{ ...structuredClone(fingerShadow), it: [structuredClone(strip), fingerShadow.it.find((it) => it.ty === 'tr')] }],
  }
  // drawn where the finger is in the reference pose, carried by the OK hand's sway
  shadow.ks.p = baked((t) => { const o = okAt(t); return [fp[0] + o[0], fp[1] + o[1], 0] })
  shadow.ks.r = { a: 0, k: fingerRefR }
  // points left of the ring's edge (strip-local x) follow the finger relative to the OK hand
  const [full, none] = cfg.strip.edge
  const path = pathsIn(shadow.shapes)[0]
  const rest = path.ks.k
  const weight = (x) => Math.min(1, Math.max(0, (none - x) / (none - full)))
  const keys = []
  for (let t = 0; t <= FRAMES; t += SAMPLE) {
    const f = fingerAt(t)
    const o = okAt(t)
    const d = toLocal(shadow, [f[0] - o[0], f[1] - o[1]])
    keys.push({ t, s: [{ ...rest, v: rest.v.map((p) => [p[0] + d[0] * weight(p[0]), p[1] + d[1] * weight(p[0])]) }], o: { x: [0], y: [0] }, i: { x: [1], y: [1] } })
  }
  path.ks = { a: 1, k: keys }
  anim.layers.splice(at, 0, matte, shadow)
}

// ---------- the three open fingers sway ----------
// The OK hand's back is one outline, so the fingers bend: every point above the finger bases
// moves sideways by θ·(height above the base), weighted up to the tip. θ is a damped spring
// pushed by the OK hand's sideways acceleration, run until it settles into the loop; keys only at
// its peaks (eased), so the paths stay small.
const B = cfg.bend
const spring = (() => {
  const x = (t) => valueAt(okLayer.ks.p, ((t % FRAMES) + FRAMES) % FRAMES)[0]
  const w = (2 * Math.PI) / B.period
  let th = 0
  let v = 0
  const out = []
  for (let t = 0; t < FRAMES * 4; t++) {
    const acc = x(t + 1) - 2 * x(t) + x(t - 1)
    v += -w * w * th - 2 * B.damping * w * v - acc
    th += v
    if (t >= FRAMES * 3) out.push(th)
  }
  out.push(out[0])
  const peak = Math.max(...out.map(Math.abs))
  return out.map((a) => (a / peak) * ((B.degrees * Math.PI) / 180))
})()
const peaks = [0]
for (let t = 1; t < FRAMES; t++) {
  if ((spring[t] - spring[t - 1]) * (spring[t + 1] - spring[t]) < 0 && Math.abs(spring[t]) > 0.002) peaks.push(t)
}
peaks.push(FRAMES)
console.log(`finger sway: ${peaks.length} keys`)

const okStatic = (() => {
  const l = okLayer
  const p = l.ks.p.k[0].s
  const a = l.ks.a.k
  const s = l.ks.s.k[0] / 100
  return (v) => { const q = rot([(v[0] - a[0]) * s, (v[1] - a[1]) * s], okStaticR); return [q[0] + p[0], q[1] + p[1]] }
})()
const bendPoint = (v, theta) => {
  const c = okStatic(v)
  const h = B.base_y - c[1]
  if (h <= 0) return v
  const weight = Math.min(1, h / (B.base_y - B.tip_y)) ** B.curve
  const amp = c[0] < B.split[0] ? B.amp[0] : c[0] < B.split[1] ? B.amp[1] : B.amp[2]
  const dx = theta * h * weight * amp
  const d = toLocal(okLayer, [dx, 0])
  return [v[0] + d[0], v[1] + d[1]]
}
const bendShape = (shape, theta) => {
  const v = shape.v.map((p) => bendPoint(p, theta))
  const abs = (list) => list.map((h, i) => [shape.v[i][0] + h[0], shape.v[i][1] + h[1]])
  const rel = (list) => list.map((p, i) => { const q = bendPoint(p, theta); return [q[0] - v[i][0], q[1] - v[i][1]] })
  return { ...shape, v, i: rel(abs(shape.i)), o: rel(abs(shape.o)) }
}
const SWING = { o: { x: [0.42], y: [0] }, i: { x: [0.58], y: [1] } }
const bend = (sh) => {
  const rest = sh.ks.k
  sh.ks = { a: 1, k: peaks.map((t) => ({ t, s: [bendShape(rest, spring[t])], ...SWING })) }
}
// the back of the hand, and on the OK layer everything but the ring (Shape 1, 2) and its shadow (Group 4)
for (const sh of pathsIn(byName('Shape Layer 1').shapes)) bend(sh)
for (const g of okLayer.shapes.filter((g) => !['Shape 1', 'Shape 2', 'Group 4'].includes(g.nm))) {
  for (const sh of pathsIn([g])) if (!sh.ks.a) bend(sh)
}

// The view: every layer hangs from one null, scaled about the canvas centre and moved, so the
// whole stroke stays inside the canvas.
const viewInd = Math.max(...anim.layers.map((l) => l.ind ?? 0)) + 1
for (const l of anim.layers) if (l.parent == null) l.parent = viewInd
anim.layers.push({
  ty: 3, nm: 'View', ind: viewInd, ip: 0, op: FRAMES, st: 0, sr: 1, ao: 0,
  ks: { o: { a: 0, k: 0 }, r: { a: 0, k: 0 }, a: { a: 0, k: [256, 256, 0] },
    p: { a: 0, k: [256 + VIEW.dx, 256 + VIEW.dy, 0] }, s: { a: 0, k: [VIEW.scale, VIEW.scale, 100] } },
})

const bytes = await writeTgs(anim)
await writeFile(join(ROOT, 'exports', 'blue', 'finger-ok.tgs'), bytes)

const inst = (await engine()).create(JSON.stringify(anim))
const C = 160
const shots = framesAt(inst.frameCount, 16)
const sheet = new Canvas(C * 8, (C + 16) * 2)
shots.forEach((f, i) => {
  sheet.draw(inst.render(f, C, C).slice(), C, (i % 8) * C, Math.floor(i / 8) * (C + 16) + 16)
  sheet.text(`f ${f}`, (i % 8) * C + 4, Math.floor(i / 8) * (C + 16) + 4, [90, 90, 90])
})
inst.drop()
await writeFile(join(ROOT, 'exports', 'sheets', 'blue-finger-ok.png'), encodePng(sheet.px, sheet.width, sheet.height))
const checks = telegramChecks(anim, bytes.length)
console.log(`exports/blue/finger-ok.tgs ${sizeKb(bytes)} KB, проверки Telegram ${checks.every((c) => c.ok) ? '✓' : '✕'}; exports/sheets/blue-finger-ok.png`)
