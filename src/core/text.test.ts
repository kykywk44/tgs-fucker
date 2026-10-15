/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { telegramChecks } from './checks'
import { readColorSites, sitesWithin } from './colors'
import { findFamilies, remapFamilies } from './families'
import glyphData from './glyphs/roboto-900.json'
import type { GlyphSet } from './glyphs'
import { applyHomography, fitHomography, type Mat3 } from './homography'
import { matchProfile, resolveSelector, type Part, type TextSpec } from './parts'
import { readText, replaceText, validateText } from './text'
import { readTgs, writeTgs, type Lottie } from './tgs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SAMPLES_DIR = resolve(HERE, '..', '..', 'samples')
const SET = glyphData as unknown as GlyphSet

type Pt = [number, number]
type Json = Record<string, any>

// --- Synthetic sticker ---------------------------------------------------------
// Layer `Text` > shapes [Before (green fill), Letters, After (yellow fill)].
// `Letters` (the container) holds [two, one, tr]: two letters in reverse reading
// order, each [face, shadow, tr]. Faces are red, shadows blue; letter `one` uses
// slightly different shades (#dd0000 / #0000dd) so the template (`two`, the
// first letter group) can be told apart. Every path has 3 keyframes. The face
// at keyframe k is H[k] of the face at keyframe 0, the shadow at keyframe k is
// G[k] of the face at keyframe 0, in container coordinates.

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]
const H: Mat3[] = [
  IDENTITY,
  [0.9, 0.05, 20, -0.04, 0.95, 15, 0.0003, -0.0001, 1],
  [1.05, -0.1, 5, 0.08, 0.9, 10, -0.0002, 0.0002, 1],
]
const G: Mat3[] = [
  [1, 0, 0, 0, 1, -3, 0, 0, 1],
  [0.9, 0.05, 20, -0.04, 0.95, 12, 0.0003, -0.0001, 1],
  [1.05, -0.1, 5, 0.08, 0.9, 7, -0.0002, 0.0002, 1],
]
const PATH_KEYFRAMES = [
  { i: { x: 0.2, y: 1 }, o: { x: 0.8, y: 0 }, t: 0 },
  { i: { x: 0.833, y: 0.833 }, o: { x: 0.167, y: 0.167 }, t: 30 },
  { t: 60 },
]

interface Contour { v: Pt[]; i: Pt[]; o: Pt[] }

// Container coordinates at keyframe 0.
const ONE: Contour[] = [
  {
    v: [[110, 205], [190, 205], [195, 295], [105, 295]],
    i: [[-4, 6], [-15, 0], [3, -8], [15, 0]],
    o: [[4, -6], [15, 0], [-3, 8], [-15, 0]],
  },
  { v: [[140, 240], [160, 240], [150, 260]], i: [[0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0]] },
]
const TWO: Contour[] = [
  {
    v: [[250, 205], [390, 210], [385, 300], [320, 270], [245, 298]],
    i: [[0, 0], [0, -20], [10, 0], [0, 0], [-5, -5]],
    o: [[0, 0], [0, 20], [-10, 0], [0, 0], [5, 5]],
  },
]

const SPEC: TextSpec = {
  container: { layer: 'Text', path: ['Letters'] },
  original: 'OK',
  box: { x0: 100, y0: 200, x1: 400, y1: 300 },
  pop: { first: 40, step: 6 },
  maxLength: 6,
}

function rgba(hex: string): number[] {
  return [...[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), 1]
}

function fill(hex: string): Json {
  return { ty: 'fl', c: { a: 0, k: rgba(hex) }, o: { a: 0, k: 100 }, r: 1, bm: 0, nm: 'Fill 1', hd: false }
}

function transform(p: Pt, a: Pt, s: Json = { a: 0, k: [100, 100] }): Json {
  return {
    ty: 'tr',
    p: { a: 0, k: p },
    a: { a: 0, k: a },
    s,
    r: { a: 0, k: 0 },
    o: { a: 0, k: 100 },
    sk: { a: 0, k: 0 },
    sa: { a: 0, k: 0 },
    nm: 'Transform',
  }
}

function pop(start: number): Json {
  return {
    a: 1,
    k: [
      { i: { x: [0.5, 0.5], y: [1, 1] }, o: { x: [0.333, 0.333], y: [0, 0] }, t: start, s: [100, 100] },
      { i: { x: [0.833, 0.833], y: [0.833, 0.833] }, o: { x: [1, 1], y: [0, 0] }, t: start + 12, s: [140, 140] },
      { t: start + 23, s: [100, 100] },
    ],
  }
}

const add = (p: Pt, d: Pt): Pt => [p[0] + d[0], p[1] + d[1]]
const sub = (p: Pt, d: Pt): Pt => [p[0] - d[0], p[1] - d[1]]

// A path whose keyframe k is `maps[k]` of `contour`, written in a group whose
// local coordinates are container coordinates minus `offset`.
function animatedPath(contour: Contour, maps: Mat3[], offset: Pt): Json {
  const shapeAt = (map: Mat3): Json => {
    const v = contour.v.map((p) => applyHomography(map, p))
    return {
      i: contour.v.map((p, n) => sub(applyHomography(map, add(p, contour.i[n])), v[n])),
      o: contour.v.map((p, n) => sub(applyHomography(map, add(p, contour.o[n])), v[n])),
      v: v.map((p) => sub(p, offset)),
      c: true,
    }
  }
  return {
    ind: 0,
    ty: 'sh',
    ks: { a: 1, k: PATH_KEYFRAMES.map((kf, k) => ({ ...kf, s: [shapeAt(maps[k])] })) },
    nm: 'Path 1',
    hd: false,
  }
}

function letter(name: string, contours: Contour[], face: string, shadow: string, at: Pt, a: Pt, popStart: number): Json {
  const faceOffset = sub(at, a)
  const shadowAt: Pt = [at[0], at[1] - 3]
  const shadowOffset = sub(shadowAt, a)
  // Shadow paths are G[k] of the face; the group itself sits 3 px higher.
  return {
    ty: 'gr',
    it: [
      {
        ty: 'gr',
        it: [...contours.map((c) => animatedPath(c, H, faceOffset)), fill(face), transform(at, a)],
        nm: 'face',
        bm: 0,
        hd: false,
      },
      {
        ty: 'gr',
        it: [...contours.map((c) => animatedPath(c, G, shadowOffset)), fill(shadow), transform(shadowAt, a)],
        nm: 'shadow',
        bm: 0,
        hd: false,
      },
      transform(at, at, pop(popStart)),
    ],
    nm: name,
    np: 3,
    cix: 2,
    bm: 0,
    ix: 1,
    mn: 'ADBE Vector Group',
    hd: false,
  }
}

function synthetic(): Lottie {
  return {
    v: '5.5.2',
    fr: 60,
    ip: 0,
    op: 180,
    w: 512,
    h: 512,
    nm: 'Synthetic',
    ddd: 0,
    assets: [],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 4,
        nm: 'Text',
        sr: 1,
        ks: {
          o: { a: 0, k: 100 },
          r: { a: 0, k: 0 },
          p: { a: 0, k: [256, 256, 0] },
          a: { a: 0, k: [256, 256, 0] },
          s: { a: 0, k: [100, 100, 100] },
        },
        ao: 0,
        shapes: [
          { ty: 'gr', it: [fill('#00ff00'), transform([0, 0], [0, 0])], nm: 'Before', bm: 0, hd: false },
          {
            ty: 'gr',
            it: [
              letter('two', TWO, '#ff0000', '#0000ff', [330, 255], [12, 4], 46),
              letter('one', ONE, '#dd0000', '#0000dd', [150, 250], [0, 0], 40),
              transform([256, 256], [256, 256]),
            ],
            nm: 'Letters',
            bm: 0,
            hd: false,
          },
          { ty: 'gr', it: [fill('#ffff00'), transform([0, 0], [0, 0])], nm: 'After', bm: 0, hd: false },
        ],
        ip: 0,
        op: 180,
        st: 0,
        bm: 0,
      },
    ],
  }
}

// Every vertex and absolute handle of the original faces at keyframe 0.
const ORIGINAL_POINTS: Pt[] = [...ONE, ...TWO].flatMap((c) =>
  c.v.flatMap((p, n): Pt[] => [p, add(p, c.i[n]), add(p, c.o[n])]),
)

// --- Reading the result back -------------------------------------------------

function container(anim: Lottie, spec: TextSpec): Json {
  const found = resolveSelector(anim, spec.container) as Json[]
  expect(found).toHaveLength(1)
  return found[0]
}

const groupsOf = (group: Json): Json[] => (group.it as Json[]).filter((item) => item.ty === 'gr')

function letterGroups(anim: Lottie, spec: TextSpec): Json[] {
  return groupsOf(container(anim, spec)).filter((group) => groupsOf(group).length >= 2)
}

// Points (v, v + i, v + o) of every path of a face or shadow group at path
// keyframe k, in container coordinates (local + tr.p − tr.a).
function groupPoints(group: Json, k: number): Pt[] {
  const tr = (group.it as Json[]).find((item) => item.ty === 'tr') as Json
  const offset: Pt = [tr.p.k[0] - tr.a.k[0], tr.p.k[1] - tr.a.k[1]]
  return (group.it as Json[])
    .filter((item) => item.ty === 'sh')
    .flatMap((sh) => {
      const shape = sh.ks.k[k].s[0]
      return (shape.v as Pt[]).flatMap((v, n): Pt[] => [
        add(v, offset),
        add(add(v, shape.i[n]), offset),
        add(add(v, shape.o[n]), offset),
      ])
    })
}

interface Motion { face: Mat3[]; shadow: Mat3[]; error: number }

// Fits face kf 0 -> face kf k and face kf 0 -> shadow kf k on every letter;
// `error` is the largest reprojection error of all those fits on their own points.
function fitMotion(anim: Lottie, spec: TextSpec): Motion {
  const letters = letterGroups(anim, spec)
  const count = ((groupsOf(letters[0])[0].it as Json[]).find((item) => item.ty === 'sh') as Json).ks.k.length
  const src = letters.flatMap((group) => groupPoints(groupsOf(group)[0], 0))
  let error = 0
  const fit = (which: number): Mat3[] =>
    Array.from({ length: count }, (_, k) => {
      const dst = letters.flatMap((group) => groupPoints(groupsOf(group)[which], k))
      const h = fitHomography(src, dst)
      src.forEach((p, n) => {
        const [x, y] = applyHomography(h, p)
        error = Math.max(error, Math.hypot(x - dst[n][0], y - dst[n][1]))
      })
      return h
    })
  return { face: fit(0), shadow: fit(1), error }
}

function distance(a: Mat3, b: Mat3, points: Pt[]): number {
  return Math.max(
    ...points.map((p) => {
      const [x, y] = applyHomography(a, p)
      const [ex, ey] = applyHomography(b, p)
      return Math.hypot(x - ex, y - ey)
    }),
  )
}

// Deep equality where numbers may differ by `tol`.
function expectClose(actual: unknown, expected: unknown, tol: number, path = ''): void {
  if (typeof expected === 'number') {
    expect(typeof actual, path).toBe('number')
    expect(Math.abs((actual as number) - expected), path).toBeLessThanOrEqual(tol)
    return
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true)
    expect((actual as unknown[]).length, path).toBe(expected.length)
    expected.forEach((item, n) => expectClose((actual as unknown[])[n], item, tol, `${path}[${n}]`))
    return
  }
  if (typeof expected === 'object' && expected !== null) {
    expect(Object.keys(actual as object), path).toEqual(Object.keys(expected))
    for (const key of Object.keys(expected)) {
      expectClose((actual as Json)[key], (expected as Json)[key], tol, `${path}.${key}`)
    }
    return
  }
  expect(actual, path).toBe(expected)
}

function hexes(anim: Lottie): string[] {
  return readColorSites(anim).map((site) => site.hex)
}

// The `s` keyframe times of a letter group's own transform.
function popTimes(group: Json): number[] {
  const tr = (group.it as Json[]).find((item) => item.ty === 'tr') as Json
  return (tr.s.k as Json[]).map((kf) => kf.t)
}

// --- validateText ---------------------------------------------------------------

describe('validateText', () => {
  const spec = SPEC

  it('upper-cases', () => {
    expect(validateText('привет', spec, SET)).toEqual({ ok: true, text: 'ПРИВЕТ' })
    expect(validateText('ёлка', spec, SET)).toEqual({ ok: true, text: 'ЁЛКА' })
    expect(validateText('Cool!', spec, SET)).toEqual({ ok: true, text: 'COOL!' })
  })

  it('trims and collapses inner whitespace runs to one space', () => {
    expect(validateText('  a   b ', spec, SET)).toEqual({ ok: true, text: 'A B' })
    expect(validateText('a\t\nb', spec, SET)).toEqual({ ok: true, text: 'A B' })
  })

  it('rejects an empty inscription', () => {
    expect(validateText('', spec, SET)).toEqual({ ok: false, error: 'Пустая надпись' })
    expect(validateText('   ', spec, SET)).toEqual({ ok: false, error: 'Пустая надпись' })
  })

  it('rejects more than maxLength characters, counted after normalisation', () => {
    expect(validateText('ABCDEFG', spec, SET)).toEqual({ ok: false, error: 'Не больше 6 символов' })
    expect(validateText('ABC', { ...spec, maxLength: 2 }, SET)).toEqual({ ok: false, error: 'Не больше 2 символов' })
    expect(validateText('  AB    CDE  ', spec, SET)).toEqual({ ok: true, text: 'AB CDE' })
  })

  it('rejects a character missing from the font, naming it', () => {
    expect(validateText('中', spec, SET)).toEqual({ ok: false, error: 'Нет символа «中» в шрифте' })
    expect(validateText('AB€', spec, SET)).toEqual({ ok: false, error: 'Нет символа «€» в шрифте' })
  })
})

// --- readText -------------------------------------------------------------------

describe('readText', () => {
  it('falls back to spec.original when the letters are not ours', () => {
    expect(readText(synthetic(), SPEC)).toBe('OK')
  })

  it('reads txt:<char> groups in reading order (reverse of it)', () => {
    const anim = synthetic()
    const letters = groupsOf(container(anim, SPEC))
    letters[0].nm = 'txt:B'
    expect(readText(anim, SPEC)).toBe('OK') // one group is still not ours
    letters[1].nm = 'txt:A'
    expect(readText(anim, SPEC)).toBe('AB')
  })
})

// --- replaceText on the synthetic sticker --------------------------------------

describe('replaceText', () => {
  it('builds txt:<char> groups in reverse reading order, then the container transform', () => {
    const { anim } = replaceText(synthetic(), SPEC, 'AB', SET)
    const items = container(anim, SPEC).it as Json[]
    expect(items.map((item) => [item.ty, item.nm])).toEqual([
      ['gr', 'txt:B'],
      ['gr', 'txt:A'],
      ['tr', 'Transform'],
    ])
    expect(items[2]).toEqual(transform([256, 256], [256, 256]))
    expect(readText(anim, SPEC)).toBe('AB')
  })

  it('copies the template letter group fields and builds [face, shadow, tr]', () => {
    const { anim } = replaceText(synthetic(), SPEC, 'AB', SET)
    for (const group of groupsOf(container(anim, SPEC))) {
      const { it: items, nm, ...fields } = group
      expect(fields).toEqual({ ty: 'gr', np: 3, cix: 2, bm: 0, ix: 1, mn: 'ADBE Vector Group', hd: false })
      expect(Object.keys(group)).toEqual(['ty', 'it', 'nm', 'np', 'cix', 'bm', 'ix', 'mn', 'hd'])
      expect((items as Json[]).map((item) => [item.ty, item.nm])).toEqual([
        ['gr', 'face'],
        ['gr', 'shadow'],
        ['tr', 'Transform'],
      ])
    }
  })

  it('one path per contour, then the template fill, then its tr at p = a = [0, 0]', () => {
    const { anim } = replaceText(synthetic(), SPEC, 'AB', SET)
    const [b, a] = letterGroups(anim, SPEC)
    for (const [group, char] of [[a, 'A'], [b, 'B']] as const) {
      const contours = SET.glyphs[char].contours.length
      const [face, shadow] = groupsOf(group)
      for (const [part, hex] of [[face, '#ff0000'], [shadow, '#0000ff']] as const) {
        const items = part.it as Json[]
        expect(items.map((item) => item.ty)).toEqual([...Array(contours).fill('sh'), 'fl', 'tr'])
        expect(items[contours]).toEqual(fill(hex))
        expect(items[contours + 1]).toEqual(transform([0, 0], [0, 0]))
        for (const sh of items.slice(0, contours)) {
          expect(sh.ks.a).toBe(1)
          sh.ks.k.forEach((kf: Json, k: number) => {
            const shape = kf.s[0]
            expect(Object.keys(shape).sort()).toEqual(['c', 'i', 'o', 'v'])
            expect(shape.c).toBe(true)
            expect(shape.i).toHaveLength(shape.v.length)
            expect(shape.o).toHaveLength(shape.v.length)
            expect(kf.s).toHaveLength(1)
            expect(k).toBeLessThan(3)
          })
        }
      }
    }
  })

  it('path keyframe times and easing equal the template', () => {
    const { anim } = replaceText(synthetic(), SPEC, 'AB', SET)
    for (const group of letterGroups(anim, SPEC)) {
      for (const part of groupsOf(group)) {
        for (const sh of (part.it as Json[]).filter((item) => item.ty === 'sh')) {
          expect((sh.ks.k as Json[]).map(({ s, ...rest }) => rest)).toEqual(PATH_KEYFRAMES)
        }
      }
    }
  })

  it('replays the motion: fitting on the result recovers every H_k and G_k (< 0.1 px)', () => {
    const { anim } = replaceText(synthetic(), SPEC, 'AB', SET)
    const motion = fitMotion(anim, SPEC)
    expect(motion.face).toHaveLength(3)
    for (let k = 0; k < 3; k++) {
      expect(distance(motion.face[k], H[k], ORIGINAL_POINTS)).toBeLessThan(0.1)
      expect(distance(motion.shadow[k], G[k], ORIGINAL_POINTS)).toBeLessThan(0.1)
    }
  })

  it('lays the letters out in the box at keyframe 0 (the face keyframe 0 is the layout, rounded)', () => {
    const { anim } = replaceText(synthetic(), SPEC, 'AB', SET)
    const [b, a] = letterGroups(anim, SPEC)
    const xs = [a, b].map((group) => groupPoints(groupsOf(group)[0], 0).map((p) => p[0]))
    expect(Math.min(...xs[0])).toBeLessThan(Math.min(...xs[1])) // A left of B
    for (const group of [a, b]) {
      for (const [x, y] of groupPoints(groupsOf(group)[0], 0)) {
        expect(x).toBeGreaterThanOrEqual(SPEC.box.x0 - 1)
        expect(x).toBeLessThanOrEqual(SPEC.box.x1 + 1)
        expect(y).toBeGreaterThanOrEqual(SPEC.box.y0 - 1)
        expect(y).toBeLessThanOrEqual(SPEC.box.y1 + 1)
      }
    }
  })

  it('rounds path coordinates to 0.1 and never writes -0', () => {
    const { anim } = replaceText(synthetic(), SPEC, 'AB', SET)
    for (const group of letterGroups(anim, SPEC)) {
      for (const part of groupsOf(group)) {
        for (const sh of (part.it as Json[]).filter((item) => item.ty === 'sh')) {
          for (const kf of sh.ks.k as Json[]) {
            for (const key of ['v', 'i', 'o']) {
              for (const value of (kf.s[0][key] as Pt[]).flat()) {
                expect(Math.abs(value * 10 - Math.round(value * 10))).toBeLessThan(1e-6)
                expect(Object.is(value, -0)).toBe(false)
              }
            }
          }
        }
      }
    }
  })

  it('letter tr: a clone of the template tr, p = a = centre of face ∪ shadow at kf 0, pops from first by step', () => {
    const input = synthetic()
    const templateTr = (groupsOf(container(input, SPEC))[0].it as Json[])[2]
    const { anim } = replaceText(input, SPEC, 'AB', SET)
    const [b, a] = letterGroups(anim, SPEC)
    for (const group of [a, b]) {
      const tr = (group.it as Json[])[2]
      const vertices = groupsOf(group).flatMap((part) =>
        (part.it as Json[]).filter((item) => item.ty === 'sh').flatMap((sh) => sh.ks.k[0].s[0].v as Pt[]),
      )
      const xs = vertices.map((p) => p[0])
      const ys = vertices.map((p) => p[1])
      const centre = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
      expect(tr.p.a).toBe(0)
      expect(tr.p.k).toEqual(tr.a.k)
      expectClose(tr.p.k, centre, 0.051)
      const { p, a: anchor, s, ...rest } = tr
      const { p: _p, a: _a, s: templateS, ...templateRest } = templateTr
      expect(rest).toEqual(templateRest)
      expect((s.k as Json[]).map(({ t, ...kf }) => kf)).toEqual((templateS.k as Json[]).map(({ t, ...kf }) => kf))
    }
    expect(popTimes(a)).toEqual([40, 52, 63])
    expect(popTimes(b)).toEqual([46, 58, 69])
  })

  it('does not mutate its input', () => {
    const input = synthetic()
    const before = structuredClone(input)
    replaceText(input, SPEC, 'XYZ', SET)
    expect(input).toEqual(before)
  })

  it('siteOrigin: outside fills map to themselves, new letters onto the template sites', () => {
    const input = synthetic()
    const oldHexes = hexes(input)
    expect(oldHexes).toEqual(['#00ff00', '#ff0000', '#0000ff', '#dd0000', '#0000dd', '#ffff00'])
    for (const text of ['AB', 'XYZ', 'A', 'ЖЖЖЖЖЖ']) {
      const { anim, siteOrigin } = replaceText(input, SPEC, text, SET)
      const newHexes = hexes(anim)
      const letters = text.length
      expect(siteOrigin).toEqual([0, ...Array.from({ length: letters }, () => [1, 2]).flat(), 5])
      expect(newHexes).toHaveLength(siteOrigin.length)
      newHexes.forEach((hex, i) => expect(hex).toBe(oldHexes[siteOrigin[i]]))
    }
  })

  it('remapFamilies over siteOrigin covers every new site exactly once and keeps ids and names', () => {
    const input = synthetic()
    const families = findFamilies(input)
    const { anim, siteOrigin } = replaceText(input, SPEC, 'XYZ', SET)
    const remapped = remapFamilies(families, siteOrigin)
    const covered = remapped.flatMap((family) => family.sites).sort((a, b) => a - b)
    expect(covered).toEqual(readColorSites(anim).map((site) => site.index))
    // Every family still has a site here (the template's colours are the same hues).
    expect(remapped.map(({ id, name, neutral }) => [id, name, neutral])).toEqual(
      families.map(({ id, name, neutral }) => [id, name, neutral]),
    )
    for (const family of remapped) expect(family.sites).toContain(family.keySite)
  })

  it('replacing twice equals replacing once (coordinates ±0.15)', () => {
    const once = replaceText(synthetic(), SPEC, 'XYZ', SET)
    const first = replaceText(synthetic(), SPEC, 'AB', SET)
    const twice = replaceText(first.anim, SPEC, 'XYZ', SET)
    expectClose(twice.anim, once.anim, 0.15)
    expect(readText(twice.anim, SPEC)).toBe('XYZ')
    // ... and the site map composes: twice's origins point at first's sites of the same colour
    expect(twice.siteOrigin.map((i) => first.siteOrigin[i])).toEqual(once.siteOrigin)
  })

  it("'A B': the middle group is a path-less txt: space, pops counted over letters only", () => {
    const input = synthetic()
    const templateTr = (groupsOf(container(input, SPEC))[0].it as Json[])[2]
    const { anim, siteOrigin } = replaceText(input, SPEC, 'a  b', SET)
    const groups = groupsOf(container(anim, SPEC))
    expect(groups.map((group) => group.nm)).toEqual(['txt:B', 'txt: ', 'txt:A'])
    const space = groups[1]
    expect(Object.keys(space)).toEqual(['ty', 'nm', 'it'])
    expect(space.it).toHaveLength(1)
    expect(space.it[0]).toEqual({
      ...templateTr,
      p: { a: 0, k: [0, 0] },
      a: { a: 0, k: [0, 0] },
      s: { a: 0, k: [100, 100] },
    })
    expect(readText(anim, SPEC)).toBe('A B')
    expect(popTimes(groups[2])).toEqual([40, 52, 63])
    expect(popTimes(groups[0])).toEqual([46, 58, 69])
    expect(siteOrigin).toEqual([0, 1, 2, 1, 2, 5])
    // a space survives a second replacement only if asked for
    const again = replaceText(anim, SPEC, 'AB', SET)
    expect(groupsOf(container(again.anim, SPEC)).map((group) => group.nm)).toEqual(['txt:B', 'txt:A'])
    expect(again.siteOrigin).toEqual([0, 1, 2, 1, 2, 5])
  })

  it('validates first and throws the validation message', () => {
    expect(() => replaceText(synthetic(), SPEC, '   ', SET)).toThrow(new Error('Пустая надпись'))
    expect(() => replaceText(synthetic(), SPEC, 'ABCDEFG', SET)).toThrow(new Error('Не больше 6 символов'))
    expect(() => replaceText(synthetic(), SPEC, 'A中', SET)).toThrow(new Error('Нет символа «中» в шрифте'))
  })

  it('throws unless the container resolves to exactly one group', () => {
    expect(() => replaceText(synthetic(), { ...SPEC, container: { layer: 'Text', path: ['Nope'] } }, 'AB', SET)).toThrow()
    expect(() => replaceText(synthetic(), { ...SPEC, container: { layer: 'Text', path: ['*'] } }, 'AB', SET)).toThrow()
    expect(() => replaceText(synthetic(), { ...SPEC, container: { layer: 'Text' } }, 'AB', SET)).toThrow()
  })

  it('throws when a face and its shadow have different vertex counts', () => {
    const anim = synthetic()
    const shadow = groupsOf(groupsOf(container(anim, SPEC))[1])[1]
    for (const kf of (shadow.it as Json[])[0].ks.k as Json[]) {
      const shape = kf.s[0]
      for (const key of ['v', 'i', 'o']) shape[key] = shape[key].slice(1)
    }
    expect(() => replaceText(anim, SPEC, 'AB', SET)).toThrow()
  })
})

// --- The Cool sample (untracked: skipped when absent) ------------------------------

const COOL_FILE = join(SAMPLES_DIR, 'CoolSticker.tgs')

describe.skipIf(!existsSync(COOL_FILE))('CoolSticker.tgs inscription', () => {
  let loaded: Promise<Lottie> | null = null
  const load = (): Promise<Lottie> => (loaded ??= readTgs(new Uint8Array(readFileSync(COOL_FILE))))

  async function coolSpec(anim: Lottie): Promise<TextSpec> {
    const match = matchProfile(anim)
    expect(match?.profile.id).toBe('cool')
    const text = (match?.parts ?? []).find((part) => part.id === 'text') as Part
    return text.text as TextSpec
  }

  it("reads 'COOL', and one homography per keyframe fits the original letters (< 0.2 px)", async () => {
    const anim = await load()
    const spec = await coolSpec(anim)
    expect(readText(anim, spec)).toBe('COOL')
    const motion = fitMotion(anim, spec)
    expect(motion.face).toHaveLength(9)
    expect(motion.error).toBeLessThan(0.2)
    console.log(`Cool original letters: max homography fit error ${motion.error.toFixed(4)} px`)
  })

  it("after 'ПРИВЕТ' the profile still matches, the parts follow the new letters", async () => {
    const input = await load()
    const spec = await coolSpec(input)
    const { anim, siteOrigin } = replaceText(input, spec, 'привет', SET)
    expect(readText(anim, spec)).toBe('ПРИВЕТ')
    const match = matchProfile(anim)
    expect(match?.profile.id).toBe('cool')
    const parts = match?.parts as Part[]
    const sites = readColorSites(anim)
    const text = parts.find((part) => part.id === 'text') as Part
    const box = parts.find((part) => part.id === 'box') as Part
    expect(sites[text.keySite].hex).toBe('#ffffff')

    const letters = letterGroups(anim, spec)
    expect(letters).toHaveLength(6)
    for (const group of letters) {
      const [face, shadow] = groupsOf(group)
      const shadowSites = sitesWithin(anim, new Set([shadow]))
      expect(shadowSites.length).toBeGreaterThan(0)
      for (const index of shadowSites) {
        expect(box.sites).toContain(index)
        expect(sites[index].hex).toBe('#5f7b93')
      }
      for (const index of sitesWithin(anim, new Set([face]))) {
        expect(text.sites).toContain(index)
        expect(sites[index].hex).toBe('#ffffff')
      }
    }

    // the new letters still turn with the box
    expect(fitMotion(anim, spec).error).toBeLessThan(0.2)

    // families carry over
    const remapped = remapFamilies(findFamilies(input), siteOrigin)
    expect(remapped.flatMap((family) => family.sites).sort((a, b) => a - b)).toEqual(sites.map((site) => site.index))
    const oldSites = readColorSites(input)
    sites.forEach((site, i) => expect(site.hex).toBe(oldSites[siteOrigin[i]].hex))
  })

  it('the last pop ends by op − 1 and the Telegram checks pass', async () => {
    const input = await load()
    const spec = await coolSpec(input)
    const { anim } = replaceText(input, spec, 'ПРИВЕТ', SET)
    const letters = letterGroups(anim, spec)
    const starts = letters.map((group) => popTimes(group)[0]).reverse()
    expect(starts).toEqual([124, 130, 136, 142, 148, 154])
    const lastEnd = Math.max(...letters.map((group) => Math.max(...popTimes(group))))
    expect(lastEnd).toBeLessThanOrEqual(anim.op - 1)
    const bytes = await writeTgs(anim)
    for (const check of telegramChecks(anim, bytes.length)) expect(check.ok, check.id).toBe(true)
  })

  it('stays within the 64 KB budget for the heaviest texts', async () => {
    const input = await load()
    const spec = await coolSpec(input)
    const original = (await writeTgs(input)).length
    const sizes: Record<string, number> = {}
    for (const text of ['COOL', 'ЖЖЖЖЖЖ', 'ШЩЖФЫЮ', 'WWWWWW']) {
      sizes[text] = (await writeTgs(replaceText(input, spec, text, SET).anim)).length
    }
    console.log(`Cool .tgs bytes: original ${original}, ${Object.entries(sizes).map(([t, n]) => `${t} ${n}`).join(', ')}`)
    for (const [text, size] of Object.entries(sizes)) expect(size, text).toBeLessThanOrEqual(65536)
  })
})
