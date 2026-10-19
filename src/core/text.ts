import { readColorSites, sitesWithin } from './colors'
import { layoutLine, type GlyphContour, type GlyphSet } from './glyphs'
import { applyHomography, fitHomography, type Mat3 } from './homography'
import { resolveSelector, type Selector, type TextSpec } from './parts'
import type { Lottie } from './tgs'

// The editable inscription of a sticker (D18). Its letters are shapes, not a
// text layer (text layers are forbidden in .tgs): a container group holds one
// group per letter in reverse reading order (the first item of `it` draws on
// top), each letter being [face group, shadow group, tr]; the container may
// also hold other groups after the letters (NEW: the button face), which are
// kept as they are. A face or shadow group holds its paths, fill and tr, or
// (NEW) one inner group that does, placed by a static translation. The face
// and shadow paths are animated: at every path keyframe one homography maps all faces at
// keyframe 0 (container coordinates) onto that keyframe (the box turning in
// 3D), and another maps them onto the shadows. Those homographies were
// measured once from the original letters and are stored in the profile
// (`spec.motion`): they are never fitted on the letters the file holds now,
// which after an edit are glyphs of ours (a thin «I» or «!» would make that
// fit drift or fail). New text is laid out flat at keyframe 0 with bundled
// glyph outlines and replays that motion; every letter keeps the template
// letter's fills, path keyframe times and easing, and pop, staggered by
// `spec.pop`.
// Replaced letters are named `txt:<char>`, so the text can be read back.
// Pure TS: no DOM, never mutates its inputs.

type Json = Record<string, unknown>
type Pt = [number, number]

export type TextCheck = { ok: true; text: string } | { ok: false; error: string }

const PREFIX = 'txt:'

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function itemsOf(group: Json): unknown[] {
  return Array.isArray(group.it) ? group.it : []
}

function isOfType(ty: string): (value: unknown) => value is Json {
  return (value): value is Json => isObject(value) && value.ty === ty
}

const isGroup = isOfType('gr')
const isPath = isOfType('sh')
const isTransform = isOfType('tr')

function groupsOf(group: Json): Json[] {
  return itemsOf(group).filter(isGroup)
}

// A letter group: at least two groups inside (face, shadow).
function isLetterGroup(value: unknown): value is Json {
  return isGroup(value) && groupsOf(value).length >= 2
}

// Anything an earlier replacement wrote: letters, and spaces (`txt: `, no paths).
function isInscriptionItem(value: unknown): boolean {
  return isLetterGroup(value) || (isGroup(value) && typeof value.nm === 'string' && value.nm.startsWith(PREFIX))
}

// A copy of `template` (keys in its order, values deep-cloned) with `overrides`
// put in place; override keys the template lacks are appended. Overridden
// values are used as they are, so heavy fields are never cloned for nothing.
function withFields(template: Json, overrides: Json): Json {
  const out: Json = {}
  for (const key of Object.keys(template)) {
    out[key] = Object.hasOwn(overrides, key) ? overrides[key] : structuredClone(template[key])
  }
  for (const key of Object.keys(overrides)) if (!Object.hasOwn(out, key)) out[key] = overrides[key]
  return out
}

function asObject(value: unknown): Json {
  return isObject(value) ? value : {}
}

// One decimal; never -0.
function round(value: number): number {
  const rounded = Math.round(value * 10) / 10
  return rounded === 0 ? 0 : rounded
}

/**
 * Normalises an inscription: composed (NFC, so a pasted decomposed «Й» is one
 * character), upper-cased, trimmed, inner whitespace runs collapsed to one
 * space. It must then be non-empty, at most `spec.maxLength` characters, and
 * every character must be in `set`.
 */
export function validateText(input: string, spec: TextSpec, set: GlyphSet): TextCheck {
  const text = input.normalize('NFC').toUpperCase().trim().replace(/\s+/g, ' ')
  if (text === '') return { ok: false, error: 'Пустая надпись' }
  const chars = [...text]
  if (chars.length > spec.maxLength) return { ok: false, error: `Не больше ${spec.maxLength} символов` }
  const missing = chars.find((char) => !Object.hasOwn(set.glyphs, char))
  if (missing !== undefined) return { ok: false, error: `Нет символа «${missing}» в шрифте` }
  return { ok: true, text }
}

// The one group `spec.container` names, or null.
function findContainer(anim: Lottie, spec: TextSpec): Json | null {
  const found = resolveSelector(anim, spec.container)
  return found.length === 1 && isGroup(found[0]) ? found[0] : null
}

/**
 * The current inscription: when every group of the container is a replaced
 * letter (`txt:<char>`), their characters in reading order (reverse of `it`);
 * otherwise (the sticker's own letters) `spec.original`.
 */
export function readText(anim: Lottie, spec: TextSpec): string {
  const container = findContainer(anim, spec)
  if (!container) return spec.original
  const chars: string[] = []
  for (const group of groupsOf(container).filter(isInscriptionItem)) {
    const name = group.nm
    if (typeof name !== 'string' || !name.startsWith(PREFIX)) return spec.original
    const char = name.slice(PREFIX.length)
    if ([...char].length !== 1) return spec.original
    chars.push(char)
  }
  return chars.length > 0 ? chars.reverse().join('') : spec.original
}

// --- Reading the template letters -----------------------------------------------

// A face or shadow group, the group holding its paths (itself, or its one
// inner group), the keyframes of each path, and the static translation from
// the paths' coordinates to the container's.
interface PartRef { group: Json; source: Json; paths: Json[][]; offset: Pt }

interface LetterRef { group: Json; face: PartRef; shadow: PartRef; tr: Json }

function staticPair(prop: unknown): Pt | null {
  if (!isObject(prop) || prop.a === 1 || !Array.isArray(prop.k)) return null
  const [x, y] = prop.k as unknown[]
  return typeof x === 'number' && typeof y === 'number' ? [x, y] : null
}

// The translation of a static, unscaled, unrotated tr (p − a), or null.
function translationOf(tr: Json): Pt | null {
  const p = staticPair(tr.p)
  const a = staticPair(tr.a)
  const s = staticPair(tr.s)
  const r = asObject(tr.r)
  if (!p || !a || (s && (s[0] !== 100 || s[1] !== 100))) return null
  if (r.k !== undefined && r.k !== 0) return null
  return [p[0] - a[0], p[1] - a[1]]
}

function readPart(group: Json, what: string): PartRef {
  const own = itemsOf(group).find(isTransform)
  if (!own) throw new Error(`replaceText: ${what} has no transform`)
  let source = group
  // Only measureTextMotion reads the offset; replaceText writes paths in container
  // coordinates under a p = a tr, so a non-translation tr here only matters there.
  let offset: Pt = translationOf(own) ?? [0, 0]
  const inner = groupsOf(group)
  if (!itemsOf(group).some(isPath) && inner.length === 1) {
    const tr = itemsOf(inner[0]).find(isTransform)
    const shift = tr ? translationOf(tr) : null
    if (!shift) throw new Error(`replaceText: the inner group of ${what} must be placed by a static translation`)
    source = inner[0]
    offset = add(offset, shift)
  }
  const paths = itemsOf(source)
    .filter(isPath)
    .map((path) => {
      const ks = path.ks
      if (!isObject(ks) || ks.a !== 1 || !Array.isArray(ks.k) || !ks.k.every(isObject)) {
        throw new Error(`replaceText: the paths of ${what} must be animated`)
      }
      return ks.k
    })
  return { group, source, paths, offset }
}

function readLetter(group: Json): LetterRef {
  const what = `letter «${String(group.nm)}»`
  const [face, shadow] = groupsOf(group)
  const tr = itemsOf(group).find(isTransform)
  if (!tr) throw new Error(`replaceText: ${what} has no transform`)
  return { group, face: readPart(face, `the face of ${what}`), shadow: readPart(shadow, `the shadow of ${what}`), tr }
}

// --- Motion ---------------------------------------------------------------------

// The homographies of one path keyframe, for its `s` and (if any) its `e`.
interface KeyMaps { s?: Mat3; e?: Mat3 }

interface Motion {
  keyframes: Json[] // the template's first face path keyframes (times, easing)
  face: KeyMaps[] // face kf 0 -> face kf k
  shadow: KeyMaps[] // face kf 0 -> shadow kf k
}

// `spec.motion` on the template's keyframes: keyframe k's `s` replays matrix
// k, an `e` (old-style end value: the start of keyframe k + 1) matrix k + 1.
// Every path of every letter must have one keyframe per stored matrix.
function storedMotion(letters: LetterRef[], spec: TextSpec): Motion {
  const keyframes = letters[0].face.paths[0]
  if (!keyframes) throw new Error('replaceText: the template letter has no face path')
  const count = keyframes.length
  const { face, shadow } = spec.motion
  if (face.length !== count || shadow.length !== count) {
    throw new Error(
      `replaceText: the letter paths have ${count} keyframes but the stored motion has ` +
        `${face.length} face and ${shadow.length} shadow matrices`,
    )
  }
  for (const letter of letters) {
    if ([...letter.face.paths, ...letter.shadow.paths].some((path) => path.length !== count)) {
      const name = String(letter.group.nm)
      throw new Error(
        `replaceText: the paths of letter «${name}» do not have the ${count} keyframes of the stored motion`,
      )
    }
  }
  const maps = (matrices: Mat3[]): KeyMaps[] =>
    keyframes.map((kf, k) => {
      if (kf.e !== undefined && k + 1 === count) throw new Error('replaceText: the last path keyframe has an end value')
      return { s: kf.s === undefined ? undefined : matrices[k], e: kf.e === undefined ? undefined : matrices[k + 1] }
    })
  return { keyframes, face: maps(face), shadow: maps(shadow) }
}

// --- Building the new letters ---------------------------------------------------

function add(p: Pt, d: Pt): Pt {
  return [p[0] + d[0], p[1] + d[1]]
}

// A contour (container coordinates, kf 0) through `h`, as a closed Lottie
// shape: vertices and absolute handles mapped and rounded to 0.1, handles
// then turned back to offsets. Rounding the absolute positions (not the
// offsets) keeps every control point within 0.05 of its exact place.
function mapContour(contour: GlyphContour, h: Mat3): Json {
  const at = (p: Pt): Pt => {
    const [x, y] = applyHomography(h, p)
    return [round(x), round(y)]
  }
  const v = contour.v.map(at)
  const handles = (offsets: Pt[]): Pt[] =>
    contour.v.map((p, n) => {
      const [x, y] = at(add(p, offsets[n]))
      return [round(x - v[n][0]), round(y - v[n][1])]
    })
  return { c: true, v, i: handles(contour.i), o: handles(contour.o) }
}

// A face or shadow group for `contours`: the template group's fields, one path
// per contour animated through `maps`, the other items of the group holding
// the template's paths (its fill), the template group's tr moved to
// p = a = [0, 0] (paths are written in container coordinates, so a nested
// template comes out flat). Also returns the vertices written at keyframe 0.
function buildPart(
  template: PartRef,
  contours: GlyphContour[],
  motion: Motion,
  maps: KeyMaps[],
): { group: Json; vertices: Pt[] } {
  const items = itemsOf(template.source)
  const templatePath = items.find(isPath) as Json
  const templateTr = itemsOf(template.group).find(isTransform) as Json
  const vertices: Pt[] = []
  const paths = contours.map((contour) => {
    const k = motion.keyframes.map((kf, n) => {
      const overrides: Json = {}
      for (const key of ['s', 'e'] as const) {
        const h = maps[n][key]
        if (!h) continue
        const shape = mapContour(contour, h)
        if (n === 0 && key === 's') vertices.push(...(shape.v as Pt[]))
        overrides[key] = [shape]
      }
      return withFields(kf, overrides)
    })
    return withFields(templatePath, { ks: withFields(asObject(templatePath.ks), { a: 1, k }) })
  })
  const others = items.filter((item) => !isPath(item) && !isTransform(item)).map((item) => structuredClone(item))
  const tr = withFields(templateTr, {
    p: withFields(asObject(templateTr.p), { a: 0, k: [0, 0] }),
    a: withFields(asObject(templateTr.a), { a: 0, k: [0, 0] }),
  })
  return { group: withFields(template.group, { it: [...paths, ...others, tr] }), vertices }
}

// The template letter's tr with p = a = `centre` and its scale keyframes
// shifted to start at `start`.
function letterTransform(template: Json, centre: Pt, start: number): Json {
  const overrides: Json = {
    p: withFields(asObject(template.p), { a: 0, k: [centre[0], centre[1]] }),
    a: withFields(asObject(template.a), { a: 0, k: [centre[0], centre[1]] }),
  }
  const s = template.s
  if (isObject(s) && s.a === 1 && Array.isArray(s.k) && isObject(s.k[0]) && typeof s.k[0].t === 'number') {
    const delta = start - s.k[0].t
    overrides.s = withFields(s, {
      k: s.k.map((kf: unknown) =>
        isObject(kf) && typeof kf.t === 'number' ? withFields(kf, { t: kf.t + delta }) : structuredClone(kf),
      ),
    })
  }
  return withFields(template, overrides)
}

function buildLetter(template: LetterRef, char: string, contours: GlyphContour[], motion: Motion, start: number): Json {
  const face = buildPart(template.face, contours, motion, motion.face)
  const shadow = buildPart(template.shadow, contours, motion, motion.shadow)
  const vertices = [...face.vertices, ...shadow.vertices]
  let centre: Pt = [0, 0]
  if (vertices.length > 0) {
    const xs = vertices.map((p) => p[0])
    const ys = vertices.map((p) => p[1])
    centre = [round((Math.min(...xs) + Math.max(...xs)) / 2), round((Math.min(...ys) + Math.max(...ys)) / 2)]
  }
  const tr = letterTransform(template.tr, centre, start)
  return withFields(template.group, { it: [face.group, shadow.group, tr], nm: PREFIX + char })
}

// A space: no paths, only the template letter's tr at the origin, unscaled.
function spaceGroup(template: LetterRef): Json {
  const tr = template.tr
  return {
    ty: 'gr',
    nm: PREFIX + ' ',
    it: [
      withFields(tr, {
        p: withFields(asObject(tr.p), { a: 0, k: [0, 0] }),
        a: withFields(asObject(tr.a), { a: 0, k: [0, 0] }),
        s: withFields(asObject(tr.s), { a: 0, k: [100, 100] }),
      }),
    ],
  }
}

function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from) }, (_, n) => from + n)
}

/**
 * Replaces the inscription `spec` describes with `text` (validated first: an
 * invalid text throws `Error(error)` with the validateText message). Returns a
 * new animation and `siteOrigin`: for every colour site of the result, the
 * index of the input site it comes from (sites outside the container keep
 * their place, shifted by the size change; a new letter's sites map onto the
 * template letter's), for remapFamilies.
 *
 * The template is the container's first letter group: its fills, path
 * keyframe times and easing, and pop are copied. The motion is `spec.motion`,
 * whatever letters the container holds. Throws when the container does not
 * resolve to exactly one group or has no letter group, when a letter's face
 * or shadow has no transform or paths that are not animated, or when a letter
 * path does not have one keyframe per stored matrix.
 */
export function replaceText(
  anim: Lottie,
  spec: TextSpec,
  text: string,
  set: GlyphSet,
): { anim: Lottie; siteOrigin: number[] } {
  const check = validateText(text, spec, set)
  if (!check.ok) throw new Error(check.error)

  const input = findContainer(anim, spec)
  if (!input) throw new Error('replaceText: the text container must resolve to exactly one group')
  const itemsIn = itemsOf(input)
  const letters = itemsIn.filter(isLetterGroup).map(readLetter)
  if (letters.length === 0) throw new Error('replaceText: the text container has no letters')
  const template = letters[0]
  const motion = storedMotion(letters, spec)

  // New groups in reading order.
  const placed = layoutLine(set, check.text, spec.box)
  let nth = 0
  const built = placed.map((glyph) =>
    glyph.char === ' '
      ? { group: spaceGroup(template), letter: false }
      : {
          group: buildLetter(template, glyph.char, glyph.contours, motion, spec.pop.first + nth++ * spec.pop.step),
          letter: true,
        },
  )
  built.reverse()

  const result = structuredClone(anim)
  const output = findContainer(result, spec) as Json
  const itemsOut = itemsOf(output)
  const kept = range(0, itemsIn.length).filter((n) => !isInscriptionItem(itemsIn[n]))
  output.it = [...built.map((item) => item.group), ...kept.map((n) => itemsOut[n])]

  // Site origins: the container's sites are one contiguous stretch of the walk.
  const total = readColorSites(anim).length
  const inside = sitesWithin(anim, new Set([input]))
  let siteOrigin = range(0, total)
  if (inside.length > 0) {
    const letterSites = [
      ...sitesWithin(anim, new Set([template.face.group])),
      ...sitesWithin(anim, new Set([template.shadow.group])),
    ]
    const within = [
      ...built.flatMap((item) => (item.letter ? letterSites : [])),
      ...kept.flatMap((n) => sitesWithin(anim, new Set([itemsIn[n] as object]))),
    ]
    const first = inside[0]
    siteOrigin = [...range(0, first), ...within, ...range(first + inside.length, total)]
  }
  if (siteOrigin.length !== readColorSites(result).length) {
    throw new Error('replaceText: the new letters hold colours the template does not')
  }
  return { anim: result, siteOrigin }
}

// --- Measuring a sticker's own motion (profile authoring) -------------------------

/**
 * Fits the motion a TextSpec stores from the sticker's own letters: for every
 * path keyframe k, the homography mapping all face vertices and absolute
 * handles at keyframe 0 (container coordinates) onto the faces, and onto the
 * shadows, at keyframe k. Also returns the largest residual (px) and the box
 * of the face vertices at keyframe 0. Throws like replaceText on letters it
 * cannot read, and when the letters' paths differ in keyframe count.
 */
export function measureTextMotion(
  anim: Lottie,
  container: Selector,
): { face: Mat3[]; shadow: Mat3[]; maxError: number; box: { x0: number; y0: number; x1: number; y1: number } } {
  const found = resolveSelector(anim, container)
  if (found.length !== 1 || !isGroup(found[0])) throw new Error('measureTextMotion: the container must resolve to exactly one group')
  const letters = itemsOf(found[0]).filter(isLetterGroup).map(readLetter)
  if (letters.length === 0) throw new Error('measureTextMotion: the container has no letters')
  const count = letters[0].face.paths[0]?.length ?? 0
  const all = letters.flatMap((letter) => [...letter.face.paths, ...letter.shadow.paths])
  if (count === 0 || all.some((path) => path.length !== count)) {
    throw new Error('measureTextMotion: every letter path must have the same number of keyframes')
  }

  // Vertices and absolute handles of `part` at keyframe k, container coordinates.
  const pointsAt = (part: PartRef, k: number): Pt[] =>
    part.paths.flatMap((path) => {
      const value = path[k].s ?? path[k - 1]?.e
      const shape = asObject(Array.isArray(value) ? value[0] : value)
      const v = (shape.v ?? []) as Pt[]
      const i = (shape.i ?? []) as Pt[]
      const o = (shape.o ?? []) as Pt[]
      const at = (p: Pt): Pt => add(p, part.offset)
      return v.flatMap((p, n) => [at(p), at(add(p, i[n] ?? [0, 0])), at(add(p, o[n] ?? [0, 0]))])
    })
  const faces = (k: number): Pt[] => letters.flatMap((letter) => pointsAt(letter.face, k))
  const shadows = (k: number): Pt[] => letters.flatMap((letter) => pointsAt(letter.shadow, k))

  const src = faces(0)
  let maxError = 0
  const fit = (dst: Pt[]): Mat3 => {
    const h = fitHomography(src, dst)
    src.forEach((p, n) => {
      const [x, y] = applyHomography(h, p)
      maxError = Math.max(maxError, Math.hypot(x - dst[n][0], y - dst[n][1]))
    })
    return h
  }
  const face = range(0, count).map((k) => fit(faces(k)))
  const shadow = range(0, count).map((k) => fit(shadows(k)))

  const vertices = letters.flatMap((letter) =>
    letter.face.paths.flatMap((path) => {
      const value = path[0].s
      const shape = asObject(Array.isArray(value) ? value[0] : value)
      return ((shape.v ?? []) as Pt[]).map((p) => add(p, letter.face.offset))
    }),
  )
  const xs = vertices.map((p) => p[0])
  const ys = vertices.map((p) => p[1])
  const box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
  return { face, shadow, maxError, box }
}
