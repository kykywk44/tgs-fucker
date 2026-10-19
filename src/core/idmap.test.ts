/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadEngine, type Engine } from '../player/engine'
import atomsFixture from './__fixtures__/atoms.json'
import { findAtoms } from './atoms'
import { readColorSites } from './colors'
import { decodeId, idColor, idColorize, pickAt, translucentAtoms } from './idmap'
import { readTgs, type Lottie } from './tgs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const SAMPLES_DIR = join(ROOT, 'samples')
const WASM_PATH = join(ROOT, 'node_modules', 'tlottie', 'dist', 'core', 'tlottie.wasm')
const SIZE = 512

const fixture = atomsFixture as Lottie
const hex = (rgb: number[]) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('')

let engine: Engine
beforeAll(async () => {
  engine = await loadEngine(Uint8Array.from(readFileSync(WASM_PATH)))
})

function render(anim: Lottie, frame: number): Uint8ClampedArray {
  const instance = engine.create(JSON.stringify(anim))!
  const rgba = instance.render(frame, SIZE, SIZE, false)!.slice()
  instance.drop()
  return rgba
}

// Opacity-like values of every `o` property in `anim` (layers, transforms, paints).
function opacities(anim: Lottie): number[] {
  const values: number[] = []
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit)
    if (typeof node !== 'object' || node === null) return
    const record = node as Record<string, unknown>
    const o = record.o as { k?: unknown } | undefined
    if (o && typeof o === 'object' && 'k' in o) {
      if (typeof o.k === 'number') values.push(o.k)
      else if (Array.isArray(o.k)) for (const kf of o.k) if (kf && typeof kf === 'object' && Array.isArray(kf.s)) values.push(kf.s[0])
    }
    Object.values(record).forEach((value) => typeof value === 'object' && visit(value))
  }
  visit(anim)
  return values
}

describe('idColor / decodeId / pickAt', () => {
  it('round-trips ids and leaves 0 for the background', () => {
    for (const id of [0, 1, 255, 256, 70000]) {
      const [r, g, b] = idColor(id)
      expect(decodeId(r, g, b, 255, 70001)).toBe(id)
    }
    expect(idColor(0)).toEqual([0, 0, 1])
    expect(decodeId(0, 0, 0, 0, 10)).toBeNull()
  })

  it('rejects partial alpha and colours of no atom', () => {
    expect(decodeId(0, 0, 1, 200, 10)).toBeNull()
    expect(decodeId(0, 0, 11, 255, 10)).toBeNull()
    expect(decodeId(255, 255, 255, 255, 10)).toBeNull()
  })

  it('picks by canvas fraction and returns null outside', () => {
    const rgba = new Uint8ClampedArray(2 * 2 * 4)
    rgba.set([0, 0, 3, 255], (1 * 2 + 1) * 4) // bottom-right pixel = atom 2
    expect(pickAt(rgba, 2, 0.75, 0.75, 5)).toBe(2)
    expect(pickAt(rgba, 2, 0.25, 0.25, 5)).toBeNull()
    expect(pickAt(rgba, 2, 1, 0.5, 5)).toBeNull()
    expect(pickAt(rgba, 2, -0.1, 0.5, 5)).toBeNull()
  })
})

describe('idColorize', () => {
  const copy = idColorize(fixture)
  const atoms = findAtoms(fixture)

  it('keeps the atoms and paints each with its ID colour', () => {
    const copyAtoms = findAtoms(copy)
    expect(copyAtoms.map((atom) => atom.at)).toEqual(atoms.map((atom) => atom.at))
    const sites = readColorSites(copy)
    for (const atom of copyAtoms) {
      for (const site of atom.sites) expect(sites[site].hex).toBe(hex(idColor(atom.id)))
    }
  })

  it('turns gradients into solid paints and opacity into 0 / 100', () => {
    expect(JSON.stringify(copy)).not.toMatch(/"ty":"g[fs]"/)
    const withFade = structuredClone(fixture)
    ;(withFade.layers[1] as { ks: { o: unknown } }).ks.o = {
      a: 1,
      k: [{ t: 0, s: [0] }, { t: 30, s: [40] }, { t: 50, s: [0] }, { t: 59, s: [0] }],
    }
    const faded = idColorize(withFade)
    expect(new Set(opacities(faded))).toEqual(new Set([0, 100]))
    const keyframes = (faded.layers[1] as { ks: { o: { k: { s: number[]; h: number }[] } } }).ks.o.k
    // a segment with a visible end is on; a hold keyframe keeps the start hidden before t 0
    expect(keyframes.map((kf) => kf.s[0])).toEqual([0, 100, 100, 0, 0])
    expect(keyframes.every((kf) => kf.h === 1)).toBe(true)
  })

  it('keeps a fade-in hidden before its first keyframe', () => {
    const withFade = structuredClone(fixture)
    ;(withFade.layers[1] as { ks: { o: unknown } }).ks.o = { a: 1, k: [{ t: 20, s: [0] }, { t: 30, s: [100] }] }
    const keyframes = (idColorize(withFade).layers[1] as { ks: { o: { k: { t: number; s: number[] }[] } } }).ks.o.k
    expect(keyframes.map((kf) => [kf.t, kf.s[0]])).toEqual([[19.99, 0], [20, 100], [30, 100]])
  })

  it('resets blend modes and whitens a luma matte source', () => {
    const matted = structuredClone(fixture)
    const layers = matted.layers as Record<string, unknown>[]
    layers[3].td = 1 // Ding_1 is the matte of Ding_2
    layers[4].tt = 3 // luma
    layers[2].bm = 3
    const result = idColorize(matted)
    expect((result.layers[2] as { bm: number }).bm).toBe(0)
    const sites = readColorSites(result)
    for (const site of findAtoms(result).filter((atom) => atom.at.layer === 3).flatMap((atom) => atom.sites)) {
      expect(sites[site].hex).toBe('#ffffff')
    }
  })

  it('does not mutate its input', () => {
    const snapshot = structuredClone(fixture)
    idColorize(fixture)
    expect(fixture).toEqual(snapshot)
  })

  it('renders to exact ID colours and picks the topmost atom', () => {
    const rgba = render(copy, 0)
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (rgba[i * 4 + 3] === 0) continue
      expect(decodeId(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], rgba[i * 4 + 3], atoms.length)).not.toBeNull()
    }
    // Ding_1 › s is the topmost unparented layer at the centre; Body (parented to Ctrl, both at
    // 256,256) sits at the bottom-right corner, where its first item, A, draws on top.
    expect(pickAt(rgba, SIZE, 0.5, 0.5, atoms.length)).toBe(5)
    expect(pickAt(rgba, SIZE, 0.99, 0.99, atoms.length)).toBe(2)
    expect(pickAt(rgba, SIZE, 0.01, 0.01, atoms.length)).toBeNull()
  })
})

describe('translucent atoms', () => {
  // The fixture with Loose (atom 9) at 40 % paint opacity and Grad's gradient (atom 10) fading
  // out through opacity stops; everything else stays solid.
  const translucent = (): Lottie => {
    const anim = structuredClone(fixture)
    const layers = anim.layers as Record<string, any>[]
    layers[7].shapes[1].o = { a: 0, k: 40 }
    layers[8].shapes[0].it[1].g.k.k.push(0, 1, 1, 0)
    return anim
  }
  const ids = (rgba: Uint8ClampedArray, count: number): Set<number> => {
    const seen = new Set<number>()
    for (let i = 0; i < SIZE * SIZE; i++) {
      const id = decodeId(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], rgba[i * 4 + 3], count)
      if (id !== null) seen.add(id)
    }
    return seen
  }

  it('lists atoms whose every paint is below full opacity or fades through gradient stops', () => {
    expect([...translucentAtoms(fixture)]).toEqual([])
    expect([...translucentAtoms(translucent())].sort((a, b) => a - b)).toEqual([9, 10])
  })

  it('keeps solid and translucent atoms in separate maps', () => {
    const anim = translucent()
    const count = findAtoms(anim).length
    const solid = ids(render(idColorize(anim, { only: 'solid' }), 0), count)
    const glass = ids(render(idColorize(anim, { only: 'translucent' }), 0), count)
    expect(solid.has(9) || solid.has(10)).toBe(false)
    expect([...glass].every((id) => id === 9 || id === 10)).toBe(true)
    expect(glass.size).toBeGreaterThan(0)
    expect(ids(render(idColorize(anim), 0), count)).toEqual(new Set([...solid, ...glass]))
  })
})

const sampleFiles = existsSync(SAMPLES_DIR)
  ? readdirSync(SAMPLES_DIR).filter((name) => name.endsWith('.tgs')).sort()
  : []

describe.skipIf(sampleFiles.length === 0)('ID map on samples', () => {
  it.each(sampleFiles)('%s: every drawn pixel is an exact atom ID on three frames', async (name) => {
    const anim = await readTgs(new Uint8Array(readFileSync(join(SAMPLES_DIR, name))))
    const count = findAtoms(anim).length
    const copy = idColorize(anim)
    const frames = anim.op - anim.ip
    for (const frame of [0, Math.floor(frames / 3), Math.floor((2 * frames) / 3)]) {
      const rgba = render(copy, frame)
      let impure = 0
      for (let i = 0; i < SIZE * SIZE; i++) {
        const a = rgba[i * 4 + 3]
        if (a !== 0 && decodeId(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], a, count) === null) impure++
      }
      expect(impure, `${name} frame ${frame}`).toBe(0)
    }
  })
})
