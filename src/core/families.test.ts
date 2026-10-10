/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import colorsFixture from './__fixtures__/colors.json'
import minimal from './__fixtures__/minimal.json'
import { readColorSites } from './colors'
import {
  findFamilies,
  recolorFamily,
  recolorShade,
  viewFamily,
  type ColorFamily,
} from './families'
import { hexToOklch } from './oklch'
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

// --- Helpers that build small animations from minimal.json -------------------

function rgba(hex: string): number[] {
  return [...[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), 1]
}

function fl(hex: string): unknown {
  return { ty: 'fl', c: { a: 0, k: rgba(hex) } }
}

// A static gradient fill; each stop is [offset, r, g, b].
function gf(hexes: string[]): unknown {
  const k: number[] = []
  hexes.forEach((hex, i) => k.push(i / Math.max(1, hexes.length - 1), ...rgba(hex).slice(0, 3)))
  return { ty: 'gf', g: { p: hexes.length, k: { a: 0, k } } }
}

function withShapes(shapes: unknown[]): Lottie {
  const anim = structuredClone(minimal) as Lottie
  ;(anim.layers[0] as { shapes: unknown[] }).shapes = shapes
  return anim
}

function fills(hexes: string[]): Lottie {
  return withShapes(hexes.map(fl))
}

function hexes(anim: Lottie): string[] {
  return readColorSites(anim).map((site) => site.hex)
}

function byName(families: ColorFamily[], name: string): ColorFamily {
  const family = families.find((f) => f.name === name)
  if (!family) throw new Error(`no family ${name} in ${families.map((f) => f.name).join(', ')}`)
  return family
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
}

function shadeCount(anim: Lottie, family: ColorFamily): number {
  return viewFamily(readColorSites(anim), family).shades.length
}

function summary(anim: Lottie): [string, number][] {
  return findFamilies(anim).map((family) => [family.name, shadeCount(anim, family)])
}

// Every site index of `anim` appears in exactly one family, and each family's
// sites are ascending and contain its key.
function expectPartition(anim: Lottie): void {
  const families = findFamilies(anim)
  const total = readColorSites(anim).length
  const seen = families.flatMap((family) => family.sites)
  expect([...seen].sort((a, b) => a - b)).toEqual(Array.from({ length: total }, (_, i) => i))
  families.forEach((family, position) => {
    expect(family.id).toBe(position)
    expect([...family.sites].sort((a, b) => a - b)).toEqual(family.sites)
    expect(family.sites).toContain(family.keySite)
  })
}

// Fixture sites (walk order):
//   0 #3366cc  1 #00ff00  2 #ff0000  3 #00ff00  4 #0000ff  5 #ffff00  6 #ffff00
//   7 #ff00ff  8 #008080  9 #0000ff  10 #ff8000 11 #00ffff 12 #ff0000
// The gradient (10-12: orange, cyan, red) pulls cyan and teal into the reds.

describe('findFamilies on the fixture', () => {
  it('finds Красные, Зелёные, Синие and Розовые with their sites and keys', () => {
    const families = findFamilies(fixture)
    expect(
      families.map((f) => [f.name, f.neutral, f.sites, f.keySite]),
    ).toEqual([
      ['Красные', false, [2, 8, 10, 11, 12], 2],
      ['Зелёные', false, [1, 3, 5, 6], 1],
      ['Синие', false, [0, 4, 9], 4],
      ['Розовые', false, [7], 7],
    ])
    expect(families.map((f) => f.id)).toEqual([0, 1, 2, 3])
  })

  it('is a partition of the sites', () => {
    expectPartition(fixture)
  })

  it('does not mutate its input and is deterministic', () => {
    const snapshot = structuredClone(fixture)
    const first = findFamilies(fixture)
    expect(fixture).toEqual(snapshot)
    expect(findFamilies(fixture)).toEqual(first)
  })

  it('returns no families for an animation without colours', () => {
    expect(findFamilies({ ...(minimal as Lottie), layers: [], assets: [] })).toEqual([])
  })
})

describe('findFamilies on small animations', () => {
  it('splits neutrals into Белые, Серые and Чёрные and keeps a grey-blue chromatic', () => {
    const anim = fills(['#ffffff', '#fffffb', '#f4f4f4', '#847375', '#3e3531', '#000000', '#c7d6e4'])
    const families = findFamilies(anim)
    expect(families.map((f) => [f.name, f.neutral, f.sites])).toEqual([
      ['Голубые', false, [6]],
      ['Белые', true, [0, 1, 2]],
      ['Серые', true, [3, 4]],
      ['Чёрные', true, [5]],
    ])
    expect(hexes(anim)[families[0].keySite]).toBe('#c7d6e4')
    expectPartition(anim)
  })

  it('joins hues within 40 degrees into one family', () => {
    expect(findFamilies(fills(['#ff0000', '#ff8000']))).toHaveLength(1)
  })

  it('keeps hues further apart than 40 degrees separate', () => {
    expect(findFamilies(fills(['#ffff00', '#0000ff']))).toHaveLength(2)
  })

  it('clusters circularly across the 0/360 seam', () => {
    // OKLCH hues 352.6 and 10.5: 18 degrees apart around the circle, 342 apart on the number line.
    const a = hexToOklch('#ff00a0')
    const b = hexToOklch('#ff0066')
    expect(hueDistance(a.h, b.h)).toBeLessThan(40)
    expect(Math.abs(a.h - b.h)).toBeGreaterThan(300)
    expect(findFamilies(fills(['#ff00a0', '#ff0066']))).toHaveLength(1)
  })

  it('merges the chromatic stops of one gradient', () => {
    const families = findFamilies(withShapes([gf(['#ff0000', '#ffff00'])]))
    expect(families).toHaveLength(1)
    expect(families[0].name).toBe('Красные')
    expect(families[0].sites).toEqual([0, 1])
  })

  it('does not pull a neutral stop of a gradient into the family', () => {
    const anim = withShapes([gf(['#ff0000', '#ffffff']), fl('#ffffff')])
    const families = findFamilies(anim)
    expect(families.map((f) => [f.name, f.sites])).toEqual([
      ['Красные', [0]],
      ['Белые', [1, 2]],
    ])
  })

  it('does not let a shared neutral chain two families together', () => {
    const anim = withShapes([gf(['#ff0000', '#ffffff']), gf(['#0000ff', '#ffffff'])])
    const families = findFamilies(anim)
    expect(families.map((f) => f.name).sort()).toEqual(['Белые', 'Красные', 'Синие'].sort())
  })

  it('picks the key by count, then chroma, then hex, and keySite is its first index', () => {
    const anim = fills(['#9b0016', '#9b0016', '#ff2f00', '#ff2f00', '#cd0a14'])
    const families = findFamilies(anim)
    expect(families).toHaveLength(1)
    expect(hexes(anim)[families[0].keySite]).toBe('#ff2f00')
    expect(families[0].keySite).toBe(2)
  })

  it('breaks an exact tie by the smallest hex', () => {
    const anim = fills(['#ff0000', '#ff0000'])
    const lone = findFamilies(anim)[0]
    expect(lone.keySite).toBe(0)
    // two reds with equal count and (practically) equal chroma pick the smaller hex
    const tie = findFamilies(fills(['#ff1010', '#ff0000']))
    expect(tie).toHaveLength(1)
    expect(hexes(fills(['#ff1010', '#ff0000']))[tie[0].keySite]).toBe('#ff0000')
  })

  it('numbers repeated names « 2», « 3»', () => {
    const families = findFamilies(fills(['#00ffff', '#5f7b93']))
    expect(families.map((f) => f.name)).toEqual(['Голубые', 'Голубые 2'])
  })

  it('names chromatic families by the key hue buckets', () => {
    const samples: [string, string][] = [
      ['#ff0000', 'Красные'],
      ['#ff8000', 'Оранжевые'],
      ['#ffff00', 'Жёлтые'],
      ['#00ff00', 'Зелёные'],
      ['#00ffff', 'Голубые'],
      ['#0000ff', 'Синие'],
      ['#8a2be2', 'Фиолетовые'],
      ['#ff00ff', 'Розовые'],
    ]
    for (const [hex, name] of samples) {
      expect(findFamilies(fills([hex]))[0].name, hex).toBe(name)
    }
  })

  it('orders chromatic families by size, then key hue, then Белые, Серые, Чёрные', () => {
    const anim = fills([
      '#000000', '#808080', '#ffffff',
      '#0000ff', '#ff0000', '#ff0000', '#00ff00',
    ])
    expect(findFamilies(anim).map((f) => f.name)).toEqual([
      'Красные', // 2 sites
      'Зелёные', // 1 site, hue 142
      'Синие', //   1 site, hue 264
      'Белые',
      'Серые',
      'Чёрные',
    ])
  })
})

describe('viewFamily', () => {
  it('lists the key and the shades by lightness on the fixture reds', () => {
    const families = findFamilies(fixture)
    const reds = byName(families, 'Красные')
    const view = viewFamily(readColorSites(fixture), reds)
    expect(view.key).toBe('#ff0000')
    expect(view.shades).toEqual([
      { hex: '#008080', count: 1 },
      { hex: '#ff0000', count: 2 },
      { hex: '#ff8000', count: 1 },
      { hex: '#00ffff', count: 1 },
    ])
  })

  it('follows the current colours of the sites, not the original ones', () => {
    const reds = byName(findFamilies(fixture), 'Красные')
    const recoloured = recolorFamily(fixture, reds, '#2266ff')
    const view = viewFamily(readColorSites(recoloured), reds)
    expect(view.key).toBe('#2266ff')
    expect(view.shades.reduce((sum, shade) => sum + shade.count, 0)).toBe(reds.sites.length)
  })
})

describe('recolorFamily on the fixture', () => {
  const TARGETS = ['#2266ff', '#8a2be2', '#808080', '#000000', '#ffffff', '#00ff00']
  const families = findFamilies(fixture)
  const before = readColorSites(fixture)

  for (const family of families) {
    for (const target of TARGETS) {
      it(`${family.name} → ${target}: key site gets the target, other sites are untouched`, () => {
        const snapshot = structuredClone(fixture)
        const result = recolorFamily(fixture, family, target)
        expect(fixture).toEqual(snapshot)
        const after = readColorSites(result)
        expect(after).toHaveLength(before.length)
        expect(after[family.keySite].hex).toBe(target)
        const inFamily = new Set(family.sites)
        for (const site of before) {
          if (inFamily.has(site.index)) continue
          expect(after[site.index].hex, `site ${site.index}`).toBe(site.hex)
        }
        // the same old shade always becomes the same new shade
        const mapped = new Map<string, string>()
        for (const index of family.sites) {
          const old = before[index].hex
          const next = mapped.get(old)
          if (next === undefined) mapped.set(old, after[index].hex)
          else expect(after[index].hex).toBe(next)
        }
      })

      it(`${family.name} → ${target}: keeps the lightness order of the shades`, () => {
        const after = readColorSites(recolorFamily(fixture, family, target))
        const pairs = [...new Set(family.sites.map((i) => before[i].hex))].map((hex) => {
          const index = family.sites.find((i) => before[i].hex === hex) as number
          return { l: hexToOklch(hex).l, l2: hexToOklch(after[index].hex).l }
        })
        for (const a of pairs) {
          for (const b of pairs) {
            if (a.l < b.l) expect(a.l2).toBeLessThanOrEqual(b.l2 + 0.01)
          }
        }
      })
    }
  }

  it('recolouring a chromatic family to its own key changes nothing', () => {
    for (const family of families) {
      const key = before[family.keySite].hex
      expect(recolorFamily(fixture, family, key), family.name).toEqual(fixture)
    }
  })

  it('does not touch the structure of the animation', () => {
    const reds = byName(families, 'Красные')
    const result = recolorFamily(fixture, reds, '#2266ff')
    expect(readColorSites(result).map((s) => s.gradient)).toEqual(before.map((s) => s.gradient))
  })
})

describe('recolorFamily on neutral and tint cases', () => {
  // White is the key when it is used at least as often as the light grey; with equal
  // counts the choice falls to the chroma comparison, which for greys is float noise
  // (white 3.73e-8, #f4f4f4 3.60e-8), so both variants are covered.
  for (const [label, colours] of [
    ['white used twice', ['#ffffff', '#ffffff', '#f4f4f4']],
    ['one of each', ['#ffffff', '#f4f4f4']],
  ] as const) {
    it(`Белые [#ffffff, #f4f4f4] (${label}) → #ffd1dc: white is exactly the target, grey is tinted and darker`, () => {
      const anim = fills([...colours])
      const whites = byName(findFamilies(anim), 'Белые')
      expect(hexes(anim)[whites.keySite]).toBe('#ffffff')
      const result = recolorFamily(anim, whites, '#ffd1dc')
      const after = hexes(result)
      expect(after.slice(0, -1).every((hex) => hex === '#ffd1dc')).toBe(true)
      const target = hexToOklch('#ffd1dc')
      const tinted = hexToOklch(after[after.length - 1])
      expect(hueDistance(tinted.h, target.h)).toBeLessThanOrEqual(5)
      expect(tinted.l).toBeLessThan(target.l)
    })
  }

  it('a grey family takes the hue of the target (wherever it has visible chroma)', () => {
    const anim = fills(['#808080', '#404040', '#b0b0b0', '#585858'])
    const greys = byName(findFamilies(anim), 'Серые')
    for (const target of ['#2266ff', '#e0457b', '#2e8b57', '#ff8000']) {
      const goal = hexToOklch(target)
      const result = recolorFamily(anim, greys, target)
      let visible = 0
      for (const hex of hexes(result)) {
        const lch = hexToOklch(hex)
        if (lch.c > 0.02) {
          visible++
          expect(hueDistance(lch.h, goal.h), `${hex} for ${target}`).toBeLessThanOrEqual(5)
        }
      }
      expect(visible).toBeGreaterThan(0)
    }
  })

  it('a chromatic family whose key has turned grey is tinted, not scaled', () => {
    const anim = fills(['#808080', '#a0a0a0'])
    const family: ColorFamily = { id: 0, name: 'Красные', neutral: false, sites: [0, 1], keySite: 0 }
    const result = recolorFamily(anim, family, '#2266ff')
    const goal = hexToOklch('#2266ff')
    const lch = hexToOklch(hexes(result)[1])
    expect(lch.c).toBeGreaterThan(0.05)
    expect(hueDistance(lch.h, goal.h)).toBeLessThanOrEqual(5)
  })

  it('does not mutate the input animation or the family', () => {
    const anim = fills(['#ff0000', '#ff8000'])
    const family = findFamilies(anim)[0]
    const snapshot = structuredClone(anim)
    const familySnapshot = structuredClone(family)
    recolorFamily(anim, family, '#2266ff')
    recolorShade(anim, family, '#ff0000', '#00ff00')
    expect(anim).toEqual(snapshot)
    expect(family).toEqual(familySnapshot)
  })
})

describe('recolorShade', () => {
  it('works by site, so a recoloured family never merges back into another', () => {
    const families = findFamilies(fixture)
    const greens = byName(families, 'Зелёные')
    const reds = byName(families, 'Красные')
    const step1 = recolorShade(fixture, greens, '#00ff00', '#ff0000')
    const step2 = recolorShade(step1, reds, '#ff0000', '#000000')
    const after = readColorSites(step2)
    expect(after[2].hex).toBe('#000000')
    expect(after[12].hex).toBe('#000000')
    expect(after[1].hex).toBe('#ff0000')
    expect(after[3].hex).toBe('#ff0000')
  })

  it('changes only the family sites that have the `from` hex', () => {
    const greens = byName(findFamilies(fixture), 'Зелёные')
    const result = recolorShade(fixture, greens, '#ffff00', '#123456')
    const before = hexes(fixture)
    const after = hexes(result)
    after.forEach((hex, i) => {
      expect(hex).toBe(i === 5 || i === 6 ? '#123456' : before[i])
    })
  })

  it('does nothing when no family site has that hex', () => {
    const greens = byName(findFamilies(fixture), 'Зелёные')
    expect(recolorShade(fixture, greens, '#ff0000', '#123456')).toEqual(fixture)
  })
})

describe('families on samples', () => {
  const files = listSampleFiles()

  const EXPECTED: Record<string, [string, number][]> = {
    'HeartSticker.tgs': [
      ['Красные', 7],
      ['Белые', 3],
    ],
    'CoolSticker.tgs': [
      ['Жёлтые', 8],
      ['Голубые', 11],
      ['Белые', 1],
    ],
    'AnimatedSticker.tgs': [
      ['Оранжевые', 9],
      ['Белые', 3],
      ['Серые', 15],
      ['Чёрные', 1],
    ],
  }

  if (files.length === 0) {
    it('has no sample .tgs files (fixtures cover the cases)', () => {
      expect(files).toEqual([])
    })
  }

  for (const file of files) {
    it(`${basename(file)}: families partition the sites and recolouring to the own key is a no-op`, async () => {
      const anim = await readTgs(new Uint8Array(readFileSync(file)))
      const snapshot = structuredClone(anim)
      expectPartition(anim)
      expect(anim).toEqual(snapshot)

      const sites = readColorSites(anim)
      for (const family of findFamilies(anim)) {
        if (family.neutral) continue
        const key = sites[family.keySite].hex
        expect(recolorFamily(anim, family, key), family.name).toEqual(anim)
      }
      expect(anim).toEqual(snapshot)
    })

    const expected = EXPECTED[basename(file)]
    if (expected) {
      it(`${basename(file)}: has the expected families`, async () => {
        const anim = await readTgs(new Uint8Array(readFileSync(file)))
        expect(summary(anim)).toEqual(expected)
      })
    }
  }
})
