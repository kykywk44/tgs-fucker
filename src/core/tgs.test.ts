/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import minimal from './__fixtures__/minimal.json'
import { readTgs, sizeKb, writeTgs, type Lottie } from './tgs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = join(HERE, '__fixtures__', 'minimal.json')
const SAMPLES_DIR = resolve(HERE, '..', '..', 'samples')

function listSampleFiles(): string[] {
  if (!existsSync(SAMPLES_DIR)) return []
  return readdirSync(SAMPLES_DIR)
    .filter((name) => name.endsWith('.tgs'))
    .sort()
    .map((name) => join(SAMPLES_DIR, name))
}

describe('readTgs / writeTgs', () => {
  it('round-trips the plain JSON fixture and sets tgs: 1', async () => {
    const plain = new Uint8Array(readFileSync(FIXTURE_PATH))

    const first = await readTgs(plain)
    expect(first).toEqual(minimal)

    const written = await writeTgs(first)
    const second = await readTgs(written)
    expect(second).toEqual({ ...minimal, tgs: 1 })
  })

  it('writes gzip bytes starting with 0x1f 0x8b', async () => {
    const bytes = await writeTgs(minimal)
    expect(bytes[0]).toBe(0x1f)
    expect(bytes[1]).toBe(0x8b)
  })

  it('does not mutate its input', async () => {
    const input = structuredClone(minimal) as Lottie
    const snapshot = structuredClone(input)

    await writeTgs(input)

    expect(input).toEqual(snapshot)
    expect(input.tgs).toBeUndefined()
  })
})

describe('readTgs: corrupt input', () => {
  it('reports a truncated gzip as «повреждённый gzip»', async () => {
    const good = await writeTgs(minimal)
    const truncated = good.slice(0, good.length - 6)
    await expect(readTgs(truncated)).rejects.toThrow('повреждённый gzip')
  })

  it('reports garbage after the gzip magic as «повреждённый gzip»', async () => {
    await expect(readTgs(new Uint8Array([0x1f, 0x8b, 0x00]))).rejects.toThrow('повреждённый gzip')
  })

  it('reports non-JSON text as «некорректный JSON»', async () => {
    await expect(readTgs(new TextEncoder().encode('not json'))).rejects.toThrow(
      'некорректный JSON',
    )
  })

  it('keeps the original error as the cause', async () => {
    const error = await readTgs(new TextEncoder().encode('not json')).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).cause).toBeInstanceOf(SyntaxError)
  })
})

describe('sizeKb', () => {
  it('returns bytes / 1024 rounded to one decimal', () => {
    expect(sizeKb(new Uint8Array(1024))).toBe(1)
    expect(sizeKb(new Uint8Array(1536))).toBe(1.5)
    expect(sizeKb(new Uint8Array(1000))).toBe(1)
    expect(sizeKb(new Uint8Array(0))).toBe(0)
  })
})

describe('samples round-trip', () => {
  // Iterate every user sample. When the samples folder is empty, fall back to
  // the committed fixture so this suite still runs and passes.
  const samples = listSampleFiles()
  const inputs = samples.length > 0 ? samples : [FIXTURE_PATH]

  for (const path of inputs) {
    it(`round-trips ${basename(path)}`, async () => {
      const original = new Uint8Array(readFileSync(path))

      const first = await readTgs(original)
      const rewritten = await writeTgs(first)
      const second = await readTgs(rewritten)

      expect(second).toEqual({ ...first, tgs: 1 })
      console.log(`${basename(path)}: ${sizeKb(original)} KB -> ${sizeKb(rewritten)} KB`)
    })
  }
})
