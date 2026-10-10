/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import colorsFixture from './__fixtures__/colors.json'
import minimal from './__fixtures__/minimal.json'
import {
  listColors,
  mapColorSites,
  readColorSites,
  replaceColor,
  type ColorEntry,
} from './colors'
import { readTgs, type Lottie } from './tgs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SAMPLES_DIR = resolve(HERE, '..', '..', 'samples')

const fixture = colorsFixture as Lottie

function listSampleFiles(): string[] {
  if (!existsSync(SAMPLES_DIR)) return []
  return readdirSync(SAMPLES_DIR)
    .filter((name) => name.endsWith('.tgs'))
    .sort()
    .map((name) => join(SAMPLES_DIR, name))
}

// --- Ground truth for colors.json ------------------------------------------
// Every color occurrence in the fixture, with where its r,g,b live. Tests patch
// a structuredClone of the fixture at these locations by hand and compare it to
// the library result, so any other changed (or dropped) field fails the test.

type Path = (string | number)[]
interface Occurrence { hex: string; path: Path; at: number }

const STATIC_FILL: Path = ['layers', 0, 'shapes', 0, 'it', 1, 'it', 1, 'c', 'k']
const STATIC_STROKE: Path = ['layers', 0, 'shapes', 0, 'it', 2, 'c', 'k']
const ANIM_FILL: Path = ['layers', 1, 'shapes', 0, 'it', 1, 'c', 'k']
const ANIM_STROKE: Path = ['layers', 1, 'shapes', 0, 'it', 2, 'c', 'k']
const GRADIENT: Path = ['layers', 2, 'shapes', 0, 'it', 1, 'g', 'k', 'k']
const PRECOMP_FILL: Path = ['assets', 0, 'layers', 0, 'shapes', 0, 'it', 1, 'c', 'k']
const PRECOMP_STROKE: Path = ['assets', 0, 'layers', 0, 'shapes', 0, 'it', 2, 'c', 'k']

const OCCURRENCES: Record<string, Occurrence> = {
  staticFill: { hex: '#ff0000', path: STATIC_FILL, at: 0 },
  staticStroke: { hex: '#00ff00', path: STATIC_STROKE, at: 0 },
  animFillKf0S: { hex: '#0000ff', path: [...ANIM_FILL, 0, 's'], at: 0 }, // alpha 0.5
  animFillKf0E: { hex: '#ffff00', path: [...ANIM_FILL, 0, 'e'], at: 0 },
  animFillKf1S: { hex: '#ffff00', path: [...ANIM_FILL, 1, 's'], at: 0 },
  animFillKf1E: { hex: '#ff00ff', path: [...ANIM_FILL, 1, 'e'], at: 0 },
  animStrokeKf0S: { hex: '#008080', path: [...ANIM_STROKE, 0, 's'], at: 0 }, // s only
  animStrokeKf1S: { hex: '#0000ff', path: [...ANIM_STROKE, 1, 's'], at: 0 },
  gradientStop0: { hex: '#ff8000', path: GRADIENT, at: 1 },
  gradientStop1: { hex: '#00ffff', path: GRADIENT, at: 5 },
  gradientStop2: { hex: '#ff0000', path: GRADIENT, at: 9 },
  precompFill: { hex: '#3366cc', path: PRECOMP_FILL, at: 0 }, // 3 components
  precompStroke: { hex: '#00ff00', path: PRECOMP_STROKE, at: 0 }, // alpha 0.8
}

const EXPECTED_LIST: ColorEntry[] = [
  { hex: '#0000ff', count: 2 },
  { hex: '#00ff00', count: 2 },
  { hex: '#ff0000', count: 2 },
  { hex: '#ffff00', count: 2 },
  { hex: '#008080', count: 1 },
  { hex: '#00ffff', count: 1 },
  { hex: '#3366cc', count: 1 },
  { hex: '#ff00ff', count: 1 },
  { hex: '#ff8000', count: 1 },
]

const NEW_HEX = '#123456'

function rgb(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')
}

function getAt(root: unknown, path: Path): unknown {
  return path.reduce<unknown>((node, key) => (node as Record<string | number, unknown>)[key], root)
}

// Returns a structuredClone of `base` with every listed occurrence of `fromHex`
// overwritten (r, g, b only) with `toHex`.
function expectedAfterReplace(base: Lottie, fromHex: string, toHexValue: string): Lottie {
  const clone = structuredClone(base)
  for (const occ of Object.values(OCCURRENCES)) {
    if (occ.hex !== fromHex.toLowerCase()) continue
    const arr = getAt(clone, occ.path) as number[]
    arr.splice(occ.at, 3, ...rgb(toHexValue))
  }
  return clone
}

// minimal.json with its shapes replaced, for small hand-made cases.
function withShapes(shapes: unknown[]): Lottie {
  const anim = structuredClone(minimal) as Lottie
  ;(anim.layers[0] as { shapes: unknown[] }).shapes = shapes
  return anim
}

function countOf(list: ColorEntry[], hex: string): number {
  return list.find((entry) => entry.hex === hex)?.count ?? 0
}

describe('colors.json fixture', () => {
  it('has the colors the ground-truth table says it has', () => {
    for (const [name, occ] of Object.entries(OCCURRENCES)) {
      const arr = getAt(fixture, occ.path) as number[]
      expect(toHex(arr[occ.at], arr[occ.at + 1], arr[occ.at + 2]), name).toBe(occ.hex)
    }
  })

  it('is a 512x512, 60 fps, 60-frame Lottie', () => {
    expect([fixture.w, fixture.h, fixture.fr, fixture.ip, fixture.op]).toEqual([512, 512, 60, 0, 60])
  })
})

describe('listColors', () => {
  it('lists every color once with its occurrence count, most used first', () => {
    expect(listColors(fixture)).toEqual(EXPECTED_LIST)
  })

  it('counts only real colors (not color-like position keyframes or gradient opacity stops)', () => {
    const total = listColors(fixture).reduce((sum, entry) => sum + entry.count, 0)
    expect(total).toBe(Object.keys(OCCURRENCES).length)
  })

  it('ignores alpha: the same rgb with different alpha is one entry', () => {
    // #0000ff has alpha 0.5 in the animated fill and alpha 1 in the animated stroke.
    expect(countOf(listColors(fixture), '#0000ff')).toBe(2)
    // #00ff00 has alpha 1 on the layer stroke and 0.8 in the precomp stroke.
    expect(countOf(listColors(fixture), '#00ff00')).toBe(2)
  })

  it('finds colors inside precomp assets, nested groups, animated keyframes and gradients', () => {
    const list = listColors(fixture)
    expect(countOf(list, '#3366cc')).toBe(1) // assets[].layers
    expect(countOf(list, '#ff0000')).toBe(2) // nested gr.it fill + gradient stop
    expect(countOf(list, '#ff00ff')).toBe(1) // keyframe e
    expect(countOf(list, '#008080')).toBe(1) // keyframe s without e
    expect(countOf(list, '#00ffff')).toBe(1) // gradient stop
  })

  it('returns an empty list for an animation without colors', () => {
    expect(listColors({ ...(minimal as Lottie), layers: [], assets: [] })).toEqual([])
  })

  it('does not mutate its input', () => {
    const snapshot = structuredClone(fixture)
    listColors(fixture)
    expect(fixture).toEqual(snapshot)
  })
})

describe('replaceColor', () => {
  const cases: [string, string][] = [
    ['static fill (fl.c.k), also used by a gradient stop', '#ff0000'],
    ['static stroke (st), also used by a precomp asset stroke', '#00ff00'],
    ['animated color keyframe s (alpha 0.5) and a stroke keyframe s', '#0000ff'],
    ['animated color keyframe e and the next keyframe s', '#ffff00'],
    ['animated color keyframe e only', '#ff00ff'],
    ['animated stroke keyframe s without e', '#008080'],
    ['gradient fill, first color stop (opacity stops and offsets untouched)', '#ff8000'],
    ['gradient fill, middle color stop', '#00ffff'],
    ['3-component color in a precomp asset (assets[].layers)', '#3366cc'],
  ]

  it.each(cases)('%s', (_label, hex) => {
    const result = replaceColor(fixture, hex, NEW_HEX)
    // Everything except the replaced r,g,b components is identical to the input.
    expect(result).toEqual(expectedAfterReplace(fixture, hex, NEW_HEX))
    // And the palette view agrees: old color gone, its count moved to the new one.
    const before = listColors(fixture)
    const after = listColors(result)
    expect(countOf(after, hex)).toBe(0)
    expect(countOf(after, NEW_HEX)).toBe(countOf(before, hex))
  })

  it('keeps each occurrence\'s alpha and component count', () => {
    const result = replaceColor(fixture, '#0000ff', NEW_HEX)
    expect(getAt(result, [...ANIM_FILL, 0, 's'])).toEqual([...rgb(NEW_HEX), 0.5])
    expect(getAt(result, [...ANIM_STROKE, 1, 's'])).toEqual([...rgb(NEW_HEX), 1])

    const green = replaceColor(fixture, '#00ff00', NEW_HEX)
    expect(getAt(green, PRECOMP_STROKE)).toEqual([...rgb(NEW_HEX), 0.8])

    const precomp = replaceColor(fixture, '#3366cc', NEW_HEX)
    expect(getAt(precomp, PRECOMP_FILL)).toEqual(rgb(NEW_HEX)) // still 3 components
  })

  it('leaves gradient offsets and opacity stops alone', () => {
    const result = replaceColor(fixture, '#ff0000', NEW_HEX)
    const stops = getAt(result, GRADIENT) as number[]
    expect([stops[0], stops[4], stops[8]]).toEqual([0, 0.5, 1]) // offsets
    expect(stops.slice(12)).toEqual([0, 1, 0.5, 0.5, 1, 1]) // opacity stops
  })

  it('does not treat color-like non-color values as colors', () => {
    // Layer 2 position keyframes use s = [1,0,0] and e = [0,1,0], which look like red/green.
    const result = replaceColor(replaceColor(fixture, '#ff0000', NEW_HEX), '#00ff00', '#654321')
    expect(getAt(result, ['layers', 1, 'ks', 'p', 'k', 0, 's'])).toEqual([1, 0, 0])
    expect(getAt(result, ['layers', 1, 'ks', 'p', 'k', 0, 'e'])).toEqual([0, 1, 0])
  })

  it('accepts hex in any case', () => {
    expect(replaceColor(fixture, '#FF0000', '#ABCDEF')).toEqual(
      expectedAfterReplace(fixture, '#ff0000', '#abcdef'),
    )
  })

  it('merges into an existing color', () => {
    const list = listColors(replaceColor(fixture, '#ff0000', '#00ff00'))
    expect(countOf(list, '#00ff00')).toBe(4)
    expect(countOf(list, '#ff0000')).toBe(0)
  })

  it('returns an equal copy when the color is not in the animation', () => {
    const result = replaceColor(fixture, '#abcdef', NEW_HEX)
    expect(result).toEqual(fixture)
    expect(result).not.toBe(fixture)
  })

  it('returns an equal copy when from and to are the same color', () => {
    const result = replaceColor(fixture, '#ff8000', '#FF8000')
    expect(result).toEqual(fixture) // no float drift (0.5019607843137255 stays)
    expect(result).not.toBe(fixture)
  })

  it('keeps a channel that is not n/255 exactly when from and to are the same color', () => {
    // 0.5 is not a byte value: rewriting it as #800000 would store 128/255 instead.
    const anim = withShapes([{ ty: 'fl', c: { a: 0, k: [0.5, 0, 0, 1] } }])
    const result = replaceColor(anim, '#800000', '#800000')
    expect(getAt(result, ['layers', 0, 'shapes', 0, 'c', 'k'])).toEqual([0.5, 0, 0, 1])
    expect(result).toEqual(anim)
    expect(result).not.toBe(anim)
  })

  it('does not mutate its input', () => {
    const snapshot = structuredClone(fixture)
    for (const [, hex] of cases) replaceColor(fixture, hex, NEW_HEX)
    replaceColor(fixture, '#abcdef', NEW_HEX)
    expect(fixture).toEqual(snapshot)
  })

  it('returns a new object that shares no structure with the input', () => {
    const snapshot = structuredClone(fixture)
    const result = replaceColor(fixture, '#ff0000', NEW_HEX)
    expect(result).not.toBe(fixture)
    expect(result.layers).not.toBe(fixture.layers)
    expect(result.assets).not.toBe(fixture.assets)
    ;(getAt(result, STATIC_STROKE) as number[])[1] = 0.25
    ;(getAt(result, [...ANIM_FILL, 0]) as Record<string, unknown>).t = 99
    expect(fixture).toEqual(snapshot)
  })

  it('throws on a malformed hex color', () => {
    for (const bad of ['', 'red', '#12345', '#1234567', '#gggggg', 'ff0000']) {
      expect(() => replaceColor(fixture, bad, NEW_HEX), `from ${bad}`).toThrow(/hex color/i)
      expect(() => replaceColor(fixture, '#ff0000', bad), `to ${bad}`).toThrow(/hex color/i)
    }
  })

  it('handles gradient strokes (gs) like gradient fills', () => {
    const anim = structuredClone(fixture)
    const gf = getAt(anim, ['layers', 2, 'shapes', 0, 'it', 1]) as Record<string, unknown>
    gf.ty = 'gs'
    const result = replaceColor(anim, '#ff8000', NEW_HEX)
    expect(listColors(result)).toContainEqual({ hex: NEW_HEX, count: 1 })
    expect(countOf(listColors(result), '#ff8000')).toBe(0)
  })

  it('handles animated gradients (keyframe s and e hold the stop arrays)', () => {
    // p = 2: [offset,r,g,b] x 2, then 2 opacity stops [offset,alpha] x 2.
    const s = [0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1]
    const e = [0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 1]
    const anim = withShapes([{ ty: 'gf', g: { p: 2, k: { a: 1, k: [{ t: 0, s, e }, { t: 59 }] } } }])
    const snapshot = structuredClone(anim)

    expect(listColors(anim)).toEqual([
      { hex: '#ff0000', count: 2 },
      { hex: '#0000ff', count: 1 },
      { hex: '#00ff00', count: 1 },
    ])

    const result = replaceColor(anim, '#ff0000', NEW_HEX)
    const expected = structuredClone(anim)
    const kf = getAt(expected, ['layers', 0, 'shapes', 0, 'g', 'k', 'k', 0]) as { s: number[]; e: number[] }
    kf.s.splice(1, 3, ...rgb(NEW_HEX))
    kf.e.splice(1, 3, ...rgb(NEW_HEX))
    expect(result).toEqual(expected)
    expect(anim).toEqual(snapshot)
  })
})

describe('samples', () => {
  const files = listSampleFiles()

  if (files.length === 0) {
    it('has no sample .tgs files (fixtures cover the cases)', () => {
      expect(files).toEqual([])
    })
  }

  for (const file of files) {
    it(`${basename(file)}: lists colors and replaces the most used one without loss`, async () => {
      const anim = await readTgs(new Uint8Array(readFileSync(file)))
      const snapshot = structuredClone(anim)
      const list = listColors(anim)
      expect(anim).toEqual(snapshot)
      for (const entry of list) expect(entry.hex).toMatch(/^#[0-9a-f]{6}$/)
      if (list.length === 0) return

      const top = list[0]
      const target = '#010203'
      const result = replaceColor(anim, top.hex, target)
      expect(anim).toEqual(snapshot)
      const after = listColors(result)
      expect(countOf(after, top.hex)).toBe(0)
      expect(countOf(after, target)).toBe(top.count + countOf(list, target))
    })
  }
})

describe('readColorSites', () => {
  const SITE_HEXES = [
    '#3366cc', '#00ff00', '#ff0000', '#00ff00', '#0000ff',
    '#ffff00', '#ffff00', '#ff00ff', '#008080', '#0000ff',
    '#ff8000', '#00ffff', '#ff0000',
  ]

  it('returns the 13 fixture sites in walk order with their gradient ordinals', () => {
    const sites = readColorSites(fixture)
    expect(sites.map((site) => site.hex)).toEqual(SITE_HEXES)
    expect(sites.map((site) => site.index)).toEqual(SITE_HEXES.map((_, i) => i))
    expect(sites.map((site) => site.gradient)).toEqual([
      ...Array(10).fill(null),
      0, 0, 0,
    ])
  })

  it('agrees with listColors on every hex count', () => {
    const counts = new Map<string, number>()
    for (const site of readColorSites(fixture)) counts.set(site.hex, (counts.get(site.hex) ?? 0) + 1)
    for (const entry of listColors(fixture)) expect(counts.get(entry.hex)).toBe(entry.count)
    expect(counts.size).toBe(listColors(fixture).length)
  })

  it('gives a gf followed by a gs the gradient ordinals 0 and 1', () => {
    const anim = withShapes([
      { ty: 'gf', g: { p: 1, k: { a: 0, k: [0, 1, 0, 0] } } },
      { ty: 'gs', g: { p: 1, k: { a: 0, k: [0, 0, 0, 1] } } },
    ])
    const sites = readColorSites(anim)
    expect(sites.map((site) => [site.hex, site.gradient])).toEqual([
      ['#ff0000', 0],
      ['#0000ff', 1],
    ])
  })

  it('does not count a gradient without a numeric p', () => {
    const anim = withShapes([
      { ty: 'gf', g: { k: { a: 0, k: [0, 1, 0, 0] } } },
      { ty: 'gs', g: { p: 1, k: { a: 0, k: [0, 0, 0, 1] } } },
    ])
    expect(readColorSites(anim).map((site) => site.gradient)).toEqual([0])
  })

  it('does not mutate its input', () => {
    const snapshot = structuredClone(fixture)
    readColorSites(fixture)
    expect(fixture).toEqual(snapshot)
  })
})

describe('mapColorSites', () => {
  it('returns an equal copy when fn returns null, and does not mutate the input', () => {
    const snapshot = structuredClone(fixture)
    const result = mapColorSites(fixture, () => null)
    expect(result).toEqual(fixture)
    expect(result).not.toBe(fixture)
    expect(fixture).toEqual(snapshot)
  })

  it('changes only the gradient stop at index 12', () => {
    const result = mapColorSites(fixture, (site) => (site.index === 12 ? '#123456' : null))
    const expected = structuredClone(fixture) as Lottie
    const stops = getAt(expected, GRADIENT) as number[]
    stops.splice(9, 3, ...rgb('#123456'))
    expect(result).toEqual(expected)
    expect(readColorSites(result)[2].hex).toBe('#ff0000')
    expect(readColorSites(result)[12].hex).toBe('#123456')
  })

  it('keeps index 2 (#ff0000) unchanged when only other sites are recoloured', () => {
    const result = mapColorSites(fixture, (site) => (site.index === 2 ? null : '#123456'))
    expect(readColorSites(result)[2].hex).toBe('#ff0000')
    expect(getAt(result, STATIC_FILL)).toEqual(getAt(fixture, STATIC_FILL))
  })

  it('keeps the original floats when fn returns the current hex', () => {
    const anim = withShapes([{ ty: 'fl', c: { a: 0, k: [0.996, 0, 0, 1] } }])
    const result = mapColorSites(anim, () => '#fe0000')
    expect(getAt(result, ['layers', 0, 'shapes', 0, 'c', 'k'])).toEqual([0.996, 0, 0, 1])
    expect(result).toEqual(anim)
  })

  it('accepts upper-case hex', () => {
    const anim = withShapes([{ ty: 'fl', c: { a: 0, k: [1, 0, 0, 1] } }])
    const result = mapColorSites(anim, () => '#ABCDEF')
    expect(getAt(result, ['layers', 0, 'shapes', 0, 'c', 'k'])).toEqual([...rgb('#abcdef'), 1])
  })

  it('throws on a malformed hex returned by fn', () => {
    const anim = withShapes([{ ty: 'fl', c: { a: 0, k: [1, 0, 0, 1] } }])
    expect(() => mapColorSites(anim, () => 'red')).toThrow(/hex color/i)
    expect(() => mapColorSites(anim, () => '#12345')).toThrow(/hex color/i)
  })

  it('gives the same indices to the same sites as readColorSites', () => {
    const seen: number[] = []
    mapColorSites(fixture, (site) => {
      seen.push(site.index)
      return null
    })
    expect(seen).toEqual(readColorSites(fixture).map((site) => site.index))
  })
})

describe('colour sites on samples', () => {
  const files = listSampleFiles()

  if (files.length === 0) {
    it('falls back to the fixture when there are no sample files', () => {
      const sites = readColorSites(fixture)
      const total = listColors(fixture).reduce((sum, entry) => sum + entry.count, 0)
      expect(sites).toHaveLength(total)
      const recoloured = mapColorSites(fixture, (site) => (site.index % 2 === 0 ? '#010203' : null))
      expect(readColorSites(recoloured).map((site) => site.gradient)).toEqual(
        readColorSites(fixture).map((site) => site.gradient),
      )
      expect(mapColorSites(fixture, () => null)).toEqual(fixture)
    })
  }

  for (const file of files) {
    it(`${basename(file)}: site count matches listColors and recolouring keeps the structure`, async () => {
      const anim = await readTgs(new Uint8Array(readFileSync(file)))
      const snapshot = structuredClone(anim)
      const sites = readColorSites(anim)
      const total = listColors(anim).reduce((sum, entry) => sum + entry.count, 0)
      expect(sites).toHaveLength(total)
      expect(anim).toEqual(snapshot)

      expect(mapColorSites(anim, () => null)).toEqual(anim)

      const recoloured = mapColorSites(anim, (site) => (site.index % 2 === 0 ? '#010203' : null))
      expect(anim).toEqual(snapshot)
      const after = readColorSites(recoloured)
      expect(after).toHaveLength(sites.length)
      expect(after.map((site) => site.gradient)).toEqual(sites.map((site) => site.gradient))
    })
  }
})
