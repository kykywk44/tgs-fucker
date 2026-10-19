import { locateAtoms } from './atoms'
import type { Lottie } from './tgs'

// The ID map: a copy of the animation where atom k paints with its own opaque
// colour idColor(k). Rendered with antialiasing off, the pixel under the cursor
// names the atom. Measured on the samples (scripts/measure-corpus.mjs): no
// pixel of any frame carries a colour that is not an atom's ID.
//
// What would blend ID colours is neutralised:
// - opacity (layers, group transforms, paints) is only ever 0 or 100; animated
//   opacity becomes hold keyframes, a segment being 100 when either end is > 0;
// - gradients become solid paints of their kind (visibility and opacity kept);
// - blend modes are reset to normal;
// - the paints of a luma matte's source layer turn white, so the matte keeps
//   letting the matted layer through (alpha mattes need nothing).
//
// Translucent atoms (glass highlights, glows, soft shadows: every paint below
// full opacity or a gradient with transparent stops) would cover the solid
// body under them, so a map can hold only the solid atoms or only the
// translucent ones; the others are hidden in it.

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const LUMA_MATTES = new Set([3, 4])
const OPAQUE = 0.95 // an alpha (0–1) at or above this counts as full

// The largest value an opacity property (0–100) ever takes; 100 when absent.
function maxOpacity(prop: unknown): number {
  if (!isObject(prop)) return 100
  if (typeof prop.k === 'number') return prop.k
  if (!Array.isArray(prop.k)) return 100
  const values = prop.k.flatMap((value) =>
    typeof value === 'number' ? [value] : isObject(value) ? [first(value.s), first(value.e)].filter((v): v is number => typeof v === 'number') : [])
  return values.length ? Math.max(...values) : 100
}

// The smallest opacity stop of a gradient (0–1); 1 without opacity stops.
function minGradientAlpha(paint: Json): number {
  const gradient = paint.g
  if (!isObject(gradient) || typeof gradient.p !== 'number' || !isObject(gradient.k)) return 1
  const stops = gradient.p
  const values = Array.isArray(gradient.k.k) ? gradient.k.k : []
  const lists: unknown[] = values.every((v) => typeof v === 'number')
    ? [values]
    : values.flatMap((kf) => (isObject(kf) ? [kf.s, kf.e] : []))
  let min = 1
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (let i = stops * 4 + 1; i < list.length; i += 2) if (typeof list[i] === 'number') min = Math.min(min, list[i])
  }
  return min
}

function isTranslucentPaint(paint: Json): boolean {
  return maxOpacity(paint.o) < OPAQUE * 100 || ((paint.ty === 'gf' || paint.ty === 'gs') && minGradientAlpha(paint) < OPAQUE)
}

// Ids of the atoms whose every paint is translucent (see above).
export function translucentAtoms(anim: Lottie): Set<number> {
  const ids = new Set<number>()
  locateAtoms(anim).forEach((atom, id) => {
    if (atom.paints.every(isTranslucentPaint)) ids.add(id)
  })
  return ids
}

export interface IdMapOptions {
  only?: 'solid' | 'translucent' // default: every atom
}

// Atom k → [r, g, b] bytes of k + 1 (0 is left for the transparent background).
export function idColor(id: number): [number, number, number] {
  const n = id + 1
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// The atom whose ID colour a straight-alpha pixel carries, or null for the
// background, a partly covered pixel or a colour of no atom.
export function decodeId(r: number, g: number, b: number, a: number, atomCount: number): number | null {
  if (a !== 255) return null
  const id = ((r << 16) | (g << 8) | b) - 1
  return id >= 0 && id < atomCount ? id : null
}

// The atom under the point (x, y) of a size×size straight-alpha RGBA ID render;
// x and y are fractions of the canvas, 0 ≤ x, y < 1 (outside → null).
export function pickAt(
  rgba: ArrayLike<number>,
  size: number,
  x: number,
  y: number,
  atomCount: number,
): number | null {
  if (!(x >= 0 && x < 1 && y >= 0 && y < 1)) return null
  const i = (Math.floor(y * size) * size + Math.floor(x * size)) * 4
  return decodeId(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3], atomCount)
}

const first = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value)
const onOff = (value: unknown): number => (typeof value === 'number' && value > 0 ? 100 : 0)

// An opacity property, in place: 0 or 100 only, animated → hold keyframes.
function binarizeOpacity(prop: unknown): void {
  if (!isObject(prop)) return
  if (typeof prop.k === 'number') {
    prop.k = onOff(prop.k)
    return
  }
  if (!Array.isArray(prop.k)) return
  if (prop.k.every((value) => typeof value === 'number')) {
    prop.k = prop.k.map(onOff)
    return
  }
  const keyframes = prop.k.filter(isObject)
  // Before the first keyframe the property holds that keyframe's own value; once
  // its segment value is widened below, a hold keyframe just before it keeps that.
  const lead = keyframes[0]
  const before = lead && lead.s !== undefined && typeof lead.t === 'number' ? onOff(first(lead.s)) : null
  keyframes.forEach((keyframe, i) => {
    if (keyframe.s === undefined) return
    const next = keyframe.e ?? keyframes[i + 1]?.s
    const value = Math.max(onOff(first(keyframe.s)), next === undefined ? 0 : onOff(first(next)))
    keyframe.s = [value]
    // Old files: a last keyframe without `s` takes the previous segment's `e`.
    if (keyframe.e !== undefined) keyframe.e = [value]
    keyframe.h = 1
  })
  if (before !== null && first(lead.s) !== before) {
    prop.k = [{ t: (lead.t as number) - 0.01, s: [before], h: 1 }, ...prop.k]
  }
}

// A copy of `anim` painted by atom (see above). Atom ids are those of findAtoms.
export function idColorize(anim: Lottie, options: IdMapOptions = {}): Lottie {
  const translucent = options.only ? translucentAtoms(anim) : null
  const copy = structuredClone(anim)
  const lumaSources = new Set<object>()
  const comps = [copy.layers, ...(copy.assets ?? []).map((asset) => (isObject(asset) ? asset.layers : null))]
  comps.forEach((layers) => {
    if (!Array.isArray(layers)) return
    layers.forEach((layer, i) => {
      const next = layers[i + 1]
      if (isObject(layer) && layer.td && isObject(next) && LUMA_MATTES.has(next.tt as number)) lumaSources.add(layer)
    })
  })

  locateAtoms(copy).forEach((atom, id) => {
    const rgb = lumaSources.has(atom.layer) ? [255, 255, 255] : idColor(id)
    const c = { a: 0, k: [...rgb.map((v) => v / 255), 1] }
    const hidden = translucent !== null && translucent.has(id) !== (options.only === 'translucent')
    for (const paint of atom.paints) {
      binarizeOpacity(paint.o)
      const kept = { nm: paint.nm, hd: hidden || paint.hd, c, o: paint.o ?? { a: 0, k: 100 } }
      if (hidden) paint.hd = true
      const i = atom.items.indexOf(paint)
      if (paint.ty === 'gf') atom.items[i] = { ty: 'fl', ...kept, r: paint.r ?? 1 }
      else if (paint.ty === 'gs') atom.items[i] = { ty: 'st', ...kept, w: paint.w, lc: paint.lc, lj: paint.lj, ml: paint.ml }
      else paint.c = c
    }
  })

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (!isObject(node)) return
    if (node.ty === 'tr') binarizeOpacity(node.o)
    if (isObject(node.ks) && 'ty' in node) binarizeOpacity(node.ks.o) // a layer's transform
    if (typeof node.bm === 'number' && node.bm !== 0) node.bm = 0
    for (const value of Object.values(node)) if (typeof value === 'object' && value !== null) visit(value)
  }
  visit(copy)
  return copy
}
