/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import minimal from './__fixtures__/minimal.json'
import partsFixture from './__fixtures__/parts.json'
import { readColorSites, sitesWithin } from './colors'
import { isNeutral, recolorFamily } from './families'
import { hexToOklch } from './oklch'
import {
  matchProfile,
  resolveParts,
  resolveSelector,
  type Part,
  type PartSpec,
  type Selector,
  type StickerProfile,
} from './parts'
import { PROFILES } from './profiles'
import { readTgs, type Lottie } from './tgs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SAMPLES_DIR = resolve(HERE, '..', '..', 'samples')

const fixture = partsFixture as Lottie

type Json = Record<string, any>

// --- Fixture navigation (parts.json) -----------------------------------------
// Root layers: pre, pre, Body, Spark_1, Spark_2. Asset comp_x: a, b.
// Body > Outer > [rc, Inner, Inner, el, Other, tr].
// Colour sites in walk order: 0 a #ff0000, 1 b #00ff00, 2 Inner #0000ff,
// 3 Inner #ffff00, 4-5 Other gradient #ff8000 #00ffff, 6 Spark_1 #ffffff,
// 7 Spark_2 #ff00ff.

const rootLayers = fixture.layers as Json[]
const asset = (fixture.assets as Json[])[0]
const body = rootLayers[2]
const outer = body.shapes[0] as Json
const [inner1, inner2, other] = (outer.it as Json[]).filter((item) => item.ty === 'gr')
const spark1 = rootLayers[3]
const spark2 = rootLayers[4]

function expectSame(actual: object[], expected: object[]): void {
  expect(actual).toHaveLength(expected.length)
  expected.forEach((node, i) => expect(actual[i]).toBe(node))
}

function hexes(anim: Lottie): string[] {
  return readColorSites(anim).map((site) => site.hex)
}

describe('resolveSelector', () => {
  it('a bare layer name matches the whole layer, by identity', () => {
    expectSame(resolveSelector(fixture, { layer: 'Body' }), [body])
  })

  it('every layer with that name matches', () => {
    expectSame(resolveSelector(fixture, { layer: 'pre' }), [rootLayers[0], rootLayers[1]])
  })

  it('a path names groups inside the layer shapes, outermost first', () => {
    expectSame(resolveSelector(fixture, { layer: 'Body', path: ['Outer'] }), [outer])
    expectSame(resolveSelector(fixture, { layer: 'Body', path: ['Outer', 'Other'] }), [other])
  })

  it('groups sharing a name all match, in order', () => {
    expectSame(resolveSelector(fixture, { layer: 'Body', path: ['Outer', 'Inner'] }), [inner1, inner2])
  })

  it('#n is the n-th group item, counting groups only', () => {
    // Outer.it = [rc, Inner, Inner, el, Other, tr]
    expectSame(resolveSelector(fixture, { layer: 'Body', path: ['Outer', '#0'] }), [inner1])
    expectSame(resolveSelector(fixture, { layer: 'Body', path: ['Outer', '#1'] }), [inner2])
    expectSame(resolveSelector(fixture, { layer: 'Body', path: ['Outer', '#2'] }), [other])
    expect(resolveSelector(fixture, { layer: 'Body', path: ['Outer', '#3'] })).toEqual([])
  })

  it('* in a path is every group', () => {
    expectSame(resolveSelector(fixture, { layer: 'Body', path: ['*'] }), [outer])
    expectSame(resolveSelector(fixture, { layer: 'Body', path: ['Outer', '*'] }), [inner1, inner2, other])
  })

  it('steps compose: * then #n picks the n-th group of every group', () => {
    // Inner and Other hold no groups; Outer is the only group of Body.
    expectSame(resolveSelector(fixture, { layer: 'Body', path: ['*', '*', '#0'] }), [])
    expectSame(resolveSelector(fixture, { layer: 'Body', path: ['*', '#2'] }), [other])
  })

  it('a trailing * on the layer name is a prefix match', () => {
    expectSame(resolveSelector(fixture, { layer: 'Spark_*' }), [spark1, spark2])
    expect(resolveSelector(fixture, { layer: 'Spark_' })).toEqual([])
    expect(resolveSelector(fixture, { layer: 'Spar*' })).toHaveLength(2)
  })

  it("layer '*' is every layer", () => {
    expectSame(resolveSelector(fixture, { layer: '*' }), rootLayers)
  })

  it('asset searches that asset layers, not the root ones', () => {
    expectSame(resolveSelector(fixture, { asset: 'comp_x', layer: '*' }), asset.layers)
    expectSame(resolveSelector(fixture, { asset: 'comp_x', layer: 'b' }), [asset.layers[1]])
    expect(resolveSelector(fixture, { layer: 'a' })).toEqual([])
    expect(resolveSelector(fixture, { asset: 'comp_x', layer: 'Body' })).toEqual([])
  })

  it('asset + path reaches groups inside the asset layer', () => {
    expectSame(resolveSelector(fixture, { asset: 'comp_x', layer: 'a', path: ['ga'] }), [asset.layers[0].shapes[0]])
  })

  it('anything missing resolves to []', () => {
    const missing: Selector[] = [
      { layer: 'Nope' },
      { layer: 'Body', path: ['Nope'] },
      { layer: 'Body', path: ['Outer', 'Nope'] },
      { layer: 'Body', path: ['Outer', 'Inner', 'Deeper'] },
      { layer: 'pre', path: ['Outer'] }, // precomp layers have no shapes
      { asset: 'comp_missing', layer: '*' },
      { layer: 'Body', path: ['#x'] },
    ]
    for (const selector of missing) expect(resolveSelector(fixture, selector)).toEqual([])
  })

  it('does not touch the animation', () => {
    const before = structuredClone(fixture)
    resolveSelector(fixture, { layer: 'Body', path: ['Outer', '*'] })
    expect(fixture).toEqual(before)
  })

  it('works on an animation without assets', () => {
    expect(resolveSelector(minimal as Lottie, { asset: 'comp_0', layer: '*' })).toEqual([])
    expect(resolveSelector(minimal as Lottie, { layer: 'rect' })).toHaveLength(1)
  })
})

// --- resolveParts on the synthetic fixture -----------------------------------

const PRECOMP: PartSpec = {
  id: 'precomp',
  name: 'Precomp',
  select: [{ asset: 'comp_x', layer: '*' }],
  key: { select: { asset: 'comp_x', layer: 'b' } }, // nth defaults to 0
}
const BODY: PartSpec = {
  id: 'body',
  name: 'Body',
  select: [{ layer: 'Body' }],
  key: { select: { layer: 'Body', path: ['Outer', 'Other'] }, nth: 1 },
}
const SPARKS: PartSpec = {
  id: 'sparks',
  name: 'Sparks',
  select: [{ layer: 'Spark_*' }],
  key: { select: { layer: 'Spark_1' } },
}
const PROFILE: StickerProfile = { id: 'fixture', match: { nm: 'Fixture' }, parts: [PRECOMP, BODY, SPARKS] }

function profileWith(...parts: PartSpec[]): StickerProfile {
  return { id: 'fixture', match: { nm: 'Fixture' }, parts }
}

describe('resolveParts', () => {
  it('resolves sites, key, neutral and text per part, in profile order', () => {
    const parts = resolveParts(fixture, PROFILE) as Part[]
    expect(parts.map((part) => part.id)).toEqual(['precomp', 'body', 'sparks'])
    expect(parts.map((part) => part.name)).toEqual(['Precomp', 'Body', 'Sparks'])
    expect(parts.map((part) => part.sites)).toEqual([[0, 1], [2, 3, 4, 5], [6, 7]])
    expect(parts.map((part) => part.keySite)).toEqual([1, 5, 6])
    expect(parts.map((part) => part.neutral)).toEqual([false, false, true])
    expect(parts.map((part) => part.text)).toEqual([null, null, null])
  })

  it('the key site of a part is the nth site of the key selector', () => {
    const byNth = (nth: number | undefined): number => {
      const spec: PartSpec = { ...BODY, key: { select: { layer: 'Body', path: ['Outer'] }, nth } }
      return (resolveParts(fixture, profileWith(spec)) as Part[])[0].keySite
    }
    expect(byNth(undefined)).toBe(2)
    expect(byNth(0)).toBe(2)
    expect(byNth(2)).toBe(4)
    expect(byNth(3)).toBe(5)
  })

  it('a part is the union of its selectors, sites ascending and without repeats', () => {
    const spec: PartSpec = {
      id: 'u',
      name: 'U',
      // overlapping selectors: the layer, a group inside it and the same layer again
      select: [{ layer: 'Spark_2' }, { layer: 'Spark_*' }, { layer: 'Spark_1', path: ['s'] }],
      key: { select: { layer: 'Spark_2' } },
    }
    const [part] = resolveParts(fixture, profileWith(spec)) as Part[]
    expect(part.sites).toEqual([6, 7])
    expect(part.keySite).toBe(7)
  })

  it('carries the profile text spec and requires its container to resolve', () => {
    const text = {
      container: { layer: 'Body', path: ['Outer'] },
      original: 'ABC',
      box: { x0: 0, y0: 0, x1: 10, y1: 5 },
      pop: { first: 1, step: 2 },
      maxLength: 6,
      motion: { face: [], shadow: [] },
    }
    const [part] = resolveParts(fixture, profileWith({ ...BODY, text })) as Part[]
    expect(part.text).toEqual(text)
    const broken = { ...text, container: { layer: 'Body', path: ['Nope'] } }
    expect(resolveParts(fixture, profileWith({ ...BODY, text: broken }))).toBeNull()
  })

  it('is null when the name does not match', () => {
    expect(resolveParts({ ...fixture, nm: 'Other' }, PROFILE)).toBeNull()
    expect(resolveParts(fixture, { ...PROFILE, match: { nm: 'Fixture 2' } })).toBeNull()
  })

  it('is null when a layer was renamed', () => {
    const renamed = structuredClone(fixture)
    ;(renamed.layers[2] as Json).nm = 'Torso'
    expect(resolveParts(renamed, PROFILE)).toBeNull()
  })

  it('is null when any single selector of a part matches nothing', () => {
    const lax: PartSpec = { ...SPARKS, select: [{ layer: 'Spark_*' }, { layer: 'Missing' }] }
    expect(resolveParts(fixture, profileWith(lax))).toBeNull()
  })

  it('is null when the key selector matches nothing', () => {
    const lost: PartSpec = { ...SPARKS, key: { select: { layer: 'Missing' } } }
    expect(resolveParts(fixture, profileWith(lost))).toBeNull()
  })

  it('is null when a part has no sites', () => {
    // precomp layers resolve but hold no sites of their own
    const empty: PartSpec = { ...SPARKS, select: [{ layer: 'pre' }] }
    expect(resolveParts(fixture, profileWith(empty))).toBeNull()
    expect(resolveParts(fixture, profileWith({ ...SPARKS, select: [] }))).toBeNull()
  })

  it('is null when two parts share a site', () => {
    const overlap: PartSpec = {
      id: 'inner',
      name: 'Inner',
      select: [{ layer: 'Body', path: ['Outer', 'Inner'] }],
      key: { select: { layer: 'Body', path: ['Outer', 'Inner'] } },
    }
    expect(resolveParts(fixture, profileWith(BODY, overlap))).toBeNull()
    expect(resolveParts(fixture, profileWith(overlap, BODY))).toBeNull()
    expect(resolveParts(fixture, profileWith(BODY, BODY))).toBeNull()
  })

  it('is null when nth is out of range', () => {
    const key = (nth: number): PartSpec => ({ ...SPARKS, key: { select: { layer: 'Spark_1' }, nth } })
    expect(resolveParts(fixture, profileWith(key(0)))).not.toBeNull()
    expect(resolveParts(fixture, profileWith(key(1)))).toBeNull()
    expect(resolveParts(fixture, profileWith(key(-1)))).toBeNull()
    expect(resolveParts(fixture, profileWith(key(0.5)))).toBeNull()
  })

  it('is null when the key site lies outside the part', () => {
    const stray: PartSpec = { ...SPARKS, key: { select: { layer: 'Body' } } }
    expect(resolveParts(fixture, profileWith(stray))).toBeNull()
  })

  it('does not change the animation', () => {
    const before = structuredClone(fixture)
    resolveParts(fixture, PROFILE)
    expect(fixture).toEqual(before)
  })
})

describe('Part as a recolour target', () => {
  it('recolorFamily changes only the sites of the part', () => {
    const parts = resolveParts(fixture, PROFILE) as Part[]
    const before = hexes(fixture)
    for (const part of parts) {
      const after = hexes(recolorFamily(fixture, part, '#00ff00'))
      const inside = new Set(part.sites)
      after.forEach((hex, i) => {
        if (!inside.has(i)) expect(hex).toBe(before[i])
      })
      expect(after[part.keySite]).toBe('#00ff00')
    }
  })

  it('a neutral part is tinted with the target', () => {
    const [, , sparks] = resolveParts(fixture, PROFILE) as Part[]
    const after = hexes(recolorFamily(fixture, sparks, '#ff0000'))
    expect(after[6]).toBe('#ff0000') // the key
    expect(after.slice(0, 6)).toEqual(hexes(fixture).slice(0, 6))
  })
})

// --- Profiles ----------------------------------------------------------------

describe('PROFILES', () => {
  it('lists the Eye, Heart and Cool profiles, in that order', () => {
    expect(PROFILES.map((profile) => profile.id)).toEqual(['eye', 'heart', 'cool'])
    expect(PROFILES.map((profile) => profile.match.nm)).toEqual(['Eye', 'HEART RED', 'COOL_emoji_🆒'])
  })

  it('has unique part ids inside a profile', () => {
    for (const profile of PROFILES) {
      const ids = profile.parts.map((part) => part.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('has a text part only on Cool, with the agreed numbers', () => {
    const withText = PROFILES.flatMap((profile) => profile.parts.map((part) => [profile.id, part] as const)).filter(
      ([, part]) => part.text !== undefined,
    )
    expect(withText.map(([profileId, part]) => `${profileId}/${part.id}`)).toEqual(['cool/text'])
    const { motion, ...numbers } = withText[0][1].text as NonNullable<PartSpec['text']>
    expect(numbers).toEqual({
      container: { layer: 'COOL', path: ['1', 'Group 1', 'Group 1'] },
      original: 'COOL',
      box: { x0: 78.35, y0: 198.78, x1: 433.65, y1: 313.22 },
      pop: { first: 124, step: 6 },
      maxLength: 6,
    })
    // One homography per path keyframe (9), normalised to h[8] = 1; the values
    // are pinned against the sample's letters in text.test.ts.
    for (const matrices of [motion.face, motion.shadow]) {
      expect(matrices).toHaveLength(9)
      for (const h of matrices) {
        expect(h).toHaveLength(9)
        expect(h.every(Number.isFinite)).toBe(true)
        expect(h[8]).toBe(1)
      }
    }
  })

  it('matches no profile on an unknown sticker', () => {
    expect(matchProfile(minimal as Lottie)).toBeNull()
    expect(matchProfile(fixture)).toBeNull()
  })

  it('does not match by name alone when the structure differs', () => {
    for (const profile of PROFILES) {
      expect(matchProfile({ ...(minimal as Lottie), nm: profile.match.nm })).toBeNull()
    }
  })
})

// --- Real samples (untracked: the tests skip when a file is absent) ----------

interface Expected {
  file: string
  profile: string
  // part id, name, key hex
  parts: [string, string, string][]
}

const EXPECTED: Expected[] = [
  {
    file: 'AnimatedSticker.tgs',
    profile: 'eye',
    parts: [
      ['iris', 'Радужка', '#9c620d'],
      ['pupil', 'Зрачок', '#200302'],
      ['sclera', 'Белок', '#fcfcfc'],
      ['lids', 'Веки', '#534f55'],
    ],
  },
  { file: 'HeartSticker.tgs', profile: 'heart', parts: [['heart', 'Сердце', '#fe1512']] },
  {
    file: 'CoolSticker.tgs',
    profile: 'cool',
    parts: [
      ['box', 'Коробка', '#86bfe4'],
      ['text', 'Надпись', '#ffffff'],
      ['fire', 'Огонь', '#fb9600'],
      ['sparks', 'Искры', '#ffc600'],
      ['glints', 'Блики', '#7ff7ff'],
    ],
  },
]

const cache = new Map<string, Promise<Lottie>>()
function load(file: string): Promise<Lottie> {
  let loaded = cache.get(file)
  if (!loaded) {
    loaded = readTgs(new Uint8Array(readFileSync(join(SAMPLES_DIR, file))))
    cache.set(file, loaded)
  }
  return loaded
}

for (const expected of EXPECTED) {
  describe.skipIf(!existsSync(join(SAMPLES_DIR, expected.file)))(`${expected.file}`, () => {
    it(`matches the ${expected.profile} profile, parts in table order`, async () => {
      const anim = await load(expected.file)
      const match = matchProfile(anim)
      expect(match).not.toBeNull()
      expect(match?.profile.id).toBe(expected.profile)
      expect(match?.parts.map((part) => part.id)).toEqual(expected.parts.map(([id]) => id))
      expect(match?.parts.map((part) => part.name)).toEqual(expected.parts.map(([, name]) => name))
    })

    it('has the expected key colour in every part', async () => {
      const anim = await load(expected.file)
      const sites = readColorSites(anim)
      const { parts } = matchProfile(anim) as { parts: Part[] }
      expect(parts.map((part) => sites[part.keySite].hex)).toEqual(expected.parts.map(([, , hex]) => hex))
      for (const part of parts) {
        expect(part.sites).toContain(part.keySite)
        expect(part.neutral).toBe(isNeutral(hexToOklch(sites[part.keySite].hex)))
      }
    })

    it('has disjoint parts of ascending sites', async () => {
      const anim = await load(expected.file)
      const { parts } = matchProfile(anim) as { parts: Part[] }
      const seen = new Set<number>()
      for (const part of parts) {
        expect(part.sites.length).toBeGreaterThan(0)
        expect([...part.sites].sort((a, b) => a - b)).toEqual(part.sites)
        for (const site of part.sites) {
          expect(seen.has(site)).toBe(false)
          seen.add(site)
        }
      }
    })

    it('recolouring a part leaves every site outside it unchanged', async () => {
      const anim = await load(expected.file)
      const { parts } = matchProfile(anim) as { parts: Part[] }
      const before = hexes(anim)
      for (const part of parts) {
        const after = hexes(recolorFamily(anim, part, '#12ab34'))
        expect(after).toHaveLength(before.length)
        const inside = new Set(part.sites)
        for (let i = 0; i < before.length; i++) if (!inside.has(i)) expect(after[i]).toBe(before[i])
        expect(after[part.keySite]).toBe('#12ab34')
      }
    })

    it('does not change the animation', async () => {
      const anim = await load(expected.file)
      const before = structuredClone(anim)
      matchProfile(anim)
      expect(anim).toEqual(before)
    })
  })
}

describe.skipIf(!existsSync(join(SAMPLES_DIR, 'HeartSticker.tgs')))('HeartSticker.tgs parts', () => {
  it('the heart has no neutral colour', async () => {
    const anim = await load('HeartSticker.tgs')
    const sites = readColorSites(anim)
    const { parts } = matchProfile(anim) as { parts: Part[] }
    expect(parts).toHaveLength(1)
    expect(parts[0].neutral).toBe(false)
    for (const index of parts[0].sites) expect(isNeutral(hexToOklch(sites[index].hex))).toBe(false)
  })
})

describe.skipIf(!existsSync(join(SAMPLES_DIR, 'CoolSticker.tgs')))('CoolSticker.tgs parts', () => {
  it('fire contains every site of the comp_0 asset', async () => {
    const anim = await load('CoolSticker.tgs')
    const { parts } = matchProfile(anim) as { parts: Part[] }
    const fire = parts.find((part) => part.id === 'fire') as Part
    const comp = (anim.assets as { id: string }[]).find((item) => item.id === 'comp_0') as object
    const compSites = sitesWithin(anim, new Set([comp]))
    expect(compSites.length).toBeGreaterThan(0)
    for (const index of compSites) expect(fire.sites).toContain(index)
    // ... plus the glow layers and the reflection, so it is strictly larger
    expect(fire.sites.length).toBeGreaterThan(compSites.length)
  })

  it('the text part carries the inscription spec, its container holds one group per letter', async () => {
    const anim = await load('CoolSticker.tgs')
    const { parts } = matchProfile(anim) as { parts: Part[] }
    const text = parts.find((part) => part.id === 'text') as Part
    expect(text.text).not.toBeNull()
    expect(parts.filter((part) => part.text !== null).map((part) => part.id)).toEqual(['text'])
    const [container] = resolveSelector(anim, (text.text as NonNullable<Part['text']>).container) as Json[]
    expect(container).toBeDefined()
    const letters = (container.it as Json[]).filter((item) => item.ty === 'gr')
    expect(letters).toHaveLength((text.text as NonNullable<Part['text']>).original.length)
  })
})
