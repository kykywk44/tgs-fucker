import { describe, expect, it } from 'vitest'
import data from './glyphs/roboto-900.json'
import { layoutLine, type Box, type GlyphContour, type GlyphSet, type PlacedGlyph } from './glyphs'

// The JSON types its points as number[][]; the data tests below check the tuple/closed-contour shape.
const set = data as unknown as GlyphSet

const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const CYRILLIC = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ'
const DIGITS = '0123456789'
const PUNCT = '!?.,:;-+&\'"*#%@()'
const LISTED = [...LATIN, ...CYRILLIC, ...DIGITS, ...PUNCT, ' ']

type Pt = [number, number]

/** Signed polygon area of a contour with its Bezier segments sampled finely (y down, so + is clockwise on screen). */
function signedArea(c: GlyphContour): number {
  const pts: Pt[] = []
  const n = c.v.length
  for (let k = 0; k < n; k++) {
    const a = c.v[k]
    const b = c.v[(k + 1) % n]
    const p1: Pt = [a[0] + c.o[k][0], a[1] + c.o[k][1]]
    const p2: Pt = [b[0] + c.i[(k + 1) % n][0], b[1] + c.i[(k + 1) % n][1]]
    for (let s = 0; s < 16; s++) {
      const t = s / 16
      const u = 1 - t
      pts.push([
        u * u * u * a[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * b[0],
        u * u * u * a[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * b[1],
      ])
    }
  }
  let sum = 0
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k]
    const q = pts[(k + 1) % pts.length]
    sum += p[0] * q[1] - q[0] * p[1]
  }
  return sum / 2
}

/** Union of the placed ink boxes (spaces have none). */
function ink(placed: PlacedGlyph[]): Box {
  const boxes = placed.flatMap((p) => (p.bounds ? [p.bounds] : []))
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

const WIDE: Box = { x0: 0, y0: 0, x1: 100000, y1: 100 } // always height-limited

describe('glyph data', () => {
  it('has every listed character, and all but space have at least one contour', () => {
    expect(Object.keys(set.glyphs)).toHaveLength(LISTED.length)
    for (const ch of LISTED) {
      expect(set.glyphs, `missing ${ch}`).toHaveProperty([ch])
      const g = set.glyphs[ch]
      expect(g.advance, `advance of ${ch}`).toBeGreaterThan(0)
      if (ch === ' ') expect(g.contours).toHaveLength(0)
      else expect(g.contours.length, `contours of ${ch}`).toBeGreaterThanOrEqual(1)
    }
  })

  it('stores closed integer contours with matching v/i/o lengths', () => {
    for (const ch of LISTED) {
      for (const c of set.glyphs[ch].contours) {
        expect(c.v.length, `vertices of ${ch}`).toBeGreaterThanOrEqual(3)
        expect(c.i).toHaveLength(c.v.length)
        expect(c.o).toHaveLength(c.v.length)
        for (const p of [...c.v, ...c.i, ...c.o]) {
          expect(Number.isInteger(p[0]) && Number.isInteger(p[1]), `${ch} ${p}`).toBe(true)
        }
      }
    }
  })

  it('uses y down: capital letters sit between -capHeight and 0', () => {
    expect(set.unitsPerEm).toBe(2048)
    expect(set.capHeight).toBe(1456)
    for (const ch of ['L', 'H', 'E']) {
      const ys = set.glyphs[ch].contours.flatMap((c) => c.v.map((p) => p[1]))
      expect(Math.min(...ys)).toBe(-set.capHeight)
      expect(Math.max(...ys)).toBe(0)
    }
  })

  it('draws O as two contours with opposite signed area', () => {
    const { contours } = set.glyphs.O
    expect(contours).toHaveLength(2)
    const [a, b] = contours.map(signedArea)
    expect(Math.sign(a)).not.toBe(0)
    expect(Math.sign(a)).toBe(-Math.sign(b))
    expect(Math.abs(a)).not.toBeCloseTo(Math.abs(b), -3) // the counter is smaller than the outline
  })

  it('keeps only non-zero integer kerning for two characters of the set', () => {
    const pairs = Object.entries(set.kerning)
    expect(pairs.length).toBeGreaterThan(0)
    for (const [pair, k] of pairs) {
      const chars = [...pair]
      expect(chars).toHaveLength(2)
      expect(chars.every((ch) => ch in set.glyphs), pair).toBe(true)
      expect(Number.isInteger(k) && k !== 0, pair).toBe(true)
    }
    expect(set.kerning.AV).toBeLessThan(0)
  })
})

describe('layoutLine', () => {
  it('returns one placed glyph per character, in order, with null bounds for space', () => {
    const placed = layoutLine(set, 'A B', { x0: 0, y0: 0, x1: 1000, y1: 100 })
    expect(placed.map((p) => p.char)).toEqual(['A', ' ', 'B'])
    expect(placed[1].bounds).toBeNull()
    expect(placed[1].contours).toEqual([])
    expect(placed[0].bounds).not.toBeNull()
    expect(layoutLine(set, '', WIDE)).toEqual([])
  })

  it('COOL in a wide box is height-limited: L spans the box height, the line is centred', () => {
    const box: Box = { x0: 0, y0: 0, x1: 1000, y1: 100 }
    const placed = layoutLine(set, 'COOL', box)
    const l = placed[3].bounds!
    expect(l.y0).toBeCloseTo(0, 6)
    expect(l.y1).toBeCloseTo(100, 6)
    const line = ink(placed)
    expect((line.x0 + line.x1) / 2).toBeCloseTo(500, 6)
    expect(line.x1 - line.x0).toBeLessThan(1000) // height-limited, so it does not fill the width
  })

  it('fits a long line to the width of a narrow box and centres the block vertically', () => {
    const box: Box = { x0: 20, y0: 10, x1: 120, y1: 110 } // 100 x 100
    const placed = layoutLine(set, 'HHHHHH', box)
    const line = ink(placed)
    expect(line.x0).toBeCloseTo(20, 6)
    expect(line.x1).toBeCloseTo(120, 6)
    const h = placed[0].bounds!
    expect(h.y1 - h.y0).toBeLessThan(100) // width-limited: cap height is below the box height
    expect((h.y0 + h.y1) / 2).toBeCloseTo(60, 6) // block centred on the box middle
  })

  it('places pen positions by advance width (kerning aside)', () => {
    const plain: GlyphSet = { ...set, kerning: {} }
    const [h1, h2] = layoutLine(plain, 'HH', WIDE)
    const s = 100 / set.capHeight
    expect(h2.bounds!.x0 - h1.bounds!.x0).toBeCloseTo(set.glyphs.H.advance * s, 6)
  })

  it('counts a space inside the line as ink gap, but not at its ends', () => {
    const plain: GlyphSet = { ...set, kerning: {} }
    const s = 100 / set.capHeight
    const tight = ink(layoutLine(plain, 'HH', WIDE))
    const spaced = ink(layoutLine(plain, 'H H', WIDE))
    expect(spaced.x1 - spaced.x0).toBeCloseTo(tight.x1 - tight.x0 + set.glyphs[' '].advance * s, 6)
    const padded = ink(layoutLine(plain, ' HH ', { x0: 0, y0: 0, x1: 100000, y1: 100 }))
    expect((padded.x0 + padded.x1) / 2).toBeCloseTo(50000, 6)
  })

  it('a kerned pair is narrower than the same pair without kerning', () => {
    const k = set.kerning.AV
    expect(k).toBeLessThan(0)
    const s = 100 / set.capHeight
    const kerned = ink(layoutLine(set, 'AV', WIDE))
    const plain = ink(layoutLine({ ...set, kerning: {} }, 'AV', WIDE))
    expect(kerned.x1 - kerned.x0).toBeLessThan(plain.x1 - plain.x0)
    expect(kerned.x1 - kerned.x0).toBeCloseTo(plain.x1 - plain.x0 + k * s, 6)
  })

  it('scales tangents but does not translate them', () => {
    const placed = layoutLine(set, 'O', { x0: 0, y0: 0, x1: 100000, y1: 1456 }) // s = 1
    const src = set.glyphs.O.contours[0]
    const out = placed[0].contours[0]
    expect(out.v).toHaveLength(src.v.length)
    expect(out.i).toEqual(src.i)
    expect(out.o).toEqual(src.o)
    const dx = out.v[0][0] - src.v[0][0]
    const dy = out.v[0][1] - src.v[0][1]
    out.v.forEach((p, n) => {
      expect(p[0]).toBeCloseTo(src.v[n][0] + dx, 6)
      expect(p[1]).toBeCloseTo(src.v[n][1] + dy, 6)
    })
  })

  it('bounds follow the curve, not the control points', () => {
    // One cubic bulging to y = -90 (control points at -120), closed by two straight sides.
    const bulge: GlyphSet = {
      unitsPerEm: 100,
      capHeight: 100,
      glyphs: {
        X: {
          advance: 100,
          contours: [{ v: [[0, 0], [100, 0], [50, 40]], i: [[0, 0], [0, -120], [0, 0]], o: [[0, -120], [0, 0], [0, 0]] }],
        },
      },
      kerning: {},
    }
    const [x] = layoutLine(bulge, 'X', { x0: 0, y0: 0, x1: 100, y1: 100 }) // s = 1, baseline = 100
    expect(x.bounds!.x0).toBeCloseTo(0, 9)
    expect(x.bounds!.x1).toBeCloseTo(100, 9)
    expect(x.bounds!.y0).toBeCloseTo(100 - 90, 9) // 3/4 of the way to the control points, not -120
    expect(x.bounds!.y1).toBeCloseTo(100 + 40, 9)
  })

  it('finds the extrema of an asymmetric cubic (checked by dense sampling)', () => {
    const skew: GlyphSet = {
      unitsPerEm: 100,
      capHeight: 100,
      glyphs: {
        X: {
          advance: 100,
          // p0 (0,0), p1 (300,-120), p2 (40,-60), p3 (100,0): overshoots both in x and y.
          contours: [{ v: [[0, 0], [100, 0], [50, 40]], i: [[0, 0], [-60, -60], [0, 0]], o: [[300, -120], [0, 0], [0, 0]] }],
        },
      },
      kerning: {},
    }
    const P = [[0, 0], [300, -120], [40, -60], [100, 0]]
    const xs: number[] = [50]
    const ys: number[] = [40]
    for (let k = 0; k <= 100000; k++) {
      const t = k / 100000
      const u = 1 - t
      const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
      xs.push(w.reduce((sum, wi, n) => sum + wi * P[n][0], 0))
      ys.push(w.reduce((sum, wi, n) => sum + wi * P[n][1], 0))
    }
    const [x] = layoutLine(skew, 'X', { x0: 0, y0: 0, x1: 1000, y1: 100 }) // s = 1
    expect(x.bounds!.x1 - x.bounds!.x0).toBeCloseTo(Math.max(...xs) - Math.min(...xs), 3)
    expect(x.bounds!.y1 - x.bounds!.y0).toBeCloseTo(Math.max(...ys) - Math.min(...ys), 3)
    expect(Math.max(...xs)).toBeGreaterThan(100) // the test really exercises an overshoot
  })

  it('throws on a character that is not in the set', () => {
    expect(() => layoutLine(set, 'COoL', WIDE)).toThrow(/"o"/)
    expect(() => layoutLine(set, 'А-€', WIDE)).toThrow(/€/)
  })

  it('rejects an empty or inverted box', () => {
    expect(() => layoutLine(set, 'A', { x0: 0, y0: 0, x1: 0, y1: 10 })).toThrow(RangeError)
    expect(() => layoutLine(set, 'A', { x0: 0, y0: 10, x1: 10, y1: 0 })).toThrow(RangeError)
  })

  it('does not mutate the set and does not alias its contours', () => {
    const pristine = structuredClone(set)
    const frozen = deepFreeze(structuredClone(set))
    const placed = layoutLine(frozen, 'COOL', { x0: 0, y0: 0, x1: 1000, y1: 100 }) // would throw on a write
    expect(frozen).toEqual(pristine)
    expect(set).toEqual(pristine)
    const src = frozen.glyphs.C.contours[0]
    const out = placed[0].contours[0]
    expect(out).not.toBe(src)
    expect(out.v).not.toBe(src.v)
    expect(out.v[0]).not.toBe(src.v[0])
    // mutating the result leaves the set alone
    out.v[0][0] = 12345
    expect(frozen.glyphs.C.contours[0].v[0][0]).not.toBe(12345)
  })
})
