import { describe, expect, it } from 'vitest'
import { hexToOklch, maxChroma, oklchToHex } from './oklch'

describe('hexToOklch reference values', () => {
  const cases: Array<[string, number, number, number]> = [
    ['#ff0000', 0.628, 0.258, 29.2],
    ['#0000ff', 0.452, 0.313, 264.1],
    ['#00ff00', 0.866, 0.295, 142.5],
    ['#ffff00', 0.968, 0.211, 109.8],
  ]
  for (const [hex, l, c, h] of cases) {
    it(`${hex} → (${l}, ${c}, ${h})`, () => {
      const got = hexToOklch(hex)
      expect(Math.abs(got.l - l)).toBeLessThanOrEqual(0.001)
      expect(Math.abs(got.c - c)).toBeLessThanOrEqual(0.001)
      expect(Math.abs(got.h - h)).toBeLessThanOrEqual(0.2)
    })
  }

  it('white is achromatic with l 1', () => {
    const w = hexToOklch('#ffffff')
    expect(w.l).toBeCloseTo(1, 3)
    expect(w.c).toBeLessThan(1e-4)
    expect(w.h).toBeGreaterThanOrEqual(0)
    expect(w.h).toBeLessThan(360)
  })

  it('black is l 0, c 0', () => {
    const k = hexToOklch('#000000')
    expect(k.l).toBeCloseTo(0, 6)
    expect(k.c).toBe(0)
    expect(Number.isFinite(k.h)).toBe(true)
  })

  it('accepts any case', () => {
    expect(hexToOklch('#FF0000')).toEqual(hexToOklch('#ff0000'))
  })

  it('throws on malformed input', () => {
    expect(() => hexToOklch('ff0000')).toThrow()
    expect(() => hexToOklch('#fff')).toThrow()
    expect(() => hexToOklch('#gg0000')).toThrow()
    expect(() => hexToOklch('')).toThrow()
  })

  it('keeps h in [0, 360)', () => {
    for (let r = 0; r <= 255; r += 15) {
      for (let b = 0; b <= 255; b += 15) {
        const { h } = hexToOklch(`#${[r, 0, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`)
        expect(h).toBeGreaterThanOrEqual(0)
        expect(h).toBeLessThan(360)
      }
    }
  })
})

describe('oklchToHex', () => {
  it('returns lowercase #rrggbb', () => {
    expect(oklchToHex({ l: 0.628, c: 0.258, h: 29.2 })).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('out-of-gamut colour yields a valid hex within l ±0.01 and h ±2°', () => {
    const target = { l: 0.7, c: 0.4, h: 264 }
    const hex = oklchToHex(target)
    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    const back = hexToOklch(hex)
    expect(Math.abs(back.l - target.l)).toBeLessThanOrEqual(0.01)
    let dh = Math.abs(back.h - target.h)
    if (dh > 180) dh = 360 - dh
    expect(dh).toBeLessThanOrEqual(2)
  })

  it('clamps l above 1 to white and below 0 to black', () => {
    expect(oklchToHex({ l: 1.2, c: 0, h: 0 })).toBe('#ffffff')
    expect(oklchToHex({ l: -0.1, c: 0, h: 0 })).toBe('#000000')
  })

  it('treats negative chroma as zero', () => {
    expect(oklchToHex({ l: 0.5, c: -0.2, h: 100 })).toBe(oklchToHex({ l: 0.5, c: 0, h: 100 }))
  })

  it('does not mutate its input', () => {
    const input = { l: 0.7, c: 0.4, h: 264 }
    const snapshot = { ...input }
    oklchToHex(input)
    expect(input).toEqual(snapshot)
  })
})

describe('step-15 grid round trip', () => {
  it('hex → oklch → hex is exact for every r,g,b in {0,15,…,255}', () => {
    const levels: number[] = []
    for (let v = 0; v <= 255; v += 15) levels.push(v)
    const hexOf = (v: number) => v.toString(16).padStart(2, '0')
    const failures: string[] = []
    for (const r of levels) {
      for (const g of levels) {
        for (const b of levels) {
          const hex = `#${hexOf(r)}${hexOf(g)}${hexOf(b)}`
          const back = oklchToHex(hexToOklch(hex))
          if (back !== hex) failures.push(`${hex}->${back}`)
        }
      }
    }
    expect(failures).toEqual([])
  })
})

describe('maxChroma', () => {
  it('matches the red primary chroma', () => {
    expect(Math.abs(maxChroma(0.628, 29.23) - 0.258)).toBeLessThanOrEqual(0.002)
  })

  it('is near zero at white and black', () => {
    expect(maxChroma(1, 100)).toBeLessThan(0.005)
    expect(maxChroma(0, 100)).toBeLessThan(0.005)
  })
})
