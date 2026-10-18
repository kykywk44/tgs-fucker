/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import atomsFixture from './__fixtures__/atoms.json'
import partsFixture from './__fixtures__/parts.json'
import { expandLevels, findAtoms, fingerprint, similarAtoms } from './atoms'
import { readColorSites, replaceColor } from './colors'
import { matchProfile } from './parts'
import { readTgs, type Lottie } from './tgs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SAMPLES_DIR = resolve(HERE, '..', '..', 'samples')

const fixture = atomsFixture as Lottie

// --- Fixture (atoms.json) ------------------------------------------------------
// Asset comp_a: layer flame > f [tri, st #ff8000, fl #ffff00] — shown by two
// precomp layers `fx`. Root: Ctrl (null), Body (parent Ctrl) > Outer [A [tri,
// fl red], B [el, fl green], rc, fl blue], Arm (parent Ctrl) > Hand [rc, fl
// yellow], Ding_1 > s [el, fl white], t [rc, fl #ffc600], Ding_2 > s [el, fl
// white], t [el, fl grey], fx, fx, Loose [tri, fl] (no group), Grad > g [el, gf].
// Atoms: 0 f, 1 Outer, 2 A, 3 B, 4 Hand, 5 Ding_1 s, 6 Ding_1 t, 7 Ding_2 s,
// 8 Ding_2 t, 9 Loose, 10 g.
// Sites: 0-1 f (st, fl), 2 A, 3 B, 4 Outer, 5 Hand, 6-7 Ding_1, 8-9 Ding_2,
// 10 Loose, 11-12 gradient stops.

describe('findAtoms', () => {
  const atoms = findAtoms(fixture)

  it('finds every shape list holding a paint, assets first, pre-order', () => {
    expect(atoms.map((atom) => [atom.at, atom.layerName])).toEqual([
      [{ asset: 'comp_a', layer: 0, groups: [0] }, 'flame'],
      [{ layer: 1, groups: [0] }, 'Body'],
      [{ layer: 1, groups: [0, 0] }, 'Body'],
      [{ layer: 1, groups: [0, 1] }, 'Body'],
      [{ layer: 2, groups: [0] }, 'Arm'],
      [{ layer: 3, groups: [0] }, 'Ding_1'],
      [{ layer: 3, groups: [1] }, 'Ding_1'],
      [{ layer: 4, groups: [0] }, 'Ding_2'],
      [{ layer: 4, groups: [1] }, 'Ding_2'],
      [{ layer: 7, groups: [] }, 'Loose'],
      [{ layer: 8, groups: [0] }, 'Grad'],
    ])
    expect(atoms.map((atom) => atom.id)).toEqual(atoms.map((_, i) => i))
  })

  it('gives each atom only the sites of its own paints, not of nested groups', () => {
    expect(atoms.map((atom) => atom.sites)).toEqual([[0, 1], [4], [2], [3], [5], [6], [7], [8], [9], [10], [11, 12]])
    expect(atoms.flatMap((atom) => atom.sites).sort((a, b) => a - b)).toEqual(readColorSites(fixture).map((s) => s.index))
  })

  it('counts how many times an asset atom is drawn', () => {
    expect(atoms.map((atom) => atom.instances)).toEqual([2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
  })

  it('returns [] for an animation without paints and does not mutate its input', () => {
    expect(findAtoms({ ...fixture, assets: [], layers: [] })).toEqual([])
    const snapshot = structuredClone(fixture)
    findAtoms(fixture)
    expect(fixture).toEqual(snapshot)
  })
})

describe('expandLevels', () => {
  const atoms = findAtoms(fixture)

  it('grows from the atom through its groups, its layer and its parent chain', () => {
    expect(expandLevels(fixture, atoms, 2)).toEqual([[2], [1, 2, 3], [1, 2, 3, 4]])
  })

  it('skips levels that add nothing', () => {
    expect(expandLevels(fixture, atoms, 5)).toEqual([[5], [5, 6]])
    expect(expandLevels(fixture, atoms, 9)).toEqual([[9]])
  })

  it('ends with the whole asset for an asset atom', () => {
    expect(expandLevels(fixture, atoms, 0)).toEqual([[0]])
  })

  it('returns [] for an unknown id', () => {
    expect(expandLevels(fixture, atoms, 99)).toEqual([])
  })
})

describe('similarAtoms', () => {
  const atoms = findAtoms(fixture)

  it('adds atoms with the same shapes and colours', () => {
    expect(similarAtoms(fixture, atoms, [5])).toEqual([5, 7])
  })

  it('adds the atom at the same group path in numbered copies of the layer', () => {
    // Ding_1 t (rc, #ffc600) and Ding_2 t (el, grey) differ, but sit at the same path.
    expect(similarAtoms(fixture, atoms, [5, 6])).toEqual([5, 6, 7, 8])
  })

  // The fixture with layers 3 and 4 (Ding_1, Ding_2) renamed; atom ids stay.
  const renamed = (first: string, second: string): Lottie => {
    const anim = structuredClone(fixture)
    ;(anim.layers[3] as { nm: string }).nm = first
    ;(anim.layers[4] as { nm: string }).nm = second
    return anim
  }

  it('matches by signature alone, without a name family', () => {
    const anim = renamed('Ding_1', 'Spark')
    expect(similarAtoms(anim, findAtoms(anim), [5])).toEqual([5, 7])
    expect(similarAtoms(anim, findAtoms(anim), [6])).toEqual([6])
  })

  it('puts an unnumbered original in its copies’ family', () => {
    const anim = renamed('Ding', 'Ding 2')
    expect(similarAtoms(anim, findAtoms(anim), [6])).toEqual([6, 8])
  })

  it('makes no family of two unnumbered layers with one name, nor of generic names', () => {
    for (const [first, second] of [['Ding', 'Ding'], ['Shape Layer 1', 'Shape Layer 2'], ['Слой 3', 'Слой 9']]) {
      const anim = renamed(first, second)
      expect(similarAtoms(anim, findAtoms(anim), [6]), `${first} / ${second}`).toEqual([6])
    }
  })

  it('keeps a unique atom alone', () => {
    expect(similarAtoms(fixture, atoms, [2])).toEqual([2])
    expect(similarAtoms(fixture, atoms, [])).toEqual([])
  })
})

describe('fingerprint', () => {
  it('is 8 hex digits and stable', () => {
    expect(fingerprint(fixture)).toMatch(/^[0-9a-f]{8}$/)
    expect(fingerprint(structuredClone(fixture))).toBe(fingerprint(fixture))
  })

  it('ignores colours but sees structure and names', () => {
    expect(fingerprint(replaceColor(fixture, '#ff0000', '#00ffff'))).toBe(fingerprint(fixture))
    const renamed = structuredClone(fixture)
    ;(renamed.layers[1] as { nm: string }).nm = 'Torso'
    expect(fingerprint(renamed)).not.toBe(fingerprint(fixture))
    expect(fingerprint(partsFixture as Lottie)).not.toBe(fingerprint(fixture))
  })
})

// --- Real samples (untracked: skipped when absent) -------------------------------

const sampleFiles = existsSync(SAMPLES_DIR)
  ? readdirSync(SAMPLES_DIR).filter((name) => name.endsWith('.tgs')).sort()
  : []
const loadSample = async (name: string): Promise<Lottie> => readTgs(new Uint8Array(readFileSync(join(SAMPLES_DIR, name))))

describe.skipIf(sampleFiles.length === 0)('atoms on samples', () => {
  it.each(sampleFiles)('%s: atoms partition the colour sites; levels grow strictly', async (name) => {
    const anim = await loadSample(name)
    const atoms = findAtoms(anim)
    expect(atoms.flatMap((atom) => atom.sites).sort((a, b) => a - b)).toEqual(readColorSites(anim).map((s) => s.index))
    for (const atom of atoms) {
      const levels = expandLevels(anim, atoms, atom.id)
      expect(levels[0]).toEqual([atom.id])
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i].length).toBeGreaterThan(levels[i - 1].length)
        expect(levels[i]).toEqual(expect.arrayContaining(levels[i - 1]))
      }
    }
  })

  it.each(sampleFiles)('%s: every hand-profile part is a whole set of atoms', async (name) => {
    const anim = await loadSample(name)
    const match = matchProfile(anim)
    if (!match) return
    for (const atom of findAtoms(anim)) {
      const owners = new Set(atom.sites.map((site) => match.parts.find((part) => part.sites.includes(site))?.id ?? null))
      expect(owners.size, `${name} atom ${atom.id}`).toBe(1)
    }
  })
})

describe.skipIf(!existsSync(join(SAMPLES_DIR, 'CoolSticker.tgs')))('CoolSticker.tgs atoms', () => {
  it('reaches exactly the «Искры» part from one spark: whole layer, then similar', async () => {
    const anim = await loadSample('CoolSticker.tgs')
    const atoms = findAtoms(anim)
    const sparks = matchProfile(anim)!.parts.find((part) => part.id === 'sparks')!
    const sparkAtoms = atoms.filter((atom) => atom.sites.every((site) => sparks.sites.includes(site))).map((a) => a.id)
    const first = atoms.find((atom) => atom.layerName === 'Ding_1')!
    const layer = expandLevels(anim, atoms, first.id).find((level) =>
      level.length === atoms.filter((atom) => atom.layerName === 'Ding_1').length)!
    expect(similarAtoms(anim, atoms, layer)).toEqual(sparkAtoms)
  })

  it('marks the fire asset atoms as drawn 8 times', async () => {
    const anim = await loadSample('CoolSticker.tgs')
    const fire = findAtoms(anim).filter((atom) => atom.at.asset === 'comp_0')
    expect(fire.length).toBeGreaterThan(0)
    for (const atom of fire) expect(atom.instances).toBe(8)
  })
})
