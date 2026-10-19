/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import colorsFixture from '../core/__fixtures__/colors.json'
import { findAtoms } from '../core/atoms'
import { readColorSites, replaceColor } from '../core/colors'
import type { Lottie } from '../core/tgs'
import { loadEngine, type Animation, type Engine } from './engine'
import { PreviewPlayer } from './player'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const WASM_PATH = join(ROOT, 'node_modules', 'tlottie', 'dist', 'core', 'tlottie.wasm')

const colors = colorsFixture as Lottie
const RED = JSON.stringify(colors)
const BLUE = JSON.stringify(replaceColor(colors, '#ff0000', '#0000ff'))
const BAD = '{not json'

const SIZE = 32

interface Blitted {
  width: number
  height: number
  length: number
  centre: number[]
}

interface Harness {
  player: PreviewPlayer
  blits: Blitted[]
  creates: () => number
}

let realEngine: Engine

beforeAll(async () => {
  realEngine = await loadEngine(Uint8Array.from(readFileSync(WASM_PATH)))
})

// The blit callback gets a view into wasm memory valid only until the next
// engine call, so everything the tests need is copied out inside it.
function setup(size = SIZE): Harness {
  let created = 0
  const counting: Engine = {
    create(json) {
      created++
      return realEngine.create(json)
    },
  }
  const blits: Blitted[] = []
  const player = new PreviewPlayer(
    counting,
    (rgba, width, height) => {
      const i = ((height >> 1) * width + (width >> 1)) * 4
      blits.push({
        width,
        height,
        length: rgba.length,
        centre: [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]],
      })
    },
    size,
  )
  return { player, blits, creates: () => created }
}

describe('PreviewPlayer before any load', () => {
  it('has the initial state and does not blit or ask for another frame', () => {
    const { player, blits } = setup()
    expect(player.state).toEqual({ playing: true, frame: 0, error: null })
    expect(player.step(1000)).toBe(false)
    expect(blits).toHaveLength(0)
  })
})

describe('PreviewPlayer playback', () => {
  it('blits size x size on the first step and advances with the clock', () => {
    const { player, blits } = setup()
    player.load(RED)
    expect(player.step(1000)).toBe(true)
    expect(blits).toHaveLength(1)
    expect(blits[0].width).toBe(SIZE)
    expect(blits[0].height).toBe(SIZE)
    expect(blits[0].length).toBe(SIZE * SIZE * 4)
    expect(blits[0].centre).toEqual([255, 0, 0, 255])
    expect(player.state).toEqual({ playing: true, frame: 0, error: null })

    expect(player.step(1100)).toBe(true)
    expect(player.state.frame).toBe(6)
    expect(blits).toHaveLength(2)
  })

  it('keeps the current frame and play state when a new animation is swapped in', () => {
    const { player, blits } = setup()
    player.load(RED)
    player.step(1000)
    player.step(1100)
    expect(player.state.frame).toBe(6)

    player.load(BLUE)
    expect(player.step(1150)).toBe(true)
    expect(player.state.frame).toBe(9)
    expect(player.state.playing).toBe(true)
    expect(player.state.error).toBeNull()
    expect(blits.at(-1)!.centre).toEqual([0, 0, 255, 255])
  })

  it('coalesces loads: only the latest pending JSON is built', () => {
    const { player, blits, creates } = setup()
    player.load(RED)
    player.load(BLUE)
    player.step(1000)
    expect(creates()).toBe(1)
    expect(blits).toHaveLength(1)
    expect(blits[0].centre).toEqual([0, 0, 255, 255])
  })

  it('does not rebuild the animation on later steps', () => {
    const { player, creates } = setup()
    player.load(RED)
    player.step(1000)
    player.step(1050)
    player.step(1100)
    expect(creates()).toBe(1)
  })
})

describe('PreviewPlayer rejected JSON', () => {
  it('keeps the old animation playing and blitting, and clears the error on the next good load', () => {
    const { player, blits } = setup()
    player.load(RED)
    player.step(1000)
    player.step(1100)
    expect(blits).toHaveLength(2)

    player.load(BAD)
    expect(player.step(1150)).toBe(true)
    expect(player.state.error).toBe('движок не принял анимацию')
    expect(player.state.frame).toBe(9)
    expect(blits).toHaveLength(3)
    expect(blits.at(-1)!.centre).toEqual([255, 0, 0, 255])

    expect(player.step(1200)).toBe(true)
    expect(player.state.frame).toBe(12)
    expect(player.state.error).toBe('движок не принял анимацию')
    expect(blits).toHaveLength(4)
    expect(blits.at(-1)!.centre).toEqual([255, 0, 0, 255])

    player.load(BLUE)
    expect(player.step(1250)).toBe(true)
    expect(player.state.error).toBeNull()
    expect(player.state.frame).toBe(15)
    expect(blits.at(-1)!.centre).toEqual([0, 0, 255, 255])
  })

  it('reports an error and never blits when the first load is rejected', () => {
    const { player, blits } = setup()
    player.load(BAD)
    expect(player.step(1000)).toBe(false)
    expect(player.state).toEqual({ playing: true, frame: 0, error: 'движок не принял анимацию' })
    expect(blits).toHaveLength(0)
    expect(player.step(1100)).toBe(false)
    expect(blits).toHaveLength(0)
  })
})

describe('PreviewPlayer seek / play / pause', () => {
  it('seek pauses, redraws once on the next step, then stays quiet; play resumes from there', () => {
    const { player, blits } = setup()
    player.load(RED)
    player.step(1000)
    expect(blits).toHaveLength(1)

    player.seek(30.5)
    expect(player.state.playing).toBe(false)
    expect(player.step(1100)).toBe(false)
    expect(blits).toHaveLength(2)
    expect(player.state.frame).toBe(30)

    expect(player.step(1200)).toBe(false)
    expect(player.step(1300)).toBe(false)
    expect(blits).toHaveLength(2)

    player.play()
    expect(player.state.playing).toBe(true)
    expect(player.step(2000)).toBe(true) // sets the anchor
    expect(player.state.frame).toBe(30)
    expect(player.step(2100)).toBe(true)
    expect(player.state.frame).toBe(36)
    expect(blits).toHaveLength(3)
  })

  it('pause stops the clock and further blits', () => {
    const { player, blits } = setup()
    player.load(RED)
    player.step(1000)
    player.step(1100)
    expect(blits).toHaveLength(2)

    player.pause()
    expect(player.state.playing).toBe(false)
    expect(player.step(1200)).toBe(false)
    expect(player.state.frame).toBe(6)
    expect(blits).toHaveLength(2)
  })

  it('a rejected load while paused leaves the old animation and does not blit', () => {
    const { player, blits } = setup()
    player.load(RED)
    player.step(1000)
    player.pause()
    player.load(BAD)
    expect(player.step(1100)).toBe(false)
    expect(player.state.error).toBe('движок не принял анимацию')
    expect(blits).toHaveLength(1)
  })
})

describe('PreviewPlayer resize', () => {
  it('redraws at the new size on the next step even while paused', () => {
    const { player, blits } = setup()
    player.load(RED)
    player.step(1000)
    player.pause()
    expect(blits).toHaveLength(1)

    player.resize(64)
    expect(player.step(1100)).toBe(false)
    expect(blits).toHaveLength(2)
    expect(blits[1].width).toBe(64)
    expect(blits[1].height).toBe(64)
    expect(blits[1].length).toBe(64 * 64 * 4)
    expect(blits[1].centre).toEqual([255, 0, 0, 255])

    expect(player.step(1200)).toBe(false)
    expect(blits).toHaveLength(2)
  })
})

describe('PreviewPlayer render failure', () => {
  it('reports an error when the engine cannot render the frame', () => {
    let dropped = 0
    const anim: Animation = {
      frameCount: 10,
      frameRate: 10,
      render: () => null,
      drop: () => {
        dropped++
      },
    }
    const blits: number[] = []
    const player = new PreviewPlayer({ create: () => anim }, () => blits.push(1), SIZE)
    player.load('{}')
    expect(player.step(1000)).toBe(true)
    expect(player.state.error).toBe('не удалось отрисовать кадр')
    expect(blits).toHaveLength(0)
    expect(dropped).toBe(0)
  })
})

describe('PreviewPlayer animation lifecycle', () => {
  function fakeEngine() {
    const anims: Array<Animation & { dropped: number }> = []
    const engine: Engine = {
      create() {
        const anim = {
          frameCount: 10,
          frameRate: 10,
          dropped: 0,
          render: () => new Uint8ClampedArray(SIZE * SIZE * 4),
          drop() {
            anim.dropped++
          },
        }
        anims.push(anim)
        return anim
      },
    }
    return { engine, anims }
  }

  it('drops the old animation when a new one replaces it, and the last one on destroy', () => {
    const { engine, anims } = fakeEngine()
    const player = new PreviewPlayer(engine, () => {}, SIZE)
    player.load('a')
    player.step(1000)
    player.load('b')
    player.step(1050)
    expect(anims).toHaveLength(2)
    expect(anims[0].dropped).toBe(1)
    expect(anims[1].dropped).toBe(0)

    player.destroy()
    expect(anims[1].dropped).toBe(1)
    player.destroy()
    expect(anims[1].dropped).toBe(1)
  })

  it('does not blit or build anything after destroy', () => {
    const { player, blits, creates } = setup()
    player.load(RED)
    player.step(1000)
    expect(blits).toHaveLength(1)

    player.destroy()
    player.load(BLUE)
    player.play()
    player.seek(10)
    player.resize(64)
    expect(player.step(1100)).toBe(false)
    expect(player.step(1200)).toBe(false)
    expect(blits).toHaveLength(1)
    expect(creates()).toBe(1)
  })

  it('destroy before the pending load is built drops nothing and builds nothing', () => {
    const { player, blits, creates } = setup()
    player.load(RED)
    player.destroy()
    expect(player.step(1000)).toBe(false)
    expect(creates()).toBe(0)
    expect(blits).toHaveLength(0)
  })
})

describe('PreviewPlayer pick', () => {
  it('returns null before an animation is built and outside the canvas', () => {
    const { player } = setup()
    expect(player.pick(0.5, 0.5)).toBeNull()
    player.load(RED)
    expect(player.pick(0.5, 0.5)).toBeNull() // still pending
    player.step(0)
    expect(player.pick(-0.1, 0.5)).toBeNull()
    expect(player.pick(0.5, 1)).toBeNull()
  })

  it('names the atom drawn at the point: the centre of colors.json is red', () => {
    const { player } = setup()
    player.load(RED)
    player.step(0)
    const atom = player.pick(0.5, 0.5)
    expect(atom).not.toBeNull()
    const sites = readColorSites(colors)
    expect(findAtoms(colors)[atom!].sites.map((site) => sites[site].hex)).toContain('#ff0000')
  })

  it('builds the ID map once per animation and again after a new one is swapped in', () => {
    const { player, creates } = setup()
    player.load(RED)
    player.step(0)
    expect(creates()).toBe(1)
    const first = player.pick(0.5, 0.5)
    player.pick(0.25, 0.5)
    expect(creates()).toBe(3) // one pair of ID maps (solid, translucent) for both picks
    player.load(BLUE)
    player.step(16)
    expect(creates()).toBe(4)
    expect(player.pick(0.5, 0.5)).toBe(first) // recolouring keeps the atoms
    expect(creates()).toBe(6)
  })

  it('picks nothing after destroy', () => {
    const { player } = setup()
    player.load(RED)
    player.step(0)
    player.destroy()
    expect(player.pick(0.5, 0.5)).toBeNull()
  })
})
