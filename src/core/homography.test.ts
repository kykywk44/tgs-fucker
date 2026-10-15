import { describe, expect, it } from 'vitest'
import { applyHomography, fitHomography, type Mat3 } from './homography'

type Pt = [number, number]

// A perspective map with a little of everything: scale, rotation, shear,
// translation and a non-zero projective row (values of the order a box turn needs).
const KNOWN: Mat3 = [1.08, 0.12, -14.5, -0.07, 0.93, 22.25, 0.00041, -0.00023, 1]

function project(h: Mat3, [x, y]: Pt): Pt {
  const w = h[6] * x + h[7] * y + h[8]
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]
}

// 20 scattered points over the area of a sticker (deterministic, no RNG).
const SRC: Pt[] = Array.from({ length: 20 }, (_, n): Pt => [
  80 + ((n * 137) % 353) + 0.25 * n,
  190 + ((n * 61) % 127) + 0.5 * (n % 3),
])

function maxReprojection(h: Mat3, src: Pt[], dst: Pt[]): number {
  return Math.max(
    ...src.map((p, n) => {
      const [x, y] = applyHomography(h, p)
      return Math.hypot(x - dst[n][0], y - dst[n][1])
    }),
  )
}

describe('fitHomography', () => {
  it('recovers a known homography from 20 points', () => {
    const dst = SRC.map((p) => project(KNOWN, p))
    const h = fitHomography(SRC, dst)
    expect(h).toHaveLength(9)
    expect(maxReprojection(h, SRC, dst)).toBeLessThan(1e-6)
    // ... and it is the same map elsewhere too, not only on the samples
    for (const p of [[0, 0], [512, 512], [256, 100]] as Pt[]) {
      const [x, y] = applyHomography(h, p)
      const [ex, ey] = project(KNOWN, p)
      expect(Math.hypot(x - ex, y - ey)).toBeLessThan(1e-6)
    }
  })

  it('recovers the identity and a pure translation exactly enough', () => {
    expect(maxReprojection(fitHomography(SRC, SRC), SRC, SRC)).toBeLessThan(1e-9)
    const moved = SRC.map(([x, y]): Pt => [x, y - 3])
    expect(maxReprojection(fitHomography(SRC, moved), SRC, moved)).toBeLessThan(1e-9)
  })

  it('works with exactly 4 points', () => {
    const src: Pt[] = [[100, 200], [400, 210], [390, 310], [110, 300]]
    const dst = src.map((p) => project(KNOWN, p))
    expect(maxReprojection(fitHomography(src, dst), src, dst)).toBeLessThan(1e-6)
  })

  it('is a least-squares fit on noisy points', () => {
    const noise = (n: number): number => (((n * 7919) % 13) - 6) / 60 // within ±0.1
    const dst = SRC.map((p, n): Pt => {
      const [x, y] = project(KNOWN, p)
      return [x + noise(n), y + noise(n + 5)]
    })
    const h = fitHomography(SRC, dst)
    for (const p of SRC) {
      const [x, y] = applyHomography(h, p)
      const [ex, ey] = project(KNOWN, p)
      expect(Math.hypot(x - ex, y - ey)).toBeLessThan(0.15)
    }
  })

  it('never mutates its inputs', () => {
    const src = SRC.map((p): Pt => [p[0], p[1]])
    const dst = src.map((p) => project(KNOWN, p))
    const before = structuredClone([src, dst])
    fitHomography(src, dst)
    expect([src, dst]).toEqual(before)
  })

  it('throws on fewer than 4 points', () => {
    const src = SRC.slice(0, 3)
    expect(() => fitHomography(src, src)).toThrow()
    expect(() => fitHomography([], [])).toThrow()
  })

  it('throws on point lists of different lengths', () => {
    expect(() => fitHomography(SRC, SRC.slice(1))).toThrow()
  })

  it('throws on collinear points', () => {
    const line: Pt[] = Array.from({ length: 10 }, (_, n): Pt => [100 + 30 * n, 200 + 10 * n])
    expect(() => fitHomography(line, line.map((p) => project(KNOWN, p)))).toThrow(/degenerate/)
  })

  it('throws when the targets collapse onto a line', () => {
    expect(() => fitHomography(SRC, SRC.map(([x, y]): Pt => [x + y, 2 * (x + y)]))).toThrow(/degenerate/)
  })

  it('throws on coincident points', () => {
    const same: Pt[] = Array.from({ length: 6 }, (): Pt => [250, 250])
    expect(() => fitHomography(same, same)).toThrow(/coincide/)
  })

  it('throws on non-finite coordinates', () => {
    const bad = SRC.map((p, n): Pt => (n === 3 ? [Number.NaN, p[1]] : p))
    expect(() => fitHomography(bad, SRC)).toThrow()
  })
})

describe('applyHomography', () => {
  it('maps a point', () => {
    expect(applyHomography([1, 0, 5, 0, 1, -3, 0, 0, 1], [10, 20])).toEqual([15, 17])
    expect(applyHomography([2, 0, 0, 0, 2, 0, 0, 0, 2], [10, 20])).toEqual([10, 20])
  })

  it('throws when w <= 0', () => {
    expect(() => applyHomography([1, 0, 0, 0, 1, 0, 0, 0, 0], [10, 20])).toThrow(RangeError)
    expect(() => applyHomography([1, 0, 0, 0, 1, 0, 0.01, 0, 0], [-10, 20])).toThrow(RangeError)
    expect(() => applyHomography([1, 0, 0, 0, 1, 0, 0, 0, -1], [10, 20])).toThrow(RangeError)
  })
})
