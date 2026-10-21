// 🤷 (214–216 → one sticker, from 215): the original body in the pack's colours,
// palms enlarged by 10%, forearms with a continuous curved taper and an overlapping fill,
// and the head of the approved 🤦 —
// the 👤 skull with the ears drawn in, no neck (packs/blue/lib/silhouette.mjs) — on the old head's
// layer, so it moves as before. The mouth is 215's own lips, white; the nose stays an empty layer
// because it carries the mouth.
// Usage: node packs/blue/shrug/build.mjs → exports/blue/shrug.tgs, exports/sheets/blue-shrug.png

import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { ROOT } from '../../../scripts/lib/sheets.mjs'
import { at, baked, finish, head, read, walk, transform, inverse, point, rgb, mapProperty, group, stroke } from '../lib/silhouette.mjs'

execFileSync(process.execPath, [join(ROOT, 'scripts', 'restyle.mjs'), 'blue/shrug'], { stdio: 'ignore' })
const source = await read('packs/blue/shrug/source.tgs')
const anim = await read('exports/blue/shrug.tgs')
const layer = (nm) => anim.layers.find((l) => l.nm === nm)

// the head: the outline path of the old one gives its place and size, frame by frame
const old = layer('HEAD 2')
const oldPath = walk(old.shapes).find((x) => x.ty === 'sh').ks
// HEAD 2 is scaled to 68.394%; compensate its stroke so the visible width matches BODY.
const bodyOutline = walk(layer('BODY').shapes).find((x) => x.ty === 'st').w.k
const headOutline = bodyOutline / (old.ks.s.k[0] / 100)
old.shapes = head(oldPath, { bottom: [0, 160], top: [0, -200], outline: headOutline })

layer('Nose').shapes = []
// The sweater's cuff (a band between the forearm and the hand) becomes a piece of the arm: the
// forearm's fill under it, and each side of the arm is one outline from the elbow up through the
// cuff to the hand, so there is no line across the wrist and no step where the pieces met.
// Forearm and cuff are keyed at different frames: the joined sides are sampled every STEP frames.
const STEP = 3
for (const { nm, forearm } of [
  { nm: 'Hand L', forearm: ['Group 1', 'Group 1'] },
  { nm: 'Hand R', forearm: ['Group 1'] },
]) {
  const l = layer(nm)
  const palm = layer(nm.replace('Hand', 'Wrist'))
  // Grow the palm around its original wrist pivot, without changing gesture timing.
  const PALM_SCALE = 1.10
  palm.ks.s = { a: 0, k: [PALM_SCALE * 100, PALM_SCALE * 100, 100] }
  palm.ks.p.k[0] += nm === 'Hand L' ? 10 : -10
  for (const paint of walk(palm.shapes).filter((x) => x.ty === 'st'))
    paint.w.k /= PALM_SCALE
  // Widen only the wrist/lower palm, fading smoothly before the fingers.
  // The forearm uses these same widened endpoints, so there is no narrow neck at the join.
  const [axis, wristY] = palm.ks.a.k
  const widen = ([x, y]) => {
    const t = Math.max(0, Math.min(1, (y - (wristY - 38)) / 35))
    const weight = t * t * (3 - 2 * t)
    return [axis + (x - axis) * (1 + 0.35 * weight), y]
  }
  for (const shape of walk(palm.shapes).filter((x) => x.ty === 'sh'))
    shape.ks = mapProperty(shape.ks, (p) => {
      const v = p.v.map(widen)
      const tangent = (key) => p.v.map((point, i) =>
        widen(point.map((x, d) => x + p[key][i][d])).map((x, d) => x - v[i][d]))
      return { ...p, v, i: tangent('i'), o: tangent('o') }
    })
  const palmOutline = palm.shapes.find((g) => g.nm === 'Group 4').it.find((x) => x.ty === 'sh')
  const contour = structuredClone(palmOutline.ks)
  const unwrap = (p) => p.v ? p : p[0]
  // The old palm outline still closed across the wrist. Open precisely that edge.
  const order = [...Array.from({ length: 12 }, (_, i) => i + 2), 0, 1]
  palmOutline.ks = mapProperty(contour, (p) => ({ c: false,
    ...Object.fromEntries(['v', 'i', 'o'].map((k) => [k, order.map((i) => p[k][i])])) }))
  const holder = forearm.reduce((g, name) => (g.it ?? g).find((x) => x.nm === name), l.shapes)
  const armKs = holder.it.find((x) => x.ty === 'sh').ks
  const fill = structuredClone(walk(l.shapes).find((x) => x.ty === 'gf'))
  const elbowShadow = nm === 'Hand L' ? structuredClone(l.shapes[0].it.find((g) => g.nm === 'Group 3')) : null
  const round = (p) => p.map((v) => Math.round(v * 1000) / 1000)
  function forearmShape(f, overlap = false) {
    const a = unwrap(at(armKs, f)), p = unwrap(at(contour, f)), m = transform(palm.ks, f)
    const wi = point(m, p.v[1]), wo = point(m, p.v[2])
    const direction = (from, to, length) => {
      const d = from.map((v, j) => v - to[j]), n = Math.hypot(...d)
      return d.map((v) => v / n * length)
    }
    // Cubic sides start below the old cuff and arrive tangent to the palm's sides.
    // The old short, angular cuff section is gone, including its independent fill.
    const lower = nm === 'Hand L' ? [3, 4] : [3]
    function jointHandle(wrist, palmSide, armEnd) {
      const tangent = direction(wrist, palmSide, 1)
      const chord = armEnd.map((x, d) => x - wrist[d]), length = Math.hypot(...chord)
      const axis = chord.map((x) => x / length)
      const lateral = Math.abs(tangent[0] * axis[1] - tangent[1] * axis[0])
      const forward = tangent[0] * axis[0] + tangent[1] * axis[1]
      // Keep the palm tangent, but shorten it when the hand bends away from the
      // forearm. A fixed 34-unit handle pulled a visible hollow around frames 60/120.
      const reach = Math.min(30, length * 0.30, 2.5 / Math.max(lateral, 0.001), forward > 0 ? Infinity : 2)
      return tangent.map((x) => x * reach)
    }
    const di = jointHandle(wi, point(m, p.v[0]), a.v[0])
    const dO = jointHandle(wo, point(m, p.v[3]), a.v[lower[0]])
    const v = [a.v[0], wi, wo, ...lower.map((j) => a.v[j])]
    const i = [a.i[0], di, [0, 0], ...lower.map((j) => a.i[j])]
    const o = [wi.map((x, d) => (x - a.v[0][d]) * 0.42), [0, 0], dO, ...lower.map((j) => a.o[j])]
    if (overlap) {
      // Fill continues 2.5 units inside the palm, sealing antialias/subframe gaps.
      const midpoint = wi.map((x, d) => (x + wo[d]) / 2)
      const inside = point(m, p.v[0].map((x, d) => (x + p.v[3][d]) / 2))
      const shift = direction(inside, midpoint, 2.5)
      v[1] = wi.map((x, d) => x + shift[d]); v[2] = wo.map((x, d) => x + shift[d])
    }
    return { c: true, v: v.map(round), i: i.map(round), o: o.map(round) }
  }
  function edge(f, indices) {
    const p = forearmShape(f), reverse = indices[1] < indices[0]
    return { c: false, v: indices.map((j) => p.v[j]),
      i: indices.map((j) => p[reverse ? 'o' : 'i'][j]), o: indices.map((j) => p[reverse ? 'i' : 'o'][j]) }
  }
  const outerRun = nm === 'Hand L' ? [4, 3, 2] : [3, 2]
  l.shapes = [
    group('Внутренний контур предплечья', [{ ty: 'sh', ks: baked((f) => edge(f, [0, 1]), 180, true, STEP) }, stroke()]),
    group('Внешний контур предплечья', [{ ty: 'sh', ks: baked((f) => edge(f, outerRun), 180, true, STEP) }, stroke()]),
    ...(elbowShadow ? [elbowShadow] : []),
    group('Единая заливка до ладони', [{ ty: 'sh', ks: baked((f) => forearmShape(f, true), 180, true, STEP) }, fill]),
  ]

  // Carry the forearm gradient through the palm's own rotation. The former cuff and
  // the palm then meet at the same colour throughout the gesture, not only at a reference pose.
  for (const g of walk(palm.shapes).filter((x) => x.ty === 'gf')) {
    for (const key of ['s', 'e']) g[key] = baked((f) => {
      const endpoint = at(fill[key], f)
      return point(inverse(transform(palm.ks, f)), endpoint).map((v) => Math.round(v * 1000) / 1000)
    }, anim.op - anim.ip, false, STEP)
  }
  // The old palm shadow ended on the cuff with a hard edge. Fade it out before the
  // wrist instead: retain the palm's volume, with no dark band across the joint.
  const shadow = palm.shapes.find((g) => g.nm === 'Group 5')
  const shadowFill = shadow.it.find((x) => x.ty === 'fl')
  function fadeAxis(f, end) {
    const value = at(contour, f), p = value.v ? value : value[0]
    const start = p.v[1].map((v, d) => (v + p.v[2][d]) / 2)
    const inside = p.v[0].map((v, d) => (v + p.v[3][d]) / 2)
    const direction = inside.map((v, d) => v - start[d]), length = Math.hypot(...direction)
    // Start fading inside the palm, so the whole wrist zone remains shadow-free.
    return start.map((v, d) => Math.round((v + direction[d] / length * (end ? 62 : 14)) * 1000) / 1000)
  }
  shadow.it[shadow.it.indexOf(shadowFill)] = {
    ty: 'gf', nm: 'Мягкая тень ладони', o: { a: 0, k: 60 }, r: 1, t: 1, bm: 0,
    s: baked((f) => fadeAxis(f, false), anim.op - anim.ip, false, STEP),
    e: baked((f) => fadeAxis(f, true), anim.op - anim.ip, false, STEP),
    g: { p: 2, k: { a: 0, k: [0, ...rgb('#44688b'), 1, ...rgb('#44688b'),
      0, 0, 0.35, 0.15, 0.75, 0.7, 1, 1] } },
  }
}

// Palms cover the tiny fill overlap; the forearm must not paint over the palm outline.
for (const suffix of ['L', 'R']) {
  const palm = layer(`Wrist ${suffix}`), arm = layer(`Hand ${suffix}`)
  anim.layers.splice(anim.layers.indexOf(palm), 1)
  anim.layers.splice(anim.layers.indexOf(arm), 0, palm)
}

// the lips: outline and mouth white, the warm shade under the lower lip dropped
const mouth = layer('Mouth')
mouth.shapes = mouth.shapes.filter((g) => g.nm !== 'Group 3')
for (const x of walk(mouth.shapes)) if (x.c) x.c = { a: 0, k: [1, 1, 1, 1] }

await finish('shrug', source, anim, [0, 30, 55, 60, 65, 85, 105, 115, 120, 125, 150, 179])
