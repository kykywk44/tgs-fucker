import { describe, expect, it } from 'vitest'
import { PlaybackClock } from './clock'

describe('PlaybackClock', () => {
  it('starts at frame 0 and playing; tick is false before retime', () => {
    const clock = new PlaybackClock()
    expect(clock.frame).toBe(0)
    expect(clock.playing).toBe(true)
    expect(clock.tick(1000)).toBe(false)
    expect(clock.tick(1100)).toBe(false)
    expect(clock.frame).toBe(0)
  })

  it('advances by elapsed time after retime, clamping dt to 100 ms', () => {
    const clock = new PlaybackClock()
    clock.retime(180, 60)
    expect(clock.tick(1000)).toBe(false) // only sets the anchor
    expect(clock.tick(1100)).toBe(true)
    expect(clock.frame).toBeCloseTo(6)
    expect(clock.tick(1150)).toBe(true)
    expect(clock.frame).toBeCloseTo(9)
    expect(clock.tick(6000)).toBe(true) // dt clamped to 100 ms
    expect(clock.frame).toBeCloseTo(15)
  })

  it('wraps around the frame count', () => {
    const clock = new PlaybackClock()
    clock.retime(180, 60)
    clock.seek(179)
    expect(clock.tick(1000)).toBe(false)
    expect(clock.tick(1050)).toBe(true)
    expect(clock.frame).toBeCloseTo(2)
  })

  it('pause keeps the frame and stops ticking; play resumes without a jump', () => {
    const clock = new PlaybackClock()
    clock.retime(180, 60)
    clock.tick(1000)
    clock.tick(1100)
    const held = clock.frame
    clock.pause()
    expect(clock.playing).toBe(false)
    expect(clock.tick(1200)).toBe(false)
    expect(clock.frame).toBe(held)
    clock.play()
    expect(clock.playing).toBe(true)
    expect(clock.tick(6100)).toBe(false) // only sets the anchor, no jump
    expect(clock.frame).toBe(held)
    expect(clock.tick(6200)).toBe(true)
    expect(clock.frame).toBeCloseTo(held + 6)
  })

  it('seek clamps to [0, frameCount-1] and keeps playing unchanged', () => {
    const clock = new PlaybackClock()
    clock.retime(180, 60)
    clock.seek(-5)
    expect(clock.frame).toBe(0)
    clock.seek(500)
    expect(clock.frame).toBe(179)
    clock.seek(12.5)
    expect(clock.frame).toBe(12.5)
    expect(clock.playing).toBe(true)
    clock.pause()
    clock.seek(3)
    expect(clock.playing).toBe(false)
  })

  it('retime keeps the frame when it fits, clamps it when it does not', () => {
    const clock = new PlaybackClock()
    clock.retime(180, 60)
    clock.seek(42.5)
    clock.retime(180, 60)
    expect(clock.frame).toBe(42.5)
    clock.retime(30, 60)
    expect(clock.frame).toBe(29)
    clock.retime(0, 60)
    expect(clock.frame).toBe(0)
    expect(clock.tick(1000)).toBe(false)
    expect(clock.tick(1100)).toBe(false)
    expect(clock.frame).toBe(0)
  })

  it('tick is false when frameRate is not positive', () => {
    const clock = new PlaybackClock()
    clock.retime(180, 0)
    expect(clock.tick(1000)).toBe(false)
    expect(clock.tick(1100)).toBe(false)
    expect(clock.frame).toBe(0)
  })

  it('a backwards clock step does not move the frame backwards', () => {
    const clock = new PlaybackClock()
    clock.retime(180, 60)
    clock.seek(10)
    clock.tick(5000)
    expect(clock.tick(4000)).toBe(false)
    expect(clock.frame).toBe(10)
    expect(clock.tick(4100)).toBe(true)
    expect(clock.frame).toBeCloseTo(16)
  })
})
