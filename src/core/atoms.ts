import { readColorSites, siteNodes } from './colors'
import type { Lottie } from './tgs'

// Atoms: the smallest pieces a person can pick in any sticker, no profile
// needed. An atom is a shape list (a layer's `shapes` or a group's `it`) that
// directly holds at least one paint (fl / st / gf / gs). Measured on the samples
// (scripts/measure-corpus.mjs): every hand-written profile part is a whole set
// of atoms, never part of one. Atoms are many (median 68 per sticker), so
// selection grows by levels (enclosing group → layer → parent chain → precomp)
// and by "similar" atoms.

export interface AtomLocation {
  asset?: string // id of the `assets[]` entry whose layers hold it; absent = root `layers`
  layer: number // index in that layers array
  groups: number[] // `gr` indices (counting `gr` items only) from the layer's `shapes` inward
}

export interface Atom {
  id: number // index in findAtoms' result: assets first, then root layers, pre-order
  at: AtomLocation
  layerName: string | null
  sites: number[] // colour sites of its own paints (readColorSites indices, ascending)
  instances: number // times it is drawn: 1 on root layers; for an asset, the precomp layers showing it
}

type Json = Record<string, unknown>

const PAINTS = new Set(['fl', 'st', 'gf', 'gs'])
const SHAPES = new Set(['sh', 'rc', 'el', 'sr'])

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// An atom's objects inside the animation it was located in.
export interface LocatedAtom {
  at: AtomLocation
  layer: Record<string, unknown>
  items: unknown[] // the shape list itself
  paints: Record<string, unknown>[] // its direct fl / st / gf / gs items
}

// Each layers array of `anim` with its asset id (undefined = root), assets first.
function comps(anim: Lottie): { asset?: string; layers: unknown[] }[] {
  const list: { asset?: string; layers: unknown[] }[] = []
  for (const asset of anim.assets ?? []) {
    if (isObject(asset) && typeof asset.id === 'string' && Array.isArray(asset.layers)) {
      list.push({ asset: asset.id, layers: asset.layers })
    }
  }
  list.push({ layers: anim.layers })
  return list
}

// Every atom with its objects in `anim` (the very objects, not copies), in
// findAtoms order: index = atom id. Used to edit atoms in a copy of `anim`.
export function locateAtoms(anim: Lottie): LocatedAtom[] {
  const found: LocatedAtom[] = []
  const visit = (items: unknown[], layer: Json, at: AtomLocation): void => {
    const paints = items.filter((item): item is Json => isObject(item) && typeof item.ty === 'string' && PAINTS.has(item.ty))
    if (paints.length > 0) found.push({ at, layer, items, paints })
    let n = 0
    for (const item of items) {
      if (!isObject(item) || item.ty !== 'gr') continue
      if (Array.isArray(item.it)) visit(item.it, layer, { ...at, groups: [...at.groups, n] })
      n++
    }
  }
  for (const { asset, layers } of comps(anim)) {
    layers.forEach((layer, index) => {
      if (isObject(layer) && Array.isArray(layer.shapes)) {
        visit(layer.shapes, layer, { ...(asset === undefined ? {} : { asset }), layer: index, groups: [] })
      }
    })
  }
  return found
}

// How many times each asset is drawn: the sum, over the precomp layers that
// reference it, of how many times their own comp is drawn (root = 1). An asset
// on a reference cycle counts as drawn once.
function assetInstances(anim: Lottie): Map<string, number> {
  const refs = new Map<string, { from?: string }[]>()
  for (const { asset, layers } of comps(anim)) {
    for (const layer of layers) {
      if (isObject(layer) && layer.ty === 0 && typeof layer.refId === 'string') {
        refs.set(layer.refId, [...(refs.get(layer.refId) ?? []), { from: asset }])
      }
    }
  }
  const memo = new Map<string, number>()
  const count = (id: string, seen: Set<string>): number => {
    const known = memo.get(id)
    if (known !== undefined) return known
    if (seen.has(id)) return 1
    seen.add(id)
    let total = 0
    for (const ref of refs.get(id) ?? []) total += ref.from === undefined ? 1 : count(ref.from, seen)
    seen.delete(id)
    memo.set(id, total)
    return total
  }
  const result = new Map<string, number>()
  for (const { asset } of comps(anim)) if (asset !== undefined) result.set(asset, count(asset, new Set()))
  return result
}

// Every atom of `anim`. Pure: nothing is cloned or changed.
export function findAtoms(anim: Lottie): Atom[] {
  const located = locateAtoms(anim)
  const owner = new Map<object, number>()
  located.forEach((atom, id) => { for (const paint of atom.paints) owner.set(paint, id) })
  const sites: number[][] = located.map(() => [])
  siteNodes(anim).forEach((node, index) => {
    const id = owner.get(node)
    if (id !== undefined) sites[id].push(index)
  })
  const instances = assetInstances(anim)
  return located.map(({ at, layer }, id) => ({
    id,
    at,
    layerName: typeof layer.nm === 'string' ? layer.nm : null,
    sites: sites[id],
    instances: at.asset === undefined ? 1 : (instances.get(at.asset) ?? 0),
  }))
}

// ---------- selection levels ----------

const sameComp = (a: AtomLocation, b: AtomLocation): boolean => a.asset === b.asset
const sameLayer = (a: AtomLocation, b: AtomLocation): boolean => sameComp(a, b) && a.layer === b.layer
const startsWith = (groups: number[], prefix: number[]): boolean => prefix.every((g, i) => groups[i] === g)

// The layer indices (in `asset`'s layers) of `layer`'s parent chain, nearest
// first, following `parent` → `ind` inside the same comp; stops on a cycle.
function ancestors(anim: Lottie, asset: string | undefined, layer: number): number[] {
  const layers = comps(anim).find((comp) => comp.asset === asset)?.layers ?? []
  const byInd = new Map<unknown, number>()
  layers.forEach((item, index) => { if (isObject(item) && item.ind !== undefined) byInd.set(item.ind, index) })
  const chain: number[] = []
  let current = layers[layer]
  while (isObject(current) && current.parent !== undefined) {
    const index = byInd.get(current.parent)
    if (index === undefined || chain.includes(index) || index === layer) break
    chain.push(index)
    current = layers[index]
  }
  return chain
}

// Successive selections for repeated clicks on atom `id`, each strictly larger
// than the one before: the atom; each enclosing group, innermost first; its
// layer; the layers sharing each ancestor of its parent chain (a null or a
// parent layer, nearest first); for an asset atom, the whole asset. Ids ascend.
export function expandLevels(anim: Lottie, atoms: readonly Atom[], id: number): number[][] {
  const atom = atoms[id]
  if (!atom) return []
  const levels: number[][] = []
  const push = (ids: number[]): void => {
    if (ids.length > (levels.at(-1)?.length ?? 0)) levels.push(ids)
  }
  const pick = (test: (other: Atom) => boolean): number[] => atoms.filter(test).map((other) => other.id)

  push([id])
  for (let depth = atom.at.groups.length - 1; depth >= 0; depth--) {
    const prefix = atom.at.groups.slice(0, depth + 1)
    push(pick((other) => sameLayer(other.at, atom.at) && startsWith(other.at.groups, prefix)))
  }
  push(pick((other) => sameLayer(other.at, atom.at)))
  for (const ancestor of ancestors(anim, atom.at.asset, atom.at.layer)) {
    push(pick((other) => sameComp(other.at, atom.at) &&
      (other.at.layer === ancestor || ancestors(anim, other.at.asset, other.at.layer).includes(ancestor))))
  }
  if (atom.at.asset !== undefined) push(pick((other) => sameComp(other.at, atom.at)))
  return levels
}

// ---------- similar atoms ----------

// "Ding_12", "Ding 3", "Paper" → stem "Ding" (numbered), "Ding" (numbered),
// "Paper" (not numbered): After Effects names copies "X", "X 2", "X 3", so an
// unnumbered original shares its copies' stem. Generic export names ("Shape
// Layer 7", "Слой 9") make no family.
const GENERIC_STEMS = new Set(['', 'shape layer', 'layer', 'group', 'слой', 'null', 'null control'])

interface Stem { stem: string; numbered: boolean }

function layerStem(name: string | null): Stem | null {
  if (name === null) return null
  const trimmed = name.trim()
  const stem = trimmed.replace(/[\s_\-.]*\d+$/, '').trim()
  return GENERIC_STEMS.has(stem.toLowerCase()) ? null : { stem, numbered: stem !== trimmed }
}

// Two layer names are copies of one another when their stems are equal and at
// least one is numbered (two unrelated layers both called "Arm" are not).
function sameFamily(a: Stem | null, b: Stem | null): boolean {
  return a !== null && b !== null && a.stem === b.stem && (a.numbered || b.numbered)
}

// Shape kinds (paths with their vertex count), the number of child groups and
// paint kinds with colours: copies of one element match, different elements of
// one colour rarely do.
function signature(located: LocatedAtom, hexes: string[]): string {
  const groups = located.items.filter((item) => isObject(item) && item.ty === 'gr').length
  const shapes = located.items
    .filter((item): item is Json => isObject(item) && typeof item.ty === 'string' && SHAPES.has(item.ty))
    .map((item) => (item.ty === 'sh' ? `sh${pathVertexCount(item)}` : String(item.ty)))
  const paints = located.paints.map((paint) => String(paint.ty))
  return `${shapes.join(',')}|gr${groups}|${paints.join(',')}|${hexes.join(',')}`
}

function pathVertexCount(shape: Json): number {
  const prop = shape.ks
  if (!isObject(prop)) return 0
  const first = Array.isArray(prop.k) ? prop.k[0] : prop.k
  const value = isObject(first) && Array.isArray(first.s) ? first.s[0] : first
  return isObject(value) && Array.isArray(value.v) ? value.v.length : 0
}

// The atoms like the selection `ids` (selection included, ids ascending): for
// each selected atom, (1) atoms with the same signature, and (2) the atom at
// the same group path in every other layer of the same comp that is a copy of
// its layer by name ("Ding_1" ↔ "Ding_14", "Paper" ↔ "Paper 2").
export function similarAtoms(anim: Lottie, atoms: readonly Atom[], ids: readonly number[]): number[] {
  const located = locateAtoms(anim)
  const allSites = readColorSites(anim)
  const signatures = located.map((item, id) =>
    signature(item, [...new Set((atoms[id]?.sites ?? []).map((s) => allSites[s].hex))]))
  const result = new Set<number>()
  for (const id of ids) {
    const atom = atoms[id]
    if (!atom) continue
    result.add(id)
    const stem = layerStem(atom.layerName)
    for (const other of atoms) {
      if (signatures[other.id] === signatures[id]) result.add(other.id)
      else if (sameComp(other.at, atom.at) && other.at.layer !== atom.at.layer &&
        sameFamily(stem, layerStem(other.layerName)) && other.at.groups.join() === atom.at.groups.join()) result.add(other.id)
    }
  }
  return [...result].sort((a, b) => a - b)
}

// ---------- fingerprint ----------

// A short id of the sticker's structure (layers, their kinds, names, parents,
// precomp references and shape-tree kinds), blind to colours and keyframe
// values: a recoloured file keeps it, another sticker with the same root `nm`
// gets a different one. FNV-1a 32 bit over code points (not UTF-8 bytes, so
// not interchangeable with other FNV-1a implementations), 8 hex digits.
export function fingerprint(anim: Lottie): string {
  const parts: string[] = []
  const shapeTree = (items: unknown): string =>
    Array.isArray(items)
      ? items.map((item) => (isObject(item) ? `${String(item.ty)}${item.ty === 'gr' ? `(${shapeTree(item.it)})` : ''}` : '?')).join(',')
      : ''
  for (const { asset, layers } of comps(anim)) {
    parts.push(`#${asset ?? ''}`)
    for (const layer of layers) {
      if (!isObject(layer)) continue
      parts.push([layer.ty, layer.nm, layer.ind, layer.parent, layer.refId, shapeTree(layer.shapes)].map(String).join('|'))
    }
  }
  let hash = 0x811c9dc5
  for (const char of parts.join('\n')) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}
