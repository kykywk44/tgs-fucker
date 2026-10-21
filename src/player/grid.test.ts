/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import minimalFixture from '../core/__fixtures__/minimal.json'
import { loadEngine, type Engine } from './engine'
import { GridPlayer } from './grid'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const WASM_PATH = join(ROOT, 'node_modules', 'tlottie', 'dist', 'core', 'tlottie.wasm')
// The fixture is static (one frame for tlottie); fading its layer in makes every frame differ.
const animated = structuredClone(minimalFixture) as unknown as { layers: { ks: Record<string, unknown> }[] }
animated.layers[0].ks.o = {
  a: 1,
  k: [
    { t: 0, s: [0], o: { x: [0.5], y: [0.5] }, i: { x: [0.5], y: [0.5] } },
    { t: 59, s: [100] },
  ],
}
const JSON_MIN = JSON.stringify(animated)

let engine: Engine
beforeAll(async () => {
  engine = await loadEngine(Uint8Array.from(readFileSync(WASM_PATH)))
})

// Steps at 60 fps from t = 0 and collects the keys drawn on each step.
function run(grid: GridPlayer, steps: number, from = 0): string[][] {
  const out: string[][] = []
  for (let i = 0; i < steps; i++) out.push(grid.step(from + i * (1000 / 60), () => {}))
  return out
}

describe('GridPlayer', () => {
  it('draws only visible tiles', () => {
    const grid = new GridPlayer(engine, 32, 10, 60)
    grid.load('a', JSON_MIN)
    grid.load('b', JSON_MIN)
    grid.setVisible('a', true)
    const drawn = run(grid, 5).flat()
    expect(drawn).toContain('a')
    expect(drawn).not.toContain('b')
  })

  it('gives the drawn frame as a size × size RGBA view', () => {
    const grid = new GridPlayer(engine, 16, 10, 60)
    grid.load('a', JSON_MIN)
    grid.setVisible('a', true)
    let length = 0
    grid.step(0, (_, rgba, size) => {
      length = rgba.length
      expect(size).toBe(16)
    })
    expect(length).toBe(16 * 16 * 4)
  })

  it('remembers visibility set before the tile loads', () => {
    const grid = new GridPlayer(engine, 32, 10, 60)
    grid.setVisible('a', true)
    grid.load('a', JSON_MIN)
    expect(run(grid, 2).flat()).toContain('a')
  })

  it('stops drawing while paused and resumes', () => {
    const grid = new GridPlayer(engine, 32, 10, 60)
    grid.load('a', JSON_MIN)
    grid.setVisible('a', true)
    run(grid, 3)
    grid.pause()
    expect(run(grid, 10, 100).flat()).toEqual([])
    grid.resume()
    expect(run(grid, 10, 400).flat()).toContain('a')
  })

  it('keeps at most maxLoaded, dropping the least recently visible hidden tiles', () => {
    const grid = new GridPlayer(engine, 16, 2, 60)
    grid.load('a', JSON_MIN)
    run(grid, 2)
    grid.load('b', JSON_MIN)
    run(grid, 2, 100)
    grid.setVisible('c', true)
    grid.load('c', JSON_MIN)
    expect(grid.loaded).toBe(2)
    expect(grid.has('a')).toBe(false)
    expect(grid.has('c')).toBe(true)
  })

  it('never evicts a visible tile', () => {
    const grid = new GridPlayer(engine, 16, 1, 60)
    grid.setVisible('a', true)
    grid.setVisible('b', true)
    grid.load('a', JSON_MIN)
    grid.load('b', JSON_MIN)
    expect(grid.has('a') && grid.has('b')).toBe(true)
  })

  it('rejects JSON the engine cannot read', () => {
    const grid = new GridPlayer(engine, 16)
    expect(grid.load('x', '{"not":"lottie"}')).toBe(false)
    expect(grid.has('x')).toBe(false)
  })

  it('throttles drawing to fps', () => {
    const grid = new GridPlayer(engine, 16, 10, 20)
    grid.load('a', JSON_MIN)
    grid.setVisible('a', true)
    const steps = run(grid, 60) // one second at 60 Hz
    const draws = steps.filter((keys) => keys.length).length
    expect(draws).toBeGreaterThan(10)
    expect(draws).toBeLessThanOrEqual(21)
  })
})
