// Restyles an existing sticker into a pack's look without touching its animation:
// paints are swapped by colour, and the colours marked "body" become the pack's body gradient.
//
//   packs/<pack>/style.json          body gradient stops: { "body": { "stops": [[0, "#44688b"], ...] } }
//   packs/<pack>/<name>/source.tgs   the original sticker (never edited)
//   packs/<pack>/style.json          also "colors" (source → pack colour, or "body") shared by every
//                                    recipe, and "ramp" ([source, pack] pairs): any other warm colour
//                                    (glows, gradient stops) takes the pack colour at its own lightness
//   packs/<pack>/<name>/recipe.json  { "library": "167", "frame": 100, "colors": { … }, "remove": ["Sleeve"], "fade": { "Palm Light": 25 }, "repaint": { "HEAD": { "#f4ac00": "#ffcf00" } } } — colours override
//                                    style.json, "frame" (default: the middle) is where the gradient is fitted
// → exports/<pack>/<name>.tgs, exports/sheets/<pack>-<name>.png (12 frames, original above, restyled below)
//
// The body gradient runs bottom (stop 0) → top (stop 1) over every body-painted shape together at
// `frame`, in canvas space, so adjoining pieces meet without seams; each fill gets it in its own
// coordinates, so it moves with the drawing afterwards.
// Usage: node scripts/restyle.mjs <pack>/<name> [...]

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Canvas, ROOT, encodePng, engine, framesAt, load } from './lib/sheets.mjs'
import { normalizeHandHighlights } from '../packs/blue/lib/hand-highlights.mjs'

const CELL = 192

const { readTgs, writeTgs, sizeKb } = await load('src/core/tgs.ts')
const { telegramChecks } = await load('src/core/checks.ts')

// ---------- values and matrices ----------

const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)

// Value of an animatable property at a frame (linear between keyframes; good enough for a reference pose).
function valueAt(prop, frame, fallback) {
  if (!prop) return fallback
  if (!prop.a) return prop.k
  const ks = prop.k
  if (frame <= ks[0].t) return ks[0].s
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i]
    const b = ks[i + 1]
    if (frame < b.t) {
      const to = a.e ?? b.s
      if (!to || a.h) return a.s
      const u = (frame - a.t) / (b.t - a.t)
      return mix(a.s, to, u)
    }
  }
  const last = ks[ks.length - 1]
  return last.s ?? ks[ks.length - 2].e
}
function mix(a, b, u) {
  if (typeof a === 'number') return a + (b - a) * u
  if (Array.isArray(a)) return a.map((v, i) => mix(v, b[i], u))
  if (a && typeof a === 'object') return { ...a, ...Object.fromEntries(['i', 'o', 'v'].map((k) => [k, mix(a[k], b[k], u)])) }
  return a
}

// Affine [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f.
const I = [1, 0, 0, 1, 0, 0]
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
]
const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
function invert(m) {
  const det = m[0] * m[3] - m[1] * m[2]
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det]
}

// Keyframes of a one-dimensional property hold [value].
const scalar = (v) => (Array.isArray(v) ? v[0] : v)

// Lottie transform: T(p) · R(r) · S(s) · T(-a).
function transform(tr, frame) {
  if (!tr) return I
  const a = valueAt(tr.a, frame, [0, 0])
  const p = tr.p?.s ? [scalar(valueAt(tr.p.x, frame, 0)), scalar(valueAt(tr.p.y, frame, 0))] : valueAt(tr.p, frame, [0, 0])
  const s = valueAt(tr.s, frame, [100, 100])
  const r = (scalar(valueAt(tr.r, frame, 0)) * Math.PI) / 180
  const sx = s[0] / 100
  const sy = s[1] / 100
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const rs = [cos * sx, sin * sx, -sin * sy, cos * sy, 0, 0]
  return mul([1, 0, 0, 1, p[0], p[1]], mul(rs, [1, 0, 0, 1, -a[0], -a[1]]))
}

function layerMatrix(layers, layer, frame) {
  const own = transform(layer.ks, frame)
  if (layer.parent == null) return own
  const parent = layers.find((l) => l.ind === layer.parent)
  return mul(layerMatrix(layers, parent, frame), own)
}

// ---------- restyle ----------

const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
function hueSat([r, g, b]) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (!d) return [0, 0]
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, d / max]
}

// Colours not named in the map: a warm (skin-like) one takes the colour of the pack's ramp at
// its own lightness, between the ramp's anchors (source colour → pack colour, ordered by luma);
// anything else (pens, metal, eyes) stays.
function makeMapper(colors, ramp) {
  const anchors = (ramp ?? []).map(([from, to]) => [luma(rgb(from)), rgb(to)]).sort((a, b) => a[0] - b[0])
  return (c) => {
    const named = colors[hex(c)]
    if (named) return named === 'body' ? null : rgb(named)
    const [h, sat] = hueSat(c)
    if (!anchors.length || sat < 0.3 || h < 15 || h > 70) return c.slice(0, 3)
    const l = luma(c)
    if (l <= anchors[0][0]) return anchors[0][1]
    for (let i = 1; i < anchors.length; i++) {
      const [l1, c1] = anchors[i]
      if (l <= l1) {
        const [l0, c0] = anchors[i - 1]
        const u = (l - l0) / (l1 - l0)
        return c0.map((v, j) => v + (c1[j] - v) * u)
      }
    }
    return anchors[anchors.length - 1][1]
  }
}

function recolor(color, map, bodyMid) {
  const one = (c) => [...(map(c) ?? rgb(bodyMid)), c[3] ?? 1]
  if (!color.a) return { ...color, k: one(color.k) }
  return { ...color, k: color.k.map((k) => ({ ...k, ...(k.s && { s: one(k.s) }), ...(k.e && { e: one(k.e) }) })) }
}

// Gradient stops: [offset, r, g, b] × p, then the opacity stops untouched.
function recolorStops(g, map, bodyMid) {
  const flat = (k) => {
    const out = [...k]
    for (let at = 0; at < g.p * 4; at += 4) out.splice(at + 1, 3, ...(map(k.slice(at + 1, at + 4)) ?? rgb(bodyMid)))
    return out
  }
  if (!g.k.a) return { ...g, k: { ...g.k, k: flat(g.k.k) } }
  return { ...g, k: { ...g.k, k: g.k.k.map((kf) => ({ ...kf, ...(kf.s && { s: flat(kf.s) }), ...(kf.e && { e: flat(kf.e) }) })) } }
}

// One drawing unit: the root layers, or one precomp asset (each hand of a mirrored pair is the
// same asset, so it gets its own gradient in its own space, as each person in 🫂 does).
// `groups` (recipe "gradients": [["Layer A", "Layer B"], ["Layer C"]]) splits a unit into figures
// with a gradient each — two hands drawn in one composition.
function restyleUnit(layers, frame, colors, map, style, groups = []) {
  const bodies = [] // { list, index, matrix, box }
  const boxes = new Map() // figure → box
  const figure = (nm) => Math.max(0, groups.findIndex((g) => g.includes(nm)))
  let box = null
  const bodyMid = style.body.stops[Math.floor(style.body.stops.length / 2)][1]

  const walk = (list, matrix) => {
    const tr = list.find((it) => it.ty === 'tr')
    const m = mul(matrix, transform(tr, frame))
    list.forEach((it, index) => {
      if (it.ty === 'gr') walk(it.it, m)
      if ((it.ty === 'gf' || it.ty === 'gs') && it.g) list[index] = { ...it, g: recolorStops(it.g, map, bodyMid) }
      if ((it.ty === 'fl' || it.ty === 'st') && it.c) {
        if (it.ty === 'fl' && !it.c.a && colors[hex(it.c.k)] === 'body') {
          bodies.push({ list, index, matrix: m, box })
          for (const sh of list.filter((s) => s.ty === 'sh')) {
            const path = valueAt(sh.ks, frame) // keyframed paths hold [shape]
            for (const v of (Array.isArray(path) ? path[0] : path).v) {
              const [x, y] = apply(m, v)
              box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x)
              box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y)
            }
          }
        } else {
          list[index] = { ...it, c: recolor(it.c, map, bodyMid) }
        }
      }
    })
  }
  for (const layer of layers) {
    if (!layer.shapes) continue
    const f = figure(layer.nm)
    if (!boxes.has(f)) boxes.set(f, { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity })
    box = boxes.get(f)
    walk(layer.shapes, layerMatrix(layers, layer, frame))
  }

  const stops = style.body.stops
  const k = [...stops.flatMap(([at, c]) => [at, ...rgb(c)])]
  for (const { list, index, matrix, box } of bodies) {
    const fill = list[index]
    const inv = invert(matrix)
    const cx = (box.x0 + box.x1) / 2
    list[index] = {
      ty: 'gf', nm: fill.nm, hd: fill.hd, bm: fill.bm ?? 0, r: fill.r ?? 1, o: fill.o, t: 1,
      s: { a: 0, k: apply(inv, [cx, box.y1]) },
      e: { a: 0, k: apply(inv, [cx, box.y0]) },
      g: { p: stops.length, k: { a: 0, k } },
    }
  }
  return { box: boxes.get(0) ?? [...boxes.values()][0], bodies: bodies.length }
}

const STATIC_TR = () => ({ ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } })
const stroke = (color, w) => ({ ty: 'st', c: { a: 0, k: [...rgb(color), 1] }, o: { a: 0, k: 100 }, w: { a: 0, k: w }, lc: 2, lj: 2, bm: 0 })
const nextInd = (layers) => Math.max(0, ...layers.map((l) => l.ind ?? 0)) + 1
const shapeLayer = (nm, ind, parent, ip, op, shapes) => ({
  ty: 4, nm, ind, parent, ip, op, st: 0, sr: 1, ao: 0, bm: 0,
  ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [0, 0, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } },
  shapes,
})

// A limb drawn in the pack's manner: a round-capped line in the body colour over the outline
// colour 16 px wider, in the space of the layer `parent` names (so it moves with it), under
// everything else of its unit.
//   { "asset": "comp_0", "parent": "Null Arm", "from": [x, y], "to": [x, y], "width": 40, "color": "#46698c",
//     "outline": true, "root": false }
// "root": the limb goes to the root once per precomp layer that draws the asset, with the
// parent's chain copied as nulls: a precomp clips to its own size, the root does not.
function addLimb(anim, limb, style) {
  const asset = limb.asset ? anim.assets.find((a) => a.id === limb.asset) : null
  const own = asset ? asset.layers : anim.layers
  const parent = own.find((l) => l.nm === limb.parent)
  if (!parent) throw new Error(`limb: no layer "${limb.parent}"`)
  const path = { a: 0, k: { c: false, v: [limb.from, limb.to], i: [[0, 0], [0, 0]], o: [[0, 0], [0, 0]] } }
  const line = (nm, color, w) => ({ ty: 'gr', nm, it: [{ ty: 'sh', ks: path }, stroke(color, w), STATIC_TR()] })
  const shapes = [line('Body', limb.color, limb.width)]
  if (limb.outline !== false) shapes.push(line('Outline', style.outline, limb.width + 16))
  const nm = limb.nm ?? 'Limb'

  if (!limb.root || !asset) {
    own.push(shapeLayer(nm, nextInd(own), parent.ind, parent.ip, parent.op, shapes))
    return
  }
  const chain = [] // parent, its parent, … inside the asset
  for (let l = parent; l; l = l.parent == null ? null : own.find((x) => x.ind === l.parent)) chain.push(l)
  for (const pc of anim.layers.filter((l) => l.ty === 0 && l.refId === asset.id)) {
    if (pc.st || pc.tm) throw new Error('limb: time-shifted precomps are not supported')
    const holder = { ...structuredClone(pc), ty: 3, nm: `${nm} · ${pc.nm}`, ind: nextInd(anim.layers) }
    delete holder.refId; delete holder.w; delete holder.h
    anim.layers.push(holder)
    let up = holder.ind
    for (const l of [...chain].reverse()) {
      const copy = { ty: 3, nm: `${nm} · ${l.nm}`, ind: nextInd(anim.layers), parent: up, ip: pc.ip, op: pc.op, st: 0, sr: 1, ao: 0,
        ks: { ...structuredClone(l.ks), o: { a: 0, k: 0 } } }
      anim.layers.push(copy)
      up = copy.ind
    }
    anim.layers.push(shapeLayer(nm, nextInd(anim.layers), up, pc.ip, pc.op, structuredClone(shapes)))
  }
}

// The outline a layer's drawing never needed (hidden under clothes): a copy of its paths, stroked
// 16 px wide in the outline colour under everything of its unit, so only the outer half shows.
//   { "asset": "comp_0", "layer": "Palm Fill" }
function addUnderline(anim, spec, style) {
  const layers = spec.asset ? anim.assets.find((a) => a.id === spec.asset).layers : anim.layers
  const src = layers.find((l) => l.nm === spec.layer)
  if (!src) throw new Error(`underline: no layer "${spec.layer}"`)
  const strip = (list) => list
    .filter((it) => !['fl', 'gf', 'st', 'gs'].includes(it.ty))
    .map((it) => (it.ty === 'gr' ? { ...it, it: strip(it.it) } : it))
  const outline = (list) => {
    const out = strip(list).map((it) => (it.ty === 'gr' ? { ...it, it: outline(it.it) } : it))
    const at = out.findIndex((it) => it.ty === 'tr')
    if (out.some((it) => it.ty === 'sh')) out.splice(at < 0 ? out.length : at, 0, stroke(style.outline, 16))
    return out
  }
  layers.push({ ...structuredClone(src), nm: `${src.nm} outline`, ind: nextInd(layers), shapes: outline(structuredClone(src.shapes)) })
}

function restyle(anim, recipe, style) {
  const out = structuredClone(anim)
  const lower = (o) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k.toLowerCase(), v]))
  const colors = { ...lower(style.colors), ...lower(recipe.colors) }
  const map = makeMapper(colors, recipe.ramp ?? style.ramp)
  const frame = recipe.frame ?? Math.floor((out.ip + out.op) / 2)
  // "remove": layer names to drop everywhere (clothes that the pack's style has no place for); a
  // removed layer that others hang on (a nose carrying the eyes and mouth) stays as an empty null
  const drop = (layers) =>
    layers.flatMap((l) => {
      if (!(recipe.remove ?? []).includes(l.nm)) return [l]
      if (!layers.some((c) => c.parent === l.ind)) return []
      const { shapes, ...rest } = l
      return [{ ...rest, ty: 3 }]
    })
  out.layers = drop(out.layers)
  for (const asset of out.assets ?? []) if (asset.layers) asset.layers = drop(asset.layers)
  // "trims": shorten a stroke that ran under removed clothes —
  //   { "asset": "comp_0", "layer": "Palm Stroke", "group": "Group 2", "start": 0, "end": 85 } (% of the path)
  for (const t of recipe.trims ?? []) {
    const layers = t.asset ? out.assets.find((a) => a.id === t.asset).layers : out.layers
    const group = layers.find((l) => l.nm === t.layer)?.shapes.find((g) => g.nm === t.group)
    if (!group) throw new Error(`trim: no group "${t.layer} › ${t.group}"`)
    const at = group.it.findIndex((it) => it.ty === 'tr')
    group.it.splice(at, 0, { ty: 'tm', s: { a: 0, k: t.start ?? 0 }, e: { a: 0, k: t.end ?? 100 }, o: { a: 0, k: 0 }, m: 1 })
  }
  // "fade": { "<layer name>": percent } — the highlight fills of that layer (source colour
  // style.highlight) at that opacity, 0 = gone; the rest of the layer is untouched
  const highlight = (style.highlight ?? '#ffd75d').toLowerCase()
  const fadeFills = (list, pct) => list.forEach((it, i) => {
    if (it.ty === 'gr') fadeFills(it.it, pct)
    else if (it.ty === 'fl' && !it.c.a && hex(it.c.k) === highlight) {
      const o = it.o ?? { a: 0, k: 100 }
      list[i] = { ...it, o: o.a ? { ...o, k: o.k.map((k) => ({ ...k, ...(k.s && { s: k.s.map((v) => (v * pct) / 100) }) })) } : { ...o, k: (o.k * pct) / 100 } }
    }
  })
  for (const layers of [out.layers, ...(out.assets ?? []).filter((a) => a.layers).map((a) => a.layers)]) {
    for (const layer of layers) {
      const pct = recipe.fade?.[layer.nm]
      if (pct != null && layer.shapes) fadeFills(layer.shapes, pct)
    }
  }
  // "repaint": { "<layer name>": { "#from": "#to", "gradient": "#to" } } — source colours swapped in
  // that layer only, before the mapping (a colour that is skin in one layer and shadow in another);
  // "gradient" turns the layer's gradient fills into plain fills of that colour
  const repaint = (list, swap) => list.forEach((it, index) => {
    if (it.ty === 'gr') repaint(it.it, swap)
    else if ((it.ty === 'fl' || it.ty === 'st') && !it.c.a && swap[hex(it.c.k)]) it.c = { a: 0, k: [...rgb(swap[hex(it.c.k)]), 1] }
    else if (it.ty === 'gf' && swap.gradient) {
      list[index] = { ty: 'fl', nm: it.nm, hd: it.hd, bm: it.bm ?? 0, r: it.r ?? 1, o: it.o, c: { a: 0, k: [...rgb(swap.gradient), 1] } }
    }
  })
  for (const layers of [out.layers, ...(out.assets ?? []).filter((a) => a.layers).map((a) => a.layers)]) {
    for (const layer of layers) {
      const swap = recipe.repaint?.[layer.nm]
      if (swap && layer.shapes) repaint(layer.shapes, lower(swap))
    }
  }
  // limbs first: an under-outline then goes below a limb drawn in the same unit
  for (const limb of recipe.limbs ?? []) addLimb(out, limb, style)
  for (const spec of recipe.underlines ?? []) addUnderline(out, spec, style)
  const units = [out.layers, ...(out.assets ?? []).filter((a) => a.layers).map((a) => a.layers)]
  const done = units.map((layers) => restyleUnit(layers, frame, colors, map, style, recipe.gradients)).filter((u) => u.bodies)
  const box = done[0]?.box ?? { x0: 0, y0: 0, x1: 0, y1: 0 }
  return { anim: recipe.handHighlights ? normalizeHandHighlights(out,style) : out, box, bodies: done.reduce((n, u) => n + u.bodies, 0), frame }
}

// ---------- main ----------

const targets = process.argv.slice(2)
if (!targets.length) {
  console.error('usage: node scripts/restyle.mjs <pack>/<name> [...]')
  process.exit(1)
}
const eng = await engine()
let failed = false
for (const target of targets) {
  const [pack, name] = target.replace(/^packs\//, '').split('/')
  const dir = join(ROOT, 'packs', pack, name)
  const style = JSON.parse(await readFile(join(ROOT, 'packs', pack, 'style.json'), 'utf8'))
  const recipe = JSON.parse(await readFile(join(dir, 'recipe.json'), 'utf8'))
  const source = await readTgs(new Uint8Array(await readFile(join(dir, 'source.tgs'))))
  const { anim, box, bodies, frame } = restyle(source, recipe, style)

  await mkdir(join(ROOT, 'exports', pack), { recursive: true })
  await mkdir(join(ROOT, 'exports', 'sheets'), { recursive: true })
  const bytes = await writeTgs(anim)
  const outPath = join('exports', pack, `${name}.tgs`)
  await writeFile(join(ROOT, outPath), bytes)

  const rows = [source, anim].map((a) => eng.create(JSON.stringify(a)))
  const frames = framesAt(rows[0].frameCount, 6)
  const s = new Canvas(CELL * 6, (CELL + 20) * 2)
  rows.forEach((inst, row) => frames.forEach((f, i) => {
    s.draw(inst.render(f, CELL, CELL).slice(), CELL, i * CELL, row * (CELL + 20) + 20)
    s.text(`f ${f}`, i * CELL + 4, row * (CELL + 20) + 4, [90, 90, 90])
  }))
  rows.forEach((inst) => inst.drop())
  const sheetPath = join('exports', 'sheets', `${pack}-${name}.png`)
  await writeFile(join(ROOT, sheetPath), encodePng(s.px, s.width, s.height))

  const checks = telegramChecks(anim, bytes.length)
  const ok = checks.every((c) => c.ok)
  failed ||= !ok
  console.log(`${pack}/${name}: ${outPath} ${sizeKb(bytes)} KB, ${bodies} body fills, body box ` +
    `${box.x0.toFixed(0)}–${box.x1.toFixed(0)} × ${box.y0.toFixed(0)}–${box.y1.toFixed(0)} at frame ${frame}, ` +
    `проверки Telegram ${ok ? '✓' : '✕ ' + checks.filter((c) => !c.ok).map((c) => c.label).join(', ')}; ${sheetPath}`)
}
process.exit(failed ? 1 : 0)
