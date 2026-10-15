import type { Lottie } from './tgs'

export interface ColorEntry { hex: string; count: number }

// Neither lottie-colorify nor @lottiefiles/lottie-js handles every case the
// editor needs (gradients, keyframe `e`, alpha, lossless output), so this is a
// small tree walker that edits colors in place on a deep copy and touches
// nothing else. See task-4-report for the per-library failures.
//
// Colors are found where Telegram stickers allow them: the `c` property of
// fill (`fl`) and stroke (`st`) shapes, and the `g` stop list of gradient fills
// (`gf`) and strokes (`gs`), anywhere in `layers`, `assets[].layers`, `gr.it`.
// Solid-layer colors, effects and text are forbidden in .tgs and not handled.

// One color occurrence. `index` is its walk-order ordinal (0-based), stable
// while the structure of the animation is unchanged. `gradient` is the
// walk-order ordinal of the gf/gs it belongs to, or null for fl/st.
export interface ColorSite {
  index: number
  hex: string
  gradient: number | null
}

// Called with the array holding a color, the index of its red component (green
// and blue follow at index + 1 and index + 2) and the gradient ordinal (or null).
type Visit = (values: number[], at: number, gradient: number | null) => void

type Json = Record<string, unknown>

const HEX_RE = /^#[0-9a-f]{6}$/i

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number')
}

function normalizeHex(hex: string): string {
  if (!HEX_RE.test(hex)) throw new Error(`Invalid hex color: ${JSON.stringify(hex)}`)
  return hex.toLowerCase()
}

function channelToHex(channel: number): string {
  const byte = Math.min(255, Math.max(0, Math.round(channel * 255)))
  return byte.toString(16).padStart(2, '0')
}

function hexAt(values: number[], at: number): string {
  return '#' + channelToHex(values[at]) + channelToHex(values[at + 1]) + channelToHex(values[at + 2])
}

function hexToChannels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]
}

// A Lottie property is `{ a, k }`. `k` is either the static value or, when
// animated, a list of keyframes whose `s` (and, in older files, `e`) hold the
// value at the start (and end) of the segment. The last keyframe may have no `s`.
function eachValue(prop: unknown, visit: (values: number[]) => void): void {
  if (!isObject(prop) || !Array.isArray(prop.k)) return
  if (isNumberArray(prop.k)) {
    visit(prop.k)
    return
  }
  for (const keyframe of prop.k) {
    if (!isObject(keyframe)) continue
    if (isNumberArray(keyframe.s)) visit(keyframe.s)
    if (isNumberArray(keyframe.e)) visit(keyframe.e)
  }
}

// Fill / stroke color: [r, g, b] or [r, g, b, a].
function visitColor(prop: unknown, visit: Visit): void {
  eachValue(prop, (values) => {
    if (values.length >= 3) visit(values, 0, null)
  })
}

// Gradient: the first `p` stops of `k` are [offset, r, g, b]. Whatever follows
// them is opacity stops [offset, alpha] and is not a color.
function visitGradient(gradient: Json, ordinal: number, visit: Visit): void {
  const stops = gradient.p as number
  eachValue(gradient.k, (values) => {
    for (let i = 0; i < stops && i * 4 + 3 < values.length; i++) visit(values, i * 4 + 1, ordinal)
  })
}

// Called around the descent into each array or object the walk enters (the
// root included): `enter` before the node's own colors and children are
// visited, `leave` after its last child.
interface Scope {
  enter: (node: object) => void
  leave: (node: object) => void
}

// Pre-order walk, object keys in insertion order. Gradients are numbered in
// the order their gf/gs nodes are reached; a gf/gs without a numeric `p` is
// not a gradient and takes no number. A color is visited while the walk is at
// its fl/st/gf/gs node, so that node (not its `c` / `g` property) is the
// innermost node `scope` sees around it.
function walk(root: unknown, visit: Visit, scope?: Scope): void {
  let gradients = 0
  const visitNode = (node: unknown): void => {
    if (Array.isArray(node)) {
      scope?.enter(node)
      for (const item of node) visitNode(item)
      scope?.leave(node)
      return
    }
    if (!isObject(node)) return
    scope?.enter(node)
    if (node.ty === 'fl' || node.ty === 'st') {
      visitColor(node.c, visit)
    } else if ((node.ty === 'gf' || node.ty === 'gs') && isObject(node.g) && typeof node.g.p === 'number') {
      visitGradient(node.g, gradients++, visit)
    }
    for (const value of Object.values(node)) {
      if (typeof value === 'object' && value !== null) visitNode(value)
    }
    scope?.leave(node)
  }
  visitNode(root)
}

// Every color occurrence in walk order. Alpha is ignored; no field is changed.
export function readColorSites(anim: Lottie): ColorSite[] {
  const sites: ColorSite[] = []
  walk(anim, (values, at, gradient) => {
    sites.push({ index: sites.length, hex: hexAt(values, at), gradient })
  })
  return sites
}

// Indices (ascending, the readColorSites walk order, each at most once) of the
// color sites lying inside one of `nodes`. Nodes are matched by object
// identity against the objects and arrays of `anim` itself: a layer, a shape
// group, a fill, an asset, `anim.layers`, `anim` ... Nothing is cloned or
// changed. A site belongs to its fl/st/gf/gs node, so a finer node (a `c` or
// `g` property, a keyframe) matches nothing. Layers referencing an asset by
// `refId` hold no sites of their own; the asset's sites are listed once, when
// the asset (or something containing it) is in `nodes`.
export function sitesWithin(anim: Lottie, nodes: ReadonlySet<object>): number[] {
  const indices: number[] = []
  if (nodes.size === 0) return indices
  // Nesting depth inside listed nodes: a node and its descendant both listed
  // still make one stretch of "inside", so a site is recorded only once.
  let inside = 0
  let index = 0
  walk(
    anim,
    () => {
      if (inside > 0) indices.push(index)
      index++
    },
    {
      enter: (node) => { if (nodes.has(node)) inside++ },
      leave: (node) => { if (nodes.has(node)) inside-- },
    },
  )
  return indices
}

// Returns a deep copy of `anim` where each site is recoloured to `fn(site)`.
// A null result, or the site's current hex, leaves its floats untouched. Other
// sites are written as r, g, b only (alpha and component count are kept).
// Walks in the same order as readColorSites. Throws on a malformed hex.
export function mapColorSites(anim: Lottie, fn: (site: ColorSite) => string | null): Lottie {
  const result = structuredClone(anim)
  let index = 0
  walk(result, (values, at, gradient) => {
    const site: ColorSite = { index: index++, hex: hexAt(values, at), gradient }
    const next = fn(site)
    if (next === null) return
    const hex = normalizeHex(next)
    if (hex === site.hex) return
    const [r, g, b] = hexToChannels(hex)
    values[at] = r
    values[at + 1] = g
    values[at + 2] = b
  })
  return result
}

// Unique colors with how many times each occurs (every static color, every
// keyframe value and every gradient stop counts once), most used first.
// Equal counts are ordered by hex. Alpha is ignored.
export function listColors(anim: Lottie): ColorEntry[] {
  const counts = new Map<string, number>()
  walk(anim, (values, at) => {
    const hex = hexAt(values, at)
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
  })
  return [...counts]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count || (a.hex < b.hex ? -1 : 1))
}

// Returns a deep copy of `anim` where every occurrence of `fromHex` has
// `toHex` as its r, g, b. Alpha, offsets, opacity stops and every other field
// are left as they were. Throws on a malformed hex color.
export function replaceColor(anim: Lottie, fromHex: string, toHex: string): Lottie {
  const from = normalizeHex(fromHex)
  const to = normalizeHex(toHex)
  const result = structuredClone(anim)
  if (from === to) return result
  const [r, g, b] = hexToChannels(to)
  walk(result, (values, at) => {
    if (hexAt(values, at) !== from) return
    values[at] = r
    values[at + 1] = g
    values[at + 2] = b
  })
  return result
}
