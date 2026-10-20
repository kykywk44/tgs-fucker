// Easing curves for motion presets, as Lottie cubic-bezier handles, and an evaluator
// of Lottie keyframed values (used by the compiler for baked channels and by tests).

export interface Ease { x1: number; y1: number; x2: number; y2: number }

// Named curves. `out` = fast start, soft stop; `in` = soft start, fast stop; `back*` overshoot.
export const EASES = {
  linear: { x1: 0, y1: 0, x2: 1, y2: 1 },
  inOut: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
  out: { x1: 0.2, y1: 0.8, x2: 0.4, y2: 1 },
  in: { x1: 0.6, y1: 0, x2: 0.8, y2: 0.2 },
  softOut: { x1: 0.33, y1: 0.6, x2: 0.5, y2: 1 },
  backOut: { x1: 0.3, y1: 1.5, x2: 0.6, y2: 1 },
  backIn: { x1: 0.4, y1: 0, x2: 0.7, y2: -0.5 },
  // exact parabola halves (for thrown objects) and a soft settle after a fast hit
  quadOut: { x1: 1 / 3, y1: 2 / 3, x2: 2 / 3, y2: 1 },
  quadIn: { x1: 1 / 3, y1: 0, x2: 2 / 3, y2: 1 / 3 },
  release: { x1: 0.25, y1: 0, x2: 0.3, y2: 1 },
} satisfies Record<string, Ease>

export type EaseName = keyof typeof EASES

// y on the curve at progress x ∈ [0, 1] (x is monotonic for x1, x2 ∈ [0, 1]; bisection).
export function easeAt(e: Ease, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bez = (u: number, p1: number, p2: number) => 3 * u * (1 - u) ** 2 * p1 + 3 * u ** 2 * (1 - u) * p2 + u ** 3
  let lo = 0, hi = 1, u = x
  for (let k = 0; k < 40; k++) {
    u = (lo + hi) / 2
    if (bez(u, e.x1, e.x2) < x) lo = u
    else hi = u
  }
  return bez(u, e.y1, e.y2)
}

// A Lottie keyframe as this module writes and reads it: `o`/`i` scalar (position) or per-dimension arrays.
interface LottieKey {
  t: number
  s: number[]
  o?: { x: number | number[]; y: number | number[] }
  i?: { x: number | number[]; y: number | number[] }
  h?: number
}

const pick = (v: number | number[], d: number) => (Array.isArray(v) ? v[Math.min(d, v.length - 1)] : v)

// Value of a Lottie property ({ a: 0, k } or { a: 1, k: keys }) at `frame`. Spatial tangents are ignored.
export function valueAt(prop: { a?: number; k: unknown }, frame: number): number[] {
  if (prop.a !== 1) return typeof prop.k === 'number' ? [prop.k] : (prop.k as number[])
  const keys = prop.k as LottieKey[]
  if (frame <= keys[0].t) return keys[0].s
  for (let n = 0; n < keys.length - 1; n++) {
    const a = keys[n], b = keys[n + 1]
    if (frame >= b.t) continue
    if (a.h === 1 || !a.o || !a.i) return a.s
    const x = (frame - a.t) / (b.t - a.t)
    return a.s.map((v, d) => {
      const e = { x1: pick(a.o!.x, d), y1: pick(a.o!.y, d), x2: pick(a.i!.x, d), y2: pick(a.i!.y, d) }
      return v + (b.s[d] - v) * easeAt(e, x)
    })
  }
  return keys[keys.length - 1].s
}
