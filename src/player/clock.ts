// Pure playback clock: time comes only from tick(nowMs). No DOM, no timers.
// A render loop calls tick(performance.now()) and reads `frame`.

const MAX_STEP_MS = 100

export class PlaybackClock {
  private _frame = 0
  private _playing = true
  private frameCount = 0
  private frameRate = 0
  private anchor: number | null = null

  get frame(): number {
    return this._frame
  }

  get playing(): boolean {
    return this._playing
  }

  // Keeps the current frame (clamped) and the anchor, so swapping the
  // animation mid-playback does not restart it.
  retime(frameCount: number, frameRate: number): void {
    this.frameCount = frameCount
    this.frameRate = frameRate
    this._frame = clampFrame(this._frame, frameCount)
  }

  play(): void {
    this._playing = true
    this.anchor = null
  }

  pause(): void {
    this._playing = false
  }

  seek(frame: number): void {
    this._frame = clampFrame(frame, this.frameCount)
    this.anchor = null
  }

  // Returns true iff the frame advanced. Elapsed time is capped at 100 ms per
  // tick so a long stall (background tab, debugger) does not jump the frame.
  tick(nowMs: number): boolean {
    if (!this._playing || this.frameCount <= 0 || this.frameRate <= 0) return false
    if (this.anchor === null) {
      this.anchor = nowMs
      return false
    }
    const dt = Math.max(0, Math.min(nowMs - this.anchor, MAX_STEP_MS))
    this.anchor = nowMs
    if (dt > 0) {
      this._frame = (this._frame + (dt * this.frameRate) / 1000) % this.frameCount
    }
    return dt > 0
  }
}

function clampFrame(frame: number, frameCount: number): number {
  if (frameCount <= 0) return 0
  return Math.min(Math.max(frame, 0), frameCount - 1)
}
