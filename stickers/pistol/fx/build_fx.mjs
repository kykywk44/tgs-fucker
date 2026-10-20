// Builds stickers/pistol/fx/steam.json: our own effects source for the muzzle — thin wisps of
// steam instead of a smoke cloud. Each candidate is a precomp (200×240, the base point at
// [100, 220] sits on the muzzle), 60 fps, ~0.8 s; flat light greys, no outlines. Wisps use the
// trim-path recipe of AngrySticker's steam lines (end runs up, then start follows, the width
// thins to 0), which Telegram renders.
// Usage: node stickers/pistol/fx/build_fx.mjs   (then motion.json / fx-gallery read it via "sources")
import { readFile, writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..', '..')
const LIGHT = [0.96, 0.965, 0.975, 1], SHADE = [0.79, 0.81, 0.84, 1], PALE = [0.91, 0.925, 0.94, 1]
const EASE = { out: [[0.2, 0.8], [0.4, 1]], inOut: [[0.42, 0], [0.58, 1]], in: [[0.6, 0], [0.8, 0.2]], lin: [[0, 0], [1, 1]] }

// animated property from [frame, value, ease-to-next] triples
const anim = (keys) => ({
  a: 1,
  k: keys.map(([t, v, e = 'inOut'], n) => {
    const s = Array.isArray(v) ? v : [v]
    if (n === keys.length - 1) return { t, s }
    const [[ox, oy], [ix, iy]] = EASE[e]
    return { t, s, o: { x: s.map(() => ox), y: s.map(() => oy) }, i: { x: s.map(() => ix), y: s.map(() => iy) } }
  }),
})
const still = (v) => ({ a: 0, k: v })
const shift = (prop, d) => (prop.a ? { a: 1, k: prop.k.map((k) => ({ ...k, t: k.t + d })) } : prop)
const tr = () => ({ ty: 'tr', p: still([0, 0]), a: still([0, 0]), s: still([100, 100]), r: still(0), o: still(100), sk: still(0), sa: still(0) })

// open bezier through points with vertical tangents (a rising curl)
function curl(points, k = 0.35) {
  const v = points, n = v.length
  const tan = v.map((p, j) => {
    const a = v[Math.max(0, j - 1)], b = v[Math.min(n - 1, j + 1)]
    return [(b[0] - a[0]) * k * 0.5, (b[1] - a[1]) * k * 0.5]
  })
  return { c: false, v, i: tan.map(([x, y]) => [-x, -y]), o: tan }
}

function stroke(path, color, width, trim, dx = 0, dy = 0) {
  const g = tr(); g.p = still([dx, dy])
  return { ty: 'gr', it: [{ ty: 'sh', ks: still(path) }, { ty: 'tm', s: trim.s, e: trim.e, o: still(0), m: 1 },
    { ty: 'st', c: still(color), o: still(100), w: width, lc: 2, lj: 2 }, g] }
}

function layer(ind, nm, shapes, ks, ip, op) {
  return { ddd: 0, ind, ty: 4, nm, sr: 1, ao: 0, bm: 0, ip, op, st: 0, shapes,
    ks: { o: still(100), r: still(0), p: still([0, 0, 0]), a: still([0, 0, 0]), s: still([100, 100, 100]), ...ks } }
}

// one wisp: a curl drawn upwards from the base, its tail following, thinning out, swaying and drifting
function wisp(ind, { d = 0, scale = 100, flip = false, dx = 0, len = 44, width = 15, height = 170, sway = 6, tone = 2 } = {}) {
  const h = height, pts = [[0, 0], [-8, -h * 0.3], [9, -h * 0.58], [-3, -h * 0.85], [4, -h]]
  const path = curl(pts)
  const trim = { e: anim([[d, 0, 'out'], [d + len * 0.5, 100]]), s: anim([[d + len * 0.2, 0, 'inOut'], [d + len, 100]]) }
  const w = (k) => anim([[d, width * k, 'inOut'], [d + len * 0.45, width * k, 'in'], [d + len, 0]])
  const shapes = [stroke(path, LIGHT, w(1), trim)]
  if (tone === 2) shapes.push(stroke(path, SHADE, w(1.35), trim, 2.5, 2))
  const sx = (flip ? -1 : 1) * scale
  return layer(ind, `wisp ${ind}`, shapes, {
    p: anim([[d, [100 + dx, 220, 0], 'out'], [d + len, [100 + dx, 200, 0]]]),
    s: still([sx, scale, 100]),
    r: anim([[d, 0, 'inOut'], [d + len * 0.5, sway, 'inOut'], [d + len, -sway * 0.5]]),
  }, d, d + len + 1)
}

// one small puff: a circle with a shade, rising, shrinking and fading
function puff(ind, { d = 0, r = 9, rise = 90, wob = 8, len = 40 } = {}) {
  const circle = (c, off) => ({ ty: 'gr', it: [{ ty: 'el', p: still([off, off]), s: still([r * 2, r * 2]) }, { ty: 'fl', c: still(c), o: still(100), r: 1 }, tr()] })
  return layer(ind, `puff ${ind}`, [circle(LIGHT, 0), circle(SHADE, 2)], {
    p: anim([[d, [100, 220, 0], 'out'], [d + len * 0.5, [100 + wob, 220 - rise * 0.7, 0], 'inOut'], [d + len, [100 - wob * 0.5, 220 - rise, 0]]]),
    s: anim([[d, [60, 60, 100], 'out'], [d + len * 0.3, [100, 100, 100], 'inOut'], [d + len, [45, 45, 100]]]),
    o: anim([[d, 95, 'lin'], [d + len * 0.55, 95, 'in'], [d + len, 0]]),
  }, d, d + len + 1)
}

// AngrySticker's recipe: a plain curve, one pale tone, the width going to 0 at the end
function angryLine(ind, { d = 0, dx = 0, flip = false, len = 34 } = {}) {
  const path = { c: false, v: [[0, 0], [-14, -88], [10, -160]], i: [[0, 40], [0, 26], [0, 38]], o: [[0, -40], [0, -30], [0, -60]] }
  const trim = { e: anim([[d, 0, 'inOut'], [d + len * 0.9, 100]]), s: anim([[d + len * 0.35, 0, 'inOut'], [d + len, 100]]) }
  const w = anim([[d + len * 0.5, 12, 'lin'], [d + len, 0]])
  return layer(ind, `line ${ind}`, [stroke(path, PALE, w, trim)], {
    p: still([100 + dx, 220, 0]), s: still([flip ? -100 : 100, 100, 100]),
  }, d, d + len + 1)
}

// CoffeeSticker's steam: three tapered ribbons with curled ends, a white fill fading to the top
// (gradient alpha 1 → 0.5 → 0), their paths morphing. In the cup the steam grows, hangs, then
// rises and breaks up; here the hang is cut — the grow keys (124 → 179) and the rise keys
// (0 → 33) run back to back, the whole layer keeps drifting up and fades out, so it never stops.
// `twist`: the outer ribbons swap sides while each one narrows and widens (a part turn) and leans
// the other way, so the wisps seem to wind round each other.
const coffeeSrc = JSON.parse(gunzipSync(await readFile(join(ROOT, 'gun_refs/CoffeeSticker.tgs'))).toString())
const coffeeSteam = coffeeSrc.layers.find((l) => l.nm === 'steam')
const GROW = 18, RISE = 26, CLEAR = 6 // frames: grow, rise and break up, last fade
function retimeCoffee(t) {
  if (t >= 124) return ((t - 124.156) * GROW) / (179 - 124.156)
  return GROW + (t * RISE) / 33
}
// `keep`: which ribbons stay (0 the small left one, 1 the right one, 2 the tall middle one).
// `base`: the layer point put at the comp's [256, 420] (the muzzle) — [262, 208] is the foot of the
// tall ribbon. `join`: per ribbon [dx, dy, sx] — moved (and mirrored with sx < 0) so several
// ribbons rise from that one foot and overlap. `grow`: per ribbon [delay, frames] — the ribbon grows
// out of the foot upwards like real smoke (y scale 0 → 100 around the foot, x 55 → 100), its
// morph starting with it; ribbons with different delays and speeds rise one after another.
// `rise`: once grown the ribbon keeps stretching upwards (y 100 → 150 %, a little thinner) while its
// fill fades out from the bottom up (the gradient's alpha stops sweep towards the top).
function coffee(ind, { twist = false, drift = -90, sway = 6, keep = [0, 1, 2], base = [233.5, 208], join = {}, grow, rise = false } = {}) {
  const late = grow ? Math.max(...Object.values(grow).map(([d]) => d)) : 0
  const shapes = structuredClone(coffeeSteam.shapes).filter((_, n) => keep.includes(n))
  shapes.forEach((g, k) => {
    const n = keep[k]
    const sh = g.it.find((x) => x.ty === 'sh')
    const [delay, len] = grow?.[n] ?? [0, 0]
    const keys = sh.ks.k.filter((k) => k.t >= 124 || k.t <= 33.5).map((k) => ({ ...k, t: Math.round((retimeCoffee(k.t) + delay) * 100) / 100 }))
    keys.sort((a, b) => a.t - b.t)
    delete keys[keys.length - 1].o; delete keys[keys.length - 1].i
    // rising smoke never pauses: the morph runs at an even pace between its keys (no ease to rest)
    if (rise) for (const key of keys) if (key.o) { key.o = { x: 0.33, y: 0.33 }; key.i = { x: 0.67, y: 0.67 } }
    sh.ks = { a: 1, k: keys }
    const gtr = g.it.find((x) => x.ty === 'tr')
    const [dx, dy, sx] = join[n] ?? [0, 0, 100]
    // a mirrored ribbon turns around its foot ([262, 208] in layer space), not around the group origin
    const [px, py] = sx < 0 ? [2 * 262 - gtr.p.k[0] + dx, gtr.p.k[1] + dy] : [gtr.p.k[0] + dx, gtr.p.k[1] + dy]
    gtr.p = still([px, py])
    if (sx !== 100) gtr.s = still([sx, 100])
    if (grow) {
      // scaled around the foot: content point foot − P sits at the foot, mirroring included
      const P = sx < 0 ? [gtr.p.k[0], gtr.p.k[1]] : [px, py]
      const m = sx < 0 ? -1 : 1, foot = [262, 208]
      const Pm = sx < 0 ? [2 * foot[0] - P[0], P[1]] : P // the unmirrored group origin
      gtr.a = still([foot[0] - Pm[0], foot[1] - Pm[1]])
      gtr.p = still(foot)
      gtr.s = rise ? riseScale(delay, GROW + RISE + CLEAR, len, m) : anim([[delay, [55 * m, 0], 'out'], [delay + len, [100 * m, 100]]])
    }
    if (rise) {
      // alpha stops at 0, 0.35, 0.67, 1 (bottom → top): solid foot, then the bottom clears upwards
      const gf = g.it.find((x) => x.ty === 'gf')
      const colors = gf.g.k.k.slice(0, gf.g.p * 4)
      const alpha = (a) => [...colors, 0, a[0], 0.35, a[1], 0.67, a[2], 1, a[3]]
      const t0 = delay + len * 0.6, t1 = GROW + RISE * 0.45 + delay, t2 = GROW + RISE + CLEAR + delay
      gf.g.k = anim([[0, alpha([1, 1, 0.5, 0]), 'lin'], [t0, alpha([1, 1, 0.5, 0]), 'inOut'], [t1, alpha([0, 0.55, 0.5, 0]), 'inOut'], [t2, alpha([0, 0, 0.25, 0])]])
    }
    const end = GROW + RISE
    if (twist) {
      // outer ribbons swap sides, each ribbon turns part-way (narrows and widens again, never edge-on)
      // and they lean in opposite directions — read together as wisps winding round each other
      const cross = [22, 0, -22][n], narrow = [55, 65, 50][n], r = [9, -sway, -8][n]
      gtr.p = anim([[0, [px, py], 'inOut'], [end, [px + cross, py - 6]]])
      gtr.s = anim([[0, [100, 100], 'inOut'], [GROW + RISE * 0.45, [narrow, 104], 'inOut'], [end, [92, 100]]])
      gtr.r = anim([[0, 0, 'inOut'], [GROW + RISE * 0.5, -r * 0.4, 'inOut'], [end, r]])
    }
  })
  return layer(ind, `coffee steam ${ind}`, shapes, {
    a: still([...base, 0]),
    // drifting up starts slowly while it grows, so the foot stays at the muzzle at first
    p: anim([[0, [256, 420, 0], grow ? 'in' : 'lin'], [GROW + RISE + CLEAR + late, [256, 420 + drift, 0]]]),
    r: anim([[0, 0, 'inOut'], [GROW + RISE + CLEAR + late, sway]]),
    o: anim([[0, 0, 'out'], [grow ? 10 : 4, 90, 'lin'], [GROW + RISE * 0.45 + late, 90, 'in'], [GROW + RISE + CLEAR + late, 0]]),
  }, 0, GROW + RISE + CLEAR + late + 1)
}

// Grow and stretch as one motion that only slows down, never stops: y follows 150 × (1 − (1 − u)^2.2)
// over the whole life (≈100 % when the grow ends, 150 % at the end); x widens to 100 % while it
// grows, then thins to 84 %. Sampled every 3 frames, linear in between.
function riseScale(delay, life, grow, m) {
  const keys = []
  for (let f = 0; f <= life; f += 3) {
    const u = Math.min(1, f / life), g = Math.min(1, f / grow)
    const sy = 150 * (1 - Math.pow(1 - u, 2.2))
    const sx = 55 + 45 * Math.pow(g, 0.7) - 16 * Math.max(0, (f - grow) / (life - grow))
    keys.push([delay + f, [Math.round(sx * m * 10) / 10, Math.round(sy * 10) / 10], 'lin'])
  }
  return anim(keys)
}

const comp = (id, layers, w = 200, h = 240) => ({ id, w, h, layers: layers.map((l, n) => ({ ...l, ind: n + 1 })) })
const assets = [
  comp('wisp_one', [wisp(1)]),
  comp('wisp_two', [wisp(1, { dx: -6 }), wisp(2, { d: 6, scale: 70, flip: true, dx: 12, len: 38 })]),
  comp('puff_chain', [puff(1, { r: 9 }), puff(2, { d: 5, r: 7, rise: 80, wob: -7 }), puff(3, { d: 10, r: 6, rise: 95, wob: 6 }), puff(4, { d: 15, r: 4.5, rise: 70, wob: -4, len: 32 })]),
  comp('coffee', [coffee(1)], 512, 512),
  comp('coffee_one', [coffee(1, { keep: [2] })], 512, 512),
  comp('coffee_two', [coffee(1, { keep: [1, 2] })], 512, 512),
  comp('coffee_one_foot', [coffee(1, { keep: [2], base: [262, 208] })], 512, 512),
  // the right ribbon moved onto the tall one's foot: both rise from one point and overlap
  comp('coffee_two_joined', [coffee(1, { keep: [1, 2], base: [262, 208], join: { 1: [-16, 4, 100] } })], 512, 512),
  // the same, the short ribbon mirrored: it curls the other way and crosses the tall one
  comp('coffee_two_crossed', [coffee(1, { keep: [1, 2], base: [262, 208], join: { 1: [10, 4, -100] } })], 512, 512),
  // growing from the foot upwards; two ribbons with their own delay and speed
  comp('coffee_one_grow', [coffee(1, { keep: [2], base: [262, 208], grow: { 2: [0, 24] } })], 512, 512),
  comp('coffee_one_rise', [coffee(1, { keep: [2], base: [262, 208], grow: { 2: [0, 24] }, rise: true })], 512, 512),
  comp('coffee_two_joined_grow', [coffee(1, { keep: [1, 2], base: [262, 208], join: { 1: [-16, 4, 100] }, grow: { 2: [0, 24], 1: [7, 16] } })], 512, 512),
  comp('coffee_two_crossed_grow', [coffee(1, { keep: [1, 2], base: [262, 208], join: { 1: [10, 4, -100] }, grow: { 2: [5, 26], 1: [0, 18] } })], 512, 512),
  comp('coffee_two_left', [coffee(1, { keep: [0, 2] })], 512, 512),
  comp('coffee_twist', [coffee(1, { twist: true })], 512, 512),
  comp('angry_lines', [angryLine(1, { dx: -8 }), angryLine(2, { d: 5, dx: 10, flip: true, len: 30 })]),
]
const out = { v: '5.7.0', fr: 60, ip: 0, op: 60, w: 512, h: 512, nm: 'pistol steam', ddd: 0, assets, layers: [] }
await writeFile(join(HERE, 'steam.json'), JSON.stringify(out))
console.log('stickers/pistol/fx/steam.json:', assets.map((a) => a.id).join(', '))
