// DOM-free player for a grid of small animations (the «Эмодзи» tab): many animations on one
// shared clock, only the visible ones drawn, at most `maxLoaded` kept alive (the least recently
// visible hidden ones are dropped and rebuilt on demand). grid.worker.ts is the glue around it.

import type { Animation, Engine } from './engine'

/** Consume `rgba` at once: a view into wasm memory, valid only until the next engine call. */
export type GridDraw = (key: string, rgba: Uint8ClampedArray<ArrayBuffer>, size: number) => void

export type ToGrid =
  | { type: 'init'; size: number }
  | { type: 'attach'; key: string; url: string; canvas: OffscreenCanvas } // on screen: play it here
  | { type: 'detach'; key: string } // off screen: drop it
  | { type: 'pause' }
  | { type: 'resume' }

/** `ready`: the first frame of `key` is on its canvas (the static thumbnail can go). */
export type FromGrid = { type: 'ready'; key: string } | { type: 'failed'; key: string }

interface Tile {
  anim: Animation
  visible: boolean
  seen: number // step time when last visible, for eviction
  drawn: number // last frame drawn, -1 = none
}

export class GridPlayer {
  private readonly tiles = new Map<string, Tile>()
  private readonly visible = new Set<string>() // may name tiles not loaded yet
  private elapsed = 0 // ms of playback
  private last: number | null = null
  private lastDraw = -Infinity
  private playing = true

  private readonly engine: Engine
  private readonly size: number
  private readonly maxLoaded: number
  private readonly fps: number

  constructor(engine: Engine, size: number, maxLoaded = 120, fps = 30) {
    this.engine = engine
    this.size = size
    this.maxLoaded = maxLoaded
    this.fps = fps
  }

  has(key: string): boolean {
    return this.tiles.has(key)
  }

  get loaded(): number {
    return this.tiles.size
  }

  /** Builds (or rebuilds) the animation of `key`; false if the engine rejects it. */
  load(key: string, json: string): boolean {
    this.tiles.get(key)?.anim.drop()
    this.tiles.delete(key)
    const anim = this.engine.create(json)
    if (!anim) return false
    this.tiles.set(key, { anim, visible: this.visible.has(key), seen: this.elapsed, drawn: -1 })
    this.evict()
    return true
  }

  setVisible(key: string, visible: boolean): void {
    if (visible) this.visible.add(key)
    else this.visible.delete(key)
    const tile = this.tiles.get(key)
    if (!tile) return
    tile.visible = visible
    tile.seen = this.elapsed
    if (visible) tile.drawn = -1 // its canvas may be new: draw it on the next step
    else this.evict()
  }

  remove(key: string): void {
    this.visible.delete(key)
    this.tiles.get(key)?.anim.drop()
    this.tiles.delete(key)
  }

  pause(): void {
    this.playing = false
  }

  resume(): void {
    this.playing = true
    this.last = null
  }

  /** Advances the shared clock and draws every visible tile whose frame changed (at most `fps`
   *  times a second). Returns the keys drawn. */
  step(nowMs: number, draw: GridDraw): string[] {
    if (this.playing && this.last !== null) this.elapsed += Math.min(nowMs - this.last, 100)
    this.last = nowMs
    if (nowMs - this.lastDraw < 1000 / this.fps - 1) return []
    this.lastDraw = nowMs
    const drawn: string[] = []
    for (const [key, tile] of this.tiles) {
      if (!tile.visible) continue
      tile.seen = this.elapsed
      const count = Math.max(1, tile.anim.frameCount)
      const frame = Math.floor((this.elapsed / 1000) * (tile.anim.frameRate || 60)) % count
      if (frame === tile.drawn) continue
      const rgba = tile.anim.render(frame, this.size, this.size)
      if (!rgba) continue
      tile.drawn = frame
      draw(key, rgba, this.size)
      drawn.push(key)
    }
    return drawn
  }

  private evict(): void {
    if (this.tiles.size <= this.maxLoaded) return
    const hidden = [...this.tiles].filter(([, t]) => !t.visible).sort((a, b) => a[1].seen - b[1].seen)
    for (const [key] of hidden) {
      if (this.tiles.size <= this.maxLoaded) break
      this.remove(key)
    }
  }
}
