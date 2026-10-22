// The small blue V hand, back to the camera, made from 154 (backhand index pointing up), restyled
// blue by its own recipe (packs/blue/tongue-victory-hand): its pose at frame `pose` frozen and the
// raised index copied once more as the middle finger, standing on the middle finger's own knuckle
// (the first one beside the index) and turned out from it. Like the index in 154, the copy lies
// under the hand's fill, so the back of the hand covers its root and the hand's gradient runs on
// into it; the knuckle's arc is cut out of the hand's outline there. Returns the hand animation and
// bend(keys), which turns both fingers on their knuckles over time.
import {execFileSync} from 'node:child_process'
import {rm} from 'node:fs/promises'
import {join} from 'node:path'
import {ROOT} from '../../../scripts/lib/sheets.mjs'
import {inverse,mul,point,read,transform,world} from '../lib/silhouette.mjs'
import {freeze} from '../lib/freeze.mjs'

const FINGER = ['Index stroke', 'Index Light', 'Index Fill'] // its shade is drawn for the index only
// (stroke, highlight, fill: the fill only lends its outline to the hand's fill)

export async function victoryHand(cfg) {
  execFileSync(process.execPath, [join(ROOT, 'scripts/restyle.mjs'), 'blue/tongue-victory-hand'], { stdio: 'ignore' })
  const hand = freeze(await read('exports/blue/tongue-victory-hand.tgs'), cfg.pose)
  // only a part: not left among the drafts
  await rm(join(ROOT, 'exports/blue/tongue-victory-hand.tgs'), { force: true })
  await rm(join(ROOT, 'exports/sheets/blue-tongue-victory-hand.png'), { force: true })
  const layers = hand.layers
  let ind = Math.max(...layers.map((l) => l.ind)) + 1
  const byName = (nm) => layers.find((l) => l.nm === nm)
  const overall = byName('Overall')
  // some positions are split into x and y; frozen they are plain numbers, which the matrices want together
  for (const l of layers) if (l.ks.p?.s) l.ks.p = { a: 0, k: [l.ks.p.x.k, l.ks.p.y.k, 0] }
  const toOverall = inverse(world(layers, overall, 0)) // the hand's canvas → Overall's space

  // the copy: moved by (dx, dy) on the canvas, then turned about the knuckle it stands on
  const [kx, ky] = cfg.knuckle
  const [ix, iy] = cfg.index_root
  const knuckle = point(toOverall, [kx, ky])
  const shift = [point(toOverall, [kx - ix + 256, ky - iy + 256]), point(toOverall, [256, 256])]
  const [dx, dy] = [shift[0][0] - shift[1][0], shift[0][1] - shift[1][1]]
  const pivot = { ty: 3, nm: 'Middle knuckle', ind: ind++, parent: overall.ind, ip: 0, op: 240, st: 0, sr: 1, ao: 0,
    ks: { o: { a: 0, k: 100 }, r: { a: 0, k: cfg.middle_tilt }, p: { a: 0, k: [...knuckle, 0] }, a: { a: 0, k: [...knuckle, 0] }, s: { a: 0, k: [100, 100, 100] } } }

  const middle = FINGER.map((nm) => {
    const l = byName(nm)
    const copy = structuredClone(l)
    copy.nm = l.nm.replace('Index', 'Middle')
    copy.ind = ind++
    copy.parent = pivot.ind
    const p = copy.ks.p.k
    copy.ks.p = { a: 0, k: [p[0] + dx, p[1] + dy, 0] }
    // The body gradient was fitted on the canvas; carried back so that, on the canvas, the
    // copy's gradient is the hand's own and the finger grows out of the hand without a seam.
    const back = mul(inverse(mul(transform(pivot.ks, 0), transform(copy.ks, 0))), transform(l.ks, 0))
    const regrade = (list, outer) => {
      for (const it of list) {
        if (it.ty === 'gr') regrade(it.it, mul(outer, transform(it.it.find((x) => x.ty === 'tr'), 0)))
        if (it.ty === 'gf') {
          const m = mul(inverse(outer), mul(back, outer))
          for (const key of ['s', 'e']) it[key] = { a: 0, k: point(m, it[key].k) }
        }
      }
    }
    regrade(copy.shapes, [1, 0, 0, 1, 0, 0])
    return copy
  })

  // the middle knuckle's arc (the end of the knuckle line, which runs from the little finger to
  // the index) is where the finger now stands
  const knuckles = byName('Palm stroke').shapes.find((g) => g.nm === cfg.knuckle_line.group)
  knuckles.it.splice(knuckles.it.findIndex((x) => x.ty === 'st'), 0,
    { ty: 'tm', s: { a: 0, k: 0 }, e: { a: 0, k: cfg.knuckle_line.end }, o: { a: 0, k: 0 }, m: 1 })

  // The index turns out from its own knuckle too, as in a real V. In 154 the hand's fill also draws
  // the index's silhouette and the knuckles over both fingers; that top is cut off at the knuckle
  // line (and the middle knuckle's highlight with it), and both fingers become part of the hand's
  // own fill (below), so one shape and one gradient run from the wrist to the fingertips.
  const ROUND = 1e3
  const linear = (m, v) => [m[0] * v[0] + m[2] * v[1], m[1] * v[0] + m[3] * v[1]]
  const flatten = (layer, [x0, x1], cut) => {
    const walkPaths = (list, outer) => {
      for (const it of list) {
        if (it.ty === 'gr') walkPaths(it.it, mul(outer, transform(it.it.find((x) => x.ty === 'tr'), 0)))
        if (it.ty !== 'sh') continue
        const fromCanvas = inverse(outer)
        const shape = it.ks.k
        shape.v = shape.v.map((v, i) => {
          const [x, y] = point(outer, v)
          if (x < x0 || x > x1 || y >= cut) return v
          // on the line, its handles laid along it
          for (const key of ['i', 'o']) {
            const t = linear(outer, shape[key][i])
            shape[key][i] = linear(fromCanvas, [t[0], 0]).map((n) => Math.round(n * ROUND) / ROUND)
          }
          return point(fromCanvas, [x, cut])
        })
      }
    }
    walkPaths(layer.shapes, world(layers, layer, 0))
  }
  for (const nm of cfg.flatten.layers) flatten(byName(nm), cfg.flatten.x, cfg.flatten.y)
  // the knuckles' highlight loses the middle knuckle: its points there gather into one, where the
  // ring finger's knuckle starts, so the highlight ends there without a sliver under the finger
  const H = cfg.middle_highlight
  const gather = (list, outer) => {
    for (const it of list) {
      if (it.ty === 'gr') gather(it.it, mul(outer, transform(it.it.find((x) => x.ty === 'tr'), 0)))
      if (it.ty !== 'sh') continue
      const k = it.ks.k
      k.v.forEach((v, i) => {
        const [x] = point(outer, v)
        if (x < H.x[0] || x > H.x[1]) return
        k.v[i] = point(inverse(outer), H.to)
        k.i[i] = [0, 0]
        k.o[i] = [0, 0]
      })
    }
  }
  gather(byName(H.layer).shapes, world(layers, byName(H.layer), 0))

  const indexPivot = { ...structuredClone(pivot), nm: 'Index knuckle', ind: ind++ }
  const indexKnuckle = point(toOverall, cfg.index_root)
  indexPivot.ks.p = { a: 0, k: [...indexKnuckle, 0] }
  indexPivot.ks.a = { a: 0, k: [...indexKnuckle, 0] }
  indexPivot.ks.r = { a: 0, k: -cfg.index_tilt }
  const index = ['Index stroke', 'Index Light', 'Index Fill'].map(byName)
  for (const l of index) l.parent = indexPivot.ind
  const all = [...layers, pivot, indexPivot, ...middle]

  // the fingers' outlines join every fill of the back of the hand: same paint, one silhouette
  const fills = byName('Shape Layer 6')
  const shapeTo = (fromM, toM, k) => {
    const m = mul(inverse(toM), fromM)
    return { c: k.c, v: k.v.map((v) => point(m, v)), i: k.i.map((t) => linear(m, t)), o: k.o.map((t) => linear(m, t)) }
  }
  const fingerPaths = [['index', index[2]], ['middle', middle[2]]].flatMap(([finger, l]) => l.shapes.filter((g) => g.ty === 'gr').flatMap((g) => {
    const m = mul(world(all, l, 0), transform(g.it.find((x) => x.ty === 'tr'), 0))
    return g.it.filter((x) => x.ty === 'sh').map((sh) => ({ finger, m, k: sh.ks.k }))
  }))
  const inFills = [] // each finger's outline in each fill, to turn with its finger (bend, below)
  for (const g of fills.shapes.filter((g) => cfg.hand_fills.some((p) => g.nm.startsWith(p)))) {
    const gm = mul(world(all, fills, 0), transform(g.it.find((x) => x.ty === 'tr'), 0))
    const at = g.it.findIndex((x) => x.ty === 'sh')
    const paths = fingerPaths.map((f) => ({ ...f, gm, sh: { ty: 'sh', ks: { a: 0, k: shapeTo(f.m, gm, f.k) } } }))
    g.it.splice(at, 0, ...paths.map((f) => f.sh))
    inFills.push(...paths)
  }

  // Over the hand: the fingers' outlines and highlights (their own fills and the index's shade
  // go); the middle finger's outline starts at the knuckles (the index's left side runs on
  // along the thumb, as in 154)
  // Where, along a finger's outline, it comes nearest to a point of the canvas (% of its length):
  // the inner sides end exactly at the crotch, the outer ones at the knuckles / along the thumb.
  const along = (l, target) => {
    const g = l.shapes.find((x) => x.ty === 'gr')
    const m = mul(world(all, l, 0), transform(g.it.find((x) => x.ty === 'tr'), 0))
    const k = g.it.find((x) => x.ty === 'sh').ks.k
    const pts = []
    for (let n = 0; n < k.v.length - (k.c ? 0 : 1); n++) {
      const a = k.v[n], b = k.v[(n + 1) % k.v.length]
      const c1 = [a[0] + k.o[n][0], a[1] + k.o[n][1]], c2 = [b[0] + k.i[(n + 1) % k.v.length][0], b[1] + k.i[(n + 1) % k.v.length][1]]
      for (let t = n ? 1 : 0; t <= 40; t++) {
        const u = t / 40, w = [(1 - u) ** 3, 3 * (1 - u) ** 2 * u, 3 * (1 - u) * u * u, u ** 3]
        pts.push(point(m, [0, 1].map((d) => w[0] * a[d] + w[1] * c1[d] + w[2] * c2[d] + w[3] * b[d])))
      }
    }
    let total = 0, best = 0, bestD = Infinity
    const lengths = pts.map((p, n) => (total += n ? Math.hypot(p[0] - pts[n - 1][0], p[1] - pts[n - 1][1]) : 0))
    pts.forEach((p, n) => {
      const d = Math.hypot(p[0] - target[0], p[1] - target[1])
      if (d < bestD) { bestD = d; best = n }
    })
    return (lengths[best] / total) * 100
  }
  const { from: A, to: B, depth } = cfg.crotch
  const trims = [
    [index[0], along(index[0], cfg.index_outer_end), along(index[0], A)],
    [middle[0], along(middle[0], B), along(middle[0], cfg.middle_outer_end)],
  ]
  for (const [l, from, to] of trims) {
    for (const g of l.shapes.filter((x) => x.ty === 'gr')) {
      g.it.splice(g.it.findIndex((x) => x.ty === 'st'), 0,
        { ty: 'tm', s: { a: 0, k: Math.min(from, to) }, e: { a: 0, k: Math.max(from, to) }, o: { a: 0, k: 0 }, m: 1 })
    }
  }
  // the crotch of the V: one outline from the index's inner side round to the middle's
  const outline = middle[0].shapes.flatMap((g) => g.it).find((x) => x.ty === 'st')
  const toFills = inverse(world(all, fills, 0))
  const [a, b] = [point(toFills, A), point(toFills, B)]
  const low = linear(toFills, [0, depth])
  const crotch = { ty: 'gr', nm: 'Crotch', it: [
    { ty: 'sh', ks: { a: 0, k: { c: false, v: [a, b], o: [low, [0, 0]], i: [[0, 0], low] } } },
    structuredClone(outline),
    { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
  ] }
  fills.shapes.unshift(crotch)
  // No wrist, as on the pack's other hands: the hand's body path loses its points below the wrist
  // line and closes with a round bottom (both handles straight down), drawn with the outline too.
  const W = cfg.no_wrist
  const body = byName(W.body)
  const bodyM = world(layers, body, 0)
  let bottom = null
  for (const g of body.shapes.filter((x) => x.ty === 'gr')) {
    const m = mul(bodyM, transform(g.it.find((x) => x.ty === 'tr'), 0))
    const back = inverse(m)
    for (const sh of g.it.filter((x) => x.ty === 'sh')) {
      const k = sh.ks.k
      const n = k.v.length
      const low = k.v.map((v) => point(m, v)[1] > W.cut)
      const keep = k.v.map((_, i) => !low[i])
      const before = keep.findIndex((on, i) => on && low[(i + 1) % n]) // last point above the cut
      let after = (before + 1) % n
      while (!keep[after]) after = (after + 1) % n // first point above the cut, past the wrist
      const down = linear(back, [0, W.round])
      k.o[before] = down
      k.i[after] = down
      bottom = [point(m, k.v[before]), point(m, k.v[after])]
      for (const key of ['v', 'i', 'o']) k[key] = k[key].filter((_, i) => keep[i])
    }
  }
  const outlineLayer = byName('Palm stroke')
  const toOutline = inverse(world(layers, outlineLayer, 0))
  const [L, R] = bottom.map((p) => point(toOutline, p))
  const drop = linear(toOutline, [0, W.round])
  outlineLayer.shapes.push({ ty: 'gr', nm: 'Round bottom', it: [
    { ty: 'sh', ks: { a: 0, k: { c: false, v: [L, R], o: [drop, [0, 0]], i: [[0, 0], drop] } } },
    structuredClone(outlineLayer.shapes.flatMap((g) => g.it ?? []).find((x) => x.ty === 'st')),
    { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
  ] })

  // Turning the fingers (keys: [{t, index, middle}], their pivots' angles): the pivots carry the
  // outlines and highlights, and the same turn, about the same knuckle, is baked into the fingers'
  // outlines in the hand's fill and into the crotch's two ends, so fill and outline move as one.
  const pivots = { index: indexPivot, middle: pivot }
  const rest = { index: indexPivot.ks.r.k, middle: pivot.ks.r.k }
  const overallM = world(all, overall, 0)
  const turn = (finger, r) => {
    const ks = pivots[finger].ks
    return mul(mul(overallM, transform({ ...ks, r: { a: 0, k: r } }, 0)), inverse(mul(overallM, transform({ ...ks, r: { a: 0, k: rest[finger] } }, 0))))
  }
  const crotchPath = crotch.it[0].ks.k
  const cent = (n) => Math.round(n * 100) / 100
  const rounded = (k) => ({ c: k.c, ...Object.fromEntries(['v', 'i', 'o'].map((key) => [key, k[key].map((p) => p.map(cent))])) })
  const linearKeys = (keys, value) => ({ a: 1, k: keys.map((key, n) => ({ t: key.t, s: value(key),
    ...(n < keys.length - 1 && { o: { x: [0], y: [0] }, i: { x: [1], y: [1] } }) })) })
  const bend = (keys) => {
    for (const finger of ['index', 'middle']) pivots[finger].ks.r = linearKeys(keys, (key) => [key[finger]])
    for (const f of inFills) f.sh.ks = linearKeys(keys, (key) => [rounded(shapeTo(mul(turn(f.finger, key[f.finger]), f.m), f.gm, f.k))])
    const ends = [[A, 'index'], [B, 'middle']]
    crotch.it[0].ks = linearKeys(keys, (key) => [rounded({ ...crotchPath,
      v: ends.map(([p, finger]) => point(toFills, point(turn(finger, key[finger]), p))) })])
  }

  const gone = new Set([byName('Index Fill'), byName('Index Shad 3'), ...W.drop.map(byName), ...index, ...middle])
  hand.layers = [index[0], middle[0], index[1], middle[1], ...layers.filter((l) => !gone.has(l)), pivot, indexPivot]
  return { hand, bend }
}
