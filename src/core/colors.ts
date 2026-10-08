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

// Called with the array holding a color and the index of its red component;
// green and blue follow at index + 1 and index + 2.
type ColorSite = (values: number[], at: number) => void

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
function visitColor(prop: unknown, site: ColorSite): void {
  eachValue(prop, (values) => {
    if (values.length >= 3) site(values, 0)
  })
}

// Gradient: the first `p` stops of `k` are [offset, r, g, b]. Whatever follows
// them is opacity stops [offset, alpha] and is not a color.
function visitGradient(gradient: unknown, site: ColorSite): void {
  if (!isObject(gradient) || typeof gradient.p !== 'number') return
  const stops = gradient.p
  eachValue(gradient.k, (values) => {
    for (let i = 0; i < stops && i * 4 + 3 < values.length; i++) site(values, i * 4 + 1)
  })
}

function walk(node: unknown, site: ColorSite): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, site)
    return
  }
  if (!isObject(node)) return
  if (node.ty === 'fl' || node.ty === 'st') visitColor(node.c, site)
  else if (node.ty === 'gf' || node.ty === 'gs') visitGradient(node.g, site)
  for (const value of Object.values(node)) {
    if (typeof value === 'object' && value !== null) walk(value, site)
  }
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
