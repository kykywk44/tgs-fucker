import { mapColorSites, readColorSites, type ColorSite } from './colors'
import { hexToOklch, maxChroma, oklchToHex, type Oklch } from './oklch'
import type { Lottie } from './tgs'

// Colour families: a sticker's colour sites grouped by hue so that a whole
// family (shadows and highlights included) can be recoloured at once.
//
// Families are computed once per opened file and stay fixed until the next
// file (D14). Their identity is the site index (walk-order ordinal from
// readColorSites), never the hex, so a family that was recoloured onto the
// colour of another family does not merge with it.

export interface ColorFamily {
  id: number // position in the list returned by findFamilies
  name: string // Russian, e.g. «Красные», «Белые»; repeats get « 2», « 3»
  neutral: boolean // Белые / Серые / Чёрные
  sites: number[] // site indices, ascending
  keySite: number // site of the family's key colour (its first occurrence)
}

// What viewFamily and recolorFamily take: a colour family, or a sticker part
// (which has the same three fields).
export type FamilyTarget = Pick<ColorFamily, 'sites' | 'keySite' | 'neutral'>

export interface FamilyView {
  key: string // current hex of the key site
  shades: { hex: string; count: number }[] // by OKLCH l ascending, then hex
}

// Colours with chroma under this, or under this share of the largest chroma
// the sRGB gamut allows at their lightness and hue, count as neutral. Relative
// chroma separates greys (<= 0.153 on the samples) from grey-blues (>= 0.346).
const NEUTRAL_ABS_CHROMA = 0.01
const NEUTRAL_REL_CHROMA = 0.25
// Hues closer than this (degrees, circular) belong to one cluster.
const HUE_LINK = 40
// Neutrals are split by lightness.
const WHITE_L = 0.9
const BLACK_L = 0.25

const WHITES = 'Белые'
const GREYS = 'Серые'
const BLACKS = 'Чёрные'

// Lower bound (degrees) of each hue bucket, ascending, and its name.
const HUE_NAMES: ReadonlyArray<readonly [number, string]> = [
  [0, 'Красные'],
  [45, 'Оранжевые'],
  [80, 'Жёлтые'],
  [125, 'Зелёные'],
  [180, 'Голубые'],
  [250, 'Синие'],
  [290, 'Фиолетовые'],
  [325, 'Розовые'],
]

function hueName(h: number): string {
  let name = HUE_NAMES[0][1]
  for (const [from, label] of HUE_NAMES) if (h >= from) name = label
  return name
}

function compareHex(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// Whether `color` counts as a grey (white, grey or black) rather than a hue.
export function isNeutral(color: Oklch): boolean {
  return color.c < NEUTRAL_ABS_CHROMA || color.c < NEUTRAL_REL_CHROMA * maxChroma(color.l, color.h)
}

// One distinct colour of the animation.
interface Tone {
  hex: string
  count: number
  first: number // index of its first site
  lch: Oklch
}

// Disjoint sets over small integers.
function makeUnionFind(size: number): { find(x: number): number; union(a: number, b: number): void } {
  const parent = Array.from({ length: size }, (_, i) => i)
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  return {
    find,
    union(a, b) {
      const ra = find(a)
      const rb = find(b)
      if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb)
    },
  }
}

// Groups chromatic tones into hue clusters. Sorted by (h, hex), the circle is
// cut at its largest gap, then neighbours whose gap is at most HUE_LINK are
// joined. Returns hex -> cluster number.
function clusterByHue(tones: Tone[]): Map<string, number> {
  const sorted = [...tones].sort((a, b) => a.lch.h - b.lch.h || compareHex(a.hex, b.hex))
  const n = sorted.length
  const clusters = new Map<string, number>()
  if (n === 0) return clusters

  // gap[i] is the hue distance from sorted[i] to its successor around the
  // circle; the last one wraps past 360 (a lone colour has a gap of 360).
  const gap = sorted.map((tone, i) =>
    i < n - 1 ? sorted[i + 1].lch.h - tone.lch.h : sorted[0].lch.h + 360 - tone.lch.h,
  )
  let widest = 0
  for (let i = 1; i < n; i++) if (gap[i] > gap[widest]) widest = i

  // Walk from the colour right after the widest gap; gap[(widest + step) % n]
  // separates the colour visited at `step - 1` from the one at `step`.
  let cluster = 0
  for (let step = 0; step < n; step++) {
    if (step > 0 && gap[(widest + step) % n] > HUE_LINK) cluster++
    clusters.set(sorted[(widest + 1 + step) % n].hex, cluster)
  }
  return clusters
}

// The key of a group: most used, then most chromatic, then the smallest hex.
function pickKey(tones: Tone[]): Tone {
  return tones.reduce((best, tone) => {
    if (tone.count !== best.count) return tone.count > best.count ? tone : best
    if (tone.lch.c !== best.lch.c) return tone.lch.c > best.lch.c ? tone : best
    return compareHex(tone.hex, best.hex) < 0 ? tone : best
  })
}

interface Group {
  neutral: boolean
  name: string // fixed for neutrals; for chromatic groups, set from the key hue
  tones: Tone[]
}

export function findFamilies(anim: Lottie): ColorFamily[] {
  const sites = readColorSites(anim)

  // 1. Distinct colours with counts and first index.
  const tones = new Map<string, Tone>()
  for (const site of sites) {
    const tone = tones.get(site.hex)
    if (tone) tone.count++
    else tones.set(site.hex, { hex: site.hex, count: 1, first: site.index, lch: hexToOklch(site.hex) })
  }

  // 2. Neutral or chromatic.
  const chromatic: Tone[] = []
  const neutral: Tone[] = []
  for (const tone of tones.values()) (isNeutral(tone.lch) ? neutral : chromatic).push(tone)

  // 3-4. Hue clusters, merged through the chromatic stops of every gradient.
  const clusterOf = clusterByHue(chromatic)
  const clusterCount = new Set(clusterOf.values()).size
  const sets = makeUnionFind(clusterCount)
  const gradientAnchor = new Map<number, number>() // gradient ordinal -> a cluster in it
  for (const site of sites) {
    const cluster = clusterOf.get(site.hex)
    if (site.gradient === null || cluster === undefined) continue
    const anchor = gradientAnchor.get(site.gradient)
    if (anchor === undefined) gradientAnchor.set(site.gradient, cluster)
    else sets.union(anchor, cluster)
  }

  // 5. Groups: chromatic by merged cluster, neutrals by lightness.
  const groups: Group[] = []
  const groupOfCluster = new Map<number, Group>()
  for (const tone of chromatic) {
    const root = sets.find(clusterOf.get(tone.hex) as number)
    let group = groupOfCluster.get(root)
    if (!group) {
      group = { neutral: false, name: '', tones: [] }
      groupOfCluster.set(root, group)
      groups.push(group)
    }
    group.tones.push(tone)
  }
  const whites: Group = { neutral: true, name: WHITES, tones: [] }
  const greys: Group = { neutral: true, name: GREYS, tones: [] }
  const blacks: Group = { neutral: true, name: BLACKS, tones: [] }
  for (const tone of neutral) {
    const group = tone.lch.l >= WHITE_L ? whites : tone.lch.l <= BLACK_L ? blacks : greys
    group.tones.push(tone)
  }

  // 6-7. Sites, key and name of each group.
  const groupOfHex = new Map<string, Group>()
  for (const group of [...groups, whites, greys, blacks]) {
    for (const tone of group.tones) groupOfHex.set(tone.hex, group)
  }
  const siteIndices = new Map<Group, number[]>()
  for (const site of sites) {
    const group = groupOfHex.get(site.hex) as Group
    const list = siteIndices.get(group)
    if (list) list.push(site.index)
    else siteIndices.set(group, [site.index])
  }

  interface Draft { group: Group; sites: number[]; key: Tone }
  const draft = (group: Group): Draft => ({
    group,
    sites: siteIndices.get(group) as number[],
    key: pickKey(group.tones),
  })
  const chromaticDrafts = groups
    .map(draft)
    .sort((a, b) => b.sites.length - a.sites.length || a.key.lch.h - b.key.lch.h || compareHex(a.key.hex, b.key.hex))
  const neutralDrafts = [whites, greys, blacks].filter((group) => group.tones.length > 0).map(draft)

  // 8. Order, number repeated names, assign ids.
  const used = new Map<string, number>()
  return [...chromaticDrafts, ...neutralDrafts].map((item, id) => {
    const base = item.group.neutral ? item.group.name : hueName(item.key.lch.h)
    const seen = (used.get(base) ?? 0) + 1
    used.set(base, seen)
    return {
      id,
      name: seen === 1 ? base : `${base} ${seen}`,
      neutral: item.group.neutral,
      sites: item.sites,
      keySite: item.key.first,
    }
  })
}

// The key and shades of `family` as they are now. `sites` must come from
// readColorSites of the current animation.
export function viewFamily(sites: ColorSite[], family: FamilyTarget): FamilyView {
  const hexAt = new Map(sites.map((site) => [site.index, site.hex]))
  const counts = new Map<string, number>()
  for (const index of family.sites) {
    const hex = hexAt.get(index)
    if (hex !== undefined) counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }
  const shades = [...counts]
    .map(([hex, count]) => ({ hex, count, l: hexToOklch(hex).l }))
    .sort((a, b) => a.l - b.l || compareHex(a.hex, b.hex))
    .map(({ hex, count }) => ({ hex, count }))
  return { key: hexAt.get(family.keySite) ?? '', shades }
}

// Maps lightness piecewise so that the key's lightness lands on the target's
// and black and white stay where they are.
function mapLightness(l: number, key: number, target: number): number {
  if (l <= key) return key > 0 ? (l * target) / key : target
  return key < 1 ? target + ((l - key) * (1 - target)) / (1 - key) : target
}

// Recolours every site of `family` so that its key becomes `target` and the
// other shades keep their relation to it. Chromatic families rotate hue, scale
// chroma and map lightness; neutral families (and families whose key is now
// grey) are tinted with the target's hue and chroma.
export function recolorFamily(anim: Lottie, family: FamilyTarget, target: string): Lottie {
  const targetHex = target.toLowerCase()
  const sites = readColorSites(anim)
  const keyHex = sites.find((site) => site.index === family.keySite)?.hex
  if (keyHex === undefined) return mapColorSites(anim, () => null)
  const key = hexToOklch(keyHex)
  const goal = hexToOklch(targetHex)
  const tint = family.neutral || key.c < NEUTRAL_ABS_CHROMA

  const mapped = new Map<string, string>()
  const recolor = (hex: string): string => {
    if (hex === keyHex) return targetHex
    const cached = mapped.get(hex)
    if (cached !== undefined) return cached
    const lch = hexToOklch(hex)
    const next = oklchToHex({
      l: mapLightness(lch.l, key.l, goal.l),
      c: tint ? goal.c : (lch.c * goal.c) / key.c,
      h: tint ? goal.h : (((lch.h + goal.h - key.h) % 360) + 360) % 360,
    })
    mapped.set(hex, next)
    return next
  }

  const members = new Set(family.sites)
  return mapColorSites(anim, (site) => (members.has(site.index) ? recolor(site.hex) : null))
}

// Recolours only the sites of `family` whose current hex is `from`.
export function recolorShade(anim: Lottie, family: ColorFamily, from: string, to: string): Lottie {
  const fromHex = from.toLowerCase()
  const members = new Set(family.sites)
  return mapColorSites(anim, (site) => (members.has(site.index) && site.hex === fromHex ? to : null))
}
