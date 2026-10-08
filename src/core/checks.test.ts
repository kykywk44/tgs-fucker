import { describe, expect, it } from 'vitest'
import { telegramChecks, type Check, type CheckId } from './checks'
import type { Lottie } from './tgs'

// A sticker that passes every Telegram rule; each test overrides one field.
function anim(overrides: Partial<Lottie> = {}): Lottie {
  return { v: '5.7.4', fr: 60, ip: 0, op: 180, w: 512, h: 512, layers: [], ...overrides }
}

function check(id: CheckId, input: Lottie, exportBytes = 0): Check {
  const found = telegramChecks(input, exportBytes).find((c) => c.id === id)
  if (!found) throw new Error(`no ${id} check`)
  return found
}

describe('telegramChecks', () => {
  it('returns four checks in canonical order', () => {
    expect(telegramChecks(anim(), 0).map((c) => c.id)).toEqual([
      'canvas',
      'fps',
      'duration',
      'size',
    ])
  })

  it('uses the exact Russian labels', () => {
    expect(telegramChecks(anim(), 0).map((c) => c.label)).toEqual([
      'Размер холста',
      'Частота кадров',
      'Длительность',
      'Размер файла',
    ])
  })

  it('passes every check for a compliant sticker', () => {
    const checks = telegramChecks(anim(), 24474)
    expect(checks.every((c) => c.ok)).toBe(true)
  })

  describe('canvas (512×512)', () => {
    it('passes at exactly 512×512', () => {
      expect(check('canvas', anim({ w: 512, h: 512 }))).toEqual({
        id: 'canvas',
        label: 'Размер холста',
        value: '512×512',
        limit: '512×512',
        ok: true,
      })
    })

    it('fails at 511 wide', () => {
      expect(check('canvas', anim({ w: 511, h: 512 }))).toEqual({
        id: 'canvas',
        label: 'Размер холста',
        value: '511×512',
        limit: '512×512',
        ok: false,
      })
    })

    it('fails at 511 high', () => {
      expect(check('canvas', anim({ w: 512, h: 511 }))).toEqual({
        id: 'canvas',
        label: 'Размер холста',
        value: '512×511',
        limit: '512×512',
        ok: false,
      })
    })
  })

  describe('fps (60)', () => {
    it('passes at exactly 60 fps', () => {
      expect(check('fps', anim({ fr: 60 }))).toEqual({
        id: 'fps',
        label: 'Частота кадров',
        value: '60 fps',
        limit: '60 fps',
        ok: true,
      })
    })

    it('fails at 30 fps', () => {
      expect(check('fps', anim({ fr: 30 }))).toEqual({
        id: 'fps',
        label: 'Частота кадров',
        value: '30 fps',
        limit: '60 fps',
        ok: false,
      })
    })

    it('prints a fractional rate as-is', () => {
      expect(check('fps', anim({ fr: 29.97 })).value).toBe('29.97 fps')
    })
  })

  describe('duration (3 с)', () => {
    it('passes at exactly 180 frames at 60 fps', () => {
      expect(check('duration', anim({ fr: 60, ip: 0, op: 180 }))).toEqual({
        id: 'duration',
        label: 'Длительность',
        value: '3.0 с',
        limit: '3 с',
        ok: true,
      })
    })

    it('fails at 181 frames at 60 fps', () => {
      // The value rounds to one decimal, so 181 frames still reads "3.0 с";
      // the verdict is decided on the frame count.
      expect(check('duration', anim({ fr: 60, ip: 0, op: 181 }))).toEqual({
        id: 'duration',
        label: 'Длительность',
        value: '3.0 с',
        limit: '3 с',
        ok: false,
      })
    })

    it('measures from ip to op, not from zero', () => {
      expect(check('duration', anim({ fr: 60, ip: 10, op: 190 })).ok).toBe(true)
      expect(check('duration', anim({ fr: 60, ip: 10, op: 191 })).ok).toBe(false)
    })

    it('prints seconds with one decimal', () => {
      expect(check('duration', anim({ fr: 60, ip: 0, op: 150 })).value).toBe('2.5 с')
    })

    it('uses the frame rate for the 3 s budget (30 fps: 90 frames ok, 91 not)', () => {
      expect(check('duration', anim({ fr: 30, ip: 0, op: 90 })).ok).toBe(true)
      expect(check('duration', anim({ fr: 30, ip: 0, op: 91 })).ok).toBe(false)
    })

    it.each([0, -60, NaN, Infinity])('shows a dash and fails when fr is %s', (fr) => {
      expect(check('duration', anim({ fr }))).toEqual({
        id: 'duration',
        label: 'Длительность',
        value: '—',
        limit: '3 с',
        ok: false,
      })
    })
  })

  describe('size (64 KB)', () => {
    it('passes at exactly 65536 bytes', () => {
      expect(check('size', anim(), 65536)).toEqual({
        id: 'size',
        label: 'Размер файла',
        value: '64.0 KB',
        limit: '64 KB',
        ok: true,
      })
    })

    it('fails at 65537 bytes', () => {
      // 65537 bytes rounds to "64.0 KB" on screen; the verdict uses raw bytes.
      expect(check('size', anim(), 65537)).toEqual({
        id: 'size',
        label: 'Размер файла',
        value: '64.0 KB',
        limit: '64 KB',
        ok: false,
      })
    })

    it('prints KB with one decimal', () => {
      expect(check('size', anim(), 24474).value).toBe('23.9 KB')
      expect(check('size', anim(), 0).value).toBe('0.0 KB')
    })
  })

  it('does not mutate its inputs', () => {
    const input = anim({ fr: 0, layers: [{ ty: 4 }] })
    const snapshot = structuredClone(input)
    telegramChecks(input, 70000)
    expect(input).toEqual(snapshot)
  })
})
