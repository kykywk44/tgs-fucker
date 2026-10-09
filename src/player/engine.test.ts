/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import colorsFixture from '../core/__fixtures__/colors.json'
import minimalFixture from '../core/__fixtures__/minimal.json'
import { replaceColor } from '../core/colors'
import { readTgs, type Lottie } from '../core/tgs'
import { loadEngine, type Engine } from './engine'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const WASM_PATH = join(ROOT, 'node_modules', 'tlottie', 'dist', 'core', 'tlottie.wasm')
const SAMPLES_DIR = join(ROOT, 'samples')

const colors = colorsFixture as Lottie
const minimal = minimalFixture as Lottie

function listSampleFiles(): string[] {
  if (!existsSync(SAMPLES_DIR)) return []
  return readdirSync(SAMPLES_DIR)
    .filter((name) => name.endsWith('.tgs'))
    .sort()
    .map((name) => join(SAMPLES_DIR, name))
}

// Uint8Array.from copies into an ArrayBuffer-backed view (BufferSource-safe).
function readBytes(path: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(readFileSync(path))
}

function loadWasm(): Uint8Array<ArrayBuffer> {
  return readBytes(WASM_PATH)
}

function pixel(data: Uint8ClampedArray, x: number, y: number, width = 64): number[] {
  const i = (y * width + x) * 4
  return [data[i], data[i + 1], data[i + 2], data[i + 3]]
}

describe('loadEngine', () => {
  it('rejects a wasm module without the tlottie exports', async () => {
    const empty = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0])
    await expect(loadEngine(empty)).rejects.toThrow('нет экспорта')
  })
})

describe('engine on colors.json', () => {
  let engine: Engine

  it('loads the tlottie engine', async () => {
    engine = await loadEngine(loadWasm())
    expect(engine).toBeDefined()
  })

  it('reports 60 frames at 60 fps', () => {
    const anim = engine.create(JSON.stringify(colors))
    expect(anim).not.toBeNull()
    expect(anim!.frameCount).toBe(60)
    expect(anim!.frameRate).toBe(60)
    anim!.drop()
  })

  it('renders a red centre pixel at frame 0', () => {
    const anim = engine.create(JSON.stringify(colors))!
    const data = anim.render(0, 64, 64)!
    expect(data.length).toBe(64 * 64 * 4)
    expect(pixel(data, 32, 32)).toEqual([255, 0, 0, 255])
    anim.drop()
  })

  it('renders the replaced colour after replaceColor', () => {
    const replaced = replaceColor(colors, '#ff0000', '#0000ff')
    const anim = engine.create(JSON.stringify(replaced))!
    const data = anim.render(30, 64, 64)!
    expect(pixel(data, 32, 32)).toEqual([0, 0, 255, 255])
    anim.drop()
  })

  it('returns null for empty, malformed and empty-object JSON', () => {
    expect(engine.create('')).toBeNull()
    expect(engine.create('{not json')).toBeNull()
    expect(engine.create('{}')).toBeNull()
  })

  it('drop is idempotent and render after drop returns null', () => {
    const anim = engine.create(JSON.stringify(colors))!
    anim.drop()
    expect(() => anim.drop()).not.toThrow()
    expect(anim.render(0, 64, 64)).toBeNull()
  })
})

describe('engine on minimal.json', () => {
  it('renders a transparent pixel at (1,1)', async () => {
    const engine = await loadEngine(loadWasm())
    const anim = engine.create(JSON.stringify(minimal))!
    expect(anim).not.toBeNull()
    const data = anim.render(0, 64, 64)!
    expect(pixel(data, 1, 1)[3]).toBe(0)
    anim.drop()
  })
})

describe('engine on samples', () => {
  const samples = listSampleFiles()

  it('uses sample files when present, otherwise colors.json', async () => {
    const engine = await loadEngine(loadWasm())
    const cases: Array<{ name: string; lottie: Lottie }> = []
    if (samples.length === 0) {
      cases.push({ name: 'colors.json', lottie: colors })
    } else {
      for (const file of samples) {
        cases.push({ name: file, lottie: await readTgs(readBytes(file)) })
      }
    }

    for (const { name, lottie } of cases) {
      const anim = engine.create(JSON.stringify(lottie))
      expect(anim, name).not.toBeNull()
      expect(anim!.frameCount, name).toBe(lottie.op - lottie.ip)
      expect(anim!.render(0, 64, 64), name).not.toBeNull()
      anim!.drop()
    }
  })
})
