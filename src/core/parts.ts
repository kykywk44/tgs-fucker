import { fingerprint } from './atoms'
import { readColorSites, sitesWithin } from './colors'
import { isNeutral } from './families'
import type { Mat3 } from './homography'
import { hexToOklch } from './oklch'
import { PROFILES } from './profiles'
import type { Lottie } from './tgs'

// Sticker parts. A profile is a hand-written description of one known sticker
// (matched by the root `nm` and/or the structural `fingerprint` of atoms.ts —
// `nm` alone is not unique across stickers): which layers and groups make up each named part
// (iris, pupil, ...), which colour is the part's key, and, for a part holding an
// inscription, where its letters are. Everything is resolved against the file
// at open time; if any piece has gone missing (a renamed layer, a re-exported
// sticker) the whole profile is rejected and the editor falls back to plain
// colour families.

export interface Selector {
  asset?: string // id of an `assets[]` entry: search its layers; absent = root `layers`
  layer: string // layer `nm`; '*' = any layer; 'Ding_*' (trailing *) = name prefix
  ind?: number // and the layer's `ind` is this (layer names repeat; `ind` is unique per comp)
  path?: string[] // groups inside the layer's `shapes`, outermost first: a name (all `gr` with that nm),
  // '*' (every `gr`), '#n' (the n-th `gr` item, 0-based, counting `gr` items only)
}

export interface TextSpec {
  container: Selector // the group whose `gr` items are the letter groups
  original: string // text of the original letters, reading order
  box: { x0: number; y0: number; x1: number; y1: number } // cap box of the original letters at path kf 0, container coords
  pop: { first: number; step: number } // first letter's pop start frame; frames between starts
  maxLength: number
  // One homography per path keyframe k, container coords: face kf 0 -> face kf k, face kf 0 -> shadow kf k.
  // Measured once from the original letters, so new letters always replay the sticker's own motion.
  motion: { face: Mat3[]; shadow: Mat3[] }
}

export interface PartSpec {
  id: string
  name: string
  select: Selector[]
  key: { select: Selector; nth?: number }
  text?: TextSpec
}

export interface StickerProfile {
  id: string
  match: { nm?: string; fingerprint?: string } // every given field must equal the file's; at least one
  parts: PartSpec[]
}

export interface Part {
  id: string
  name: string
  sites: number[] // colour site indices, ascending
  keySite: number
  neutral: boolean // the key colour is a grey
  text: TextSpec | null
}

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function layerNameMatches(pattern: string, name: unknown): boolean {
  if (pattern === '*') return true
  if (typeof name !== 'string') return false
  return pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern
}

const INDEX_STEP = /^#(\d+)$/

// The groups of `items` (a layer's `shapes` or a group's `it`) that `step` picks.
function pickGroups(items: unknown[], step: string): Json[] {
  const groups = items.filter((item): item is Json => isObject(item) && item.ty === 'gr')
  if (step === '*') return groups
  const index = INDEX_STEP.exec(step)
  if (index) {
    const group = groups[Number(index[1])]
    return group ? [group] : []
  }
  return groups.filter((group) => group.nm === step)
}

// The layers (no `path`) or shape groups (with `path`) `selector` points at, as
// the very objects of `anim`; [] when nothing matches. `asset` names an
// `assets[]` entry whose own layers are searched: precomp layers (`refId`) are
// never followed.
export function resolveSelector(anim: Lottie, selector: Selector): object[] {
  let layers: unknown[]
  if (selector.asset === undefined) {
    layers = anim.layers
  } else {
    const asset = (anim.assets ?? []).find((item) => isObject(item) && item.id === selector.asset)
    layers = isObject(asset) && Array.isArray(asset.layers) ? asset.layers : []
  }
  const matched = layers.filter((layer): layer is Json =>
    isObject(layer) && layerNameMatches(selector.layer, layer.nm) && (selector.ind === undefined || layer.ind === selector.ind))
  if (!selector.path || selector.path.length === 0) return matched

  // Item lists still to be searched: the shapes of every matched layer, then
  // the contents of every group picked by the previous step.
  let lists: unknown[][] = matched.flatMap((layer) => (Array.isArray(layer.shapes) ? [layer.shapes] : []))
  let groups: Json[] = []
  for (const step of selector.path) {
    groups = lists.flatMap((items) => pickGroups(items, step))
    lists = groups.flatMap((group) => (Array.isArray(group.it) ? [group.it] : []))
  }
  return groups
}

// Resolves every part of `profile` against `anim`. null when the profile does
// not describe this animation: the root name or the fingerprint differs (or the
// profile names neither), a selector (of a part, its
// key or its text container) matches nothing, a part has no colour sites, `nth`
// is out of range, the key site lies outside its part, or two parts share a site.
export function resolveParts(anim: Lottie, profile: StickerProfile): Part[] | null {
  const { nm, fingerprint: print } = profile.match
  if (nm === undefined && print === undefined) return null
  if (nm !== undefined && anim.nm !== nm) return null
  if (print !== undefined && fingerprint(anim) !== print) return null
  const sites = readColorSites(anim)
  const taken = new Set<number>()
  const parts: Part[] = []

  for (const spec of profile.parts) {
    const nodes = new Set<object>()
    for (const selector of spec.select) {
      const found = resolveSelector(anim, selector)
      if (found.length === 0) return null
      for (const node of found) nodes.add(node)
    }
    const partSites = sitesWithin(anim, nodes)
    if (partSites.length === 0) return null

    const keyNodes = resolveSelector(anim, spec.key.select)
    if (keyNodes.length === 0) return null
    const keyCandidates = sitesWithin(anim, new Set(keyNodes))
    const nth = spec.key.nth ?? 0
    if (!Number.isInteger(nth) || nth < 0 || nth >= keyCandidates.length) return null
    const keySite = keyCandidates[nth]
    if (!partSites.includes(keySite)) return null

    if (spec.text && resolveSelector(anim, spec.text.container).length === 0) return null

    for (const site of partSites) {
      if (taken.has(site)) return null
      taken.add(site)
    }
    parts.push({
      id: spec.id,
      name: spec.name,
      sites: partSites,
      keySite,
      neutral: isNeutral(hexToOklch(sites[keySite].hex)),
      text: spec.text ?? null,
    })
  }
  return parts
}

// The first known profile that fits `anim`, with its resolved parts.
export function matchProfile(anim: Lottie): { profile: StickerProfile; parts: Part[] } | null {
  for (const profile of PROFILES) {
    const parts = resolveParts(anim, profile)
    if (parts) return { profile, parts }
  }
  return null
}
