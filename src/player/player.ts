// DOM-free preview controller: wasm engine + playback clock. A Web Worker
// (player.worker.ts) is thin glue around it. `ToWorker` mentions OffscreenCanvas
// as a type only; nothing here touches a DOM API at runtime.
//
// Loads are coalesced: `load` only stores the JSON, and `step` builds the
// latest one. A new animation replaces the old one without touching the clock's
// frame or play state; a rejected one leaves the old animation running.
//
// Picking: `pick(x, y)` names the atom under a point of the frame on screen:
// the topmost solid atom there, else the topmost translucent one (a glass
// highlight or a glow never hides the body under it). The two ID maps of the
// current animation (src/core/idmap.ts) are built on the first pick and
// rendered without antialiasing at PICK_SIZE; the last rendered frame of each
// is kept, so clicks on a paused frame cost at most two renders in all.

import { findAtoms } from '../core/atoms'
import { idColorize, pickAt } from '../core/idmap'
import type { Lottie } from '../core/tgs'
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
  // x, y: fractions of the canvas (0 ≤ x, y < 1); `id` is echoed in the reply.
  | { type: 'pick'; id: number; x: number; y: number }

export type FromWorker =
  | (PlayerState & { type: 'state'; seq: number })
  | { type: 'pick'; id: number; atom: number | null }

/** Size of the ID render used for picking: the stage's CSS size, one pixel per CSS pixel. */
export const PICK_SIZE = 512

interface PickMap {
  anim: Animation
  atoms: number
  frame: number | null
  rgba: Uint8ClampedArray | null
}

const ERROR_REJECTED = 'движок не принял анимацию'
const ERROR_RENDER = 'не удалось отрисовать кадр'

export class PreviewPlayer {
  private readonly clock = new PlaybackClock()
  private readonly engine: Engine
  private readonly blit: Blit
  private size: number
  private anim: Animation | null = null
  private json: string | null = null // the JSON `anim` was built from
  private pending: string | null = null
  private pickers: PickMap[] | null = null // solid map, then translucent map
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
        this.dropPicker()
        this.anim = next
        this.json = json
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

  /** The atom (findAtoms id) drawn on top at (x, y) of the current frame, or null: nothing
   *  there, no animation yet, or the ID map could not be built. A load still pending is not
   *  seen until the next step builds it. */
  pick(x: number, y: number): number | null {
    if (this.destroyed || !this.anim || this.json === null) return null
    if (!this.pickers) {
      let parsed: Lottie
      try {
        parsed = JSON.parse(this.json) as Lottie
      } catch {
        return null
      }
      const atoms = findAtoms(parsed).length
      const maps: PickMap[] = []
      for (const only of ['solid', 'translucent'] as const) {
        const anim = this.engine.create(JSON.stringify(idColorize(parsed, { only })))
        if (!anim) {
          for (const map of maps) map.anim.drop()
          return null
        }
        maps.push({ anim, atoms, frame: null, rgba: null })
      }
      this.pickers = maps
    }
    const frame = this.clock.frame
    for (const map of this.pickers) {
      if (map.frame !== frame || !map.rgba) {
        const rgba = map.anim.render(frame, PICK_SIZE, PICK_SIZE, false)
        if (!rgba) return null
        map.rgba = rgba.slice() // a view into wasm memory: keep a copy
        map.frame = frame
      }
      const atom = pickAt(map.rgba, PICK_SIZE, x, y, map.atoms)
      if (atom !== null) return atom
    }
    return null
  }

  private dropPicker(): void {
    for (const map of this.pickers ?? []) map.anim.drop()
    this.pickers = null
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
    this.dropPicker()
  }
}
