// DOM-free preview controller: wasm engine + playback clock. A Web Worker
// (player.worker.ts) is thin glue around it. `ToWorker` mentions OffscreenCanvas
// as a type only; nothing here touches a DOM API at runtime.
//
// Loads are coalesced: `load` only stores the JSON, and `step` builds the
// latest one. A new animation replaces the old one without touching the clock's
// frame or play state; a rejected one leaves the old animation running.

import { PlaybackClock } from './clock'
import type { Animation, Engine } from './engine'

/** Consume `rgba` immediately: it is a view into wasm memory, valid only until the next engine call. */
export type Blit = (rgba: Uint8ClampedArray<ArrayBuffer>, width: number, height: number) => void

export interface PlayerState {
  playing: boolean
  /** Math.floor(clock.frame) */
  frame: number
  error: string | null
}

export type ToWorker =
  | { type: 'init'; canvas: OffscreenCanvas; size: number }
  | { type: 'load'; json: string }
  | { type: 'play'; seq: number }
  | { type: 'pause'; seq: number }
  | { type: 'seek'; seq: number; frame: number }
  | { type: 'resize'; size: number }

export interface FromWorker extends PlayerState {
  type: 'state'
  seq: number
}

const ERROR_REJECTED = 'движок не принял анимацию'
const ERROR_RENDER = 'не удалось отрисовать кадр'

export class PreviewPlayer {
  private readonly clock = new PlaybackClock()
  private readonly engine: Engine
  private readonly blit: Blit
  private size: number
  private anim: Animation | null = null
  private pending: string | null = null
  private redraw = false
  private error: string | null = null
  private destroyed = false

  constructor(engine: Engine, blit: Blit, size: number) {
    this.engine = engine
    this.blit = blit
    this.size = size
  }

  /** Stored as pending; only the latest pending JSON is ever built. */
  load(json: string): void {
    if (this.destroyed) return
    this.pending = json
  }

  play(): void {
    if (this.destroyed) return
    this.clock.play()
  }

  pause(): void {
    if (this.destroyed) return
    this.clock.pause()
  }

  /** Pauses, moves the clock and redraws on the next step. */
  seek(frame: number): void {
    if (this.destroyed) return
    this.clock.pause()
    this.clock.seek(frame)
    this.redraw = true
  }

  /** Redraws at the new size on the next step. */
  resize(size: number): void {
    if (this.destroyed) return
    this.size = size
    this.redraw = true
  }

  /** One display frame. true = schedule another (playing && an animation exists). */
  step(nowMs: number): boolean {
    if (this.destroyed) return false

    if (this.pending !== null) {
      const json = this.pending
      this.pending = null
      const next = this.engine.create(json)
      if (next) {
        this.anim?.drop()
        this.anim = next
        this.clock.retime(next.frameCount, next.frameRate)
        this.error = null
        this.redraw = true
      } else {
        this.error = ERROR_REJECTED
      }
    }

    if (this.clock.tick(nowMs)) this.redraw = true

    if (this.redraw && this.anim) {
      this.redraw = false
      const rgba = this.anim.render(this.clock.frame, this.size, this.size)
      if (rgba) this.blit(rgba, this.size, this.size)
      else this.error = ERROR_RENDER
    }

    return this.clock.playing && this.anim !== null
  }

  get state(): PlayerState {
    return {
      playing: this.clock.playing,
      frame: Math.floor(this.clock.frame),
      error: this.error,
    }
  }

  /** Drops the animation; later calls are no-ops. */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.pending = null
    this.anim?.drop()
    this.anim = null
  }
}
