import type { EaseName } from './easing'

// Motion presets: each turns a few parameters into keyframed channel offsets. Channels:
// x, y, r — added to the rest value (px, px, degrees); sx, sy, o — multipliers in percent
// (100 = rest); show — opacity of a hidden part (0 = rest); yaw, pitch — pseudo-3D turn of
// the part's drawing (degrees, path morph). Every preset starts and ends at rest, so a
// sticker loops seamlessly.
// Key times are seconds from the track's start; `ease` shapes the segment towards the next key.

export type Channel = 'x' | 'y' | 'r' | 'sx' | 'sy' | 'o' | 'show' | 'yaw' | 'pitch'
export const CHANNELS: Channel[] = ['x', 'y', 'r', 'sx', 'sy', 'o', 'show', 'yaw', 'pitch']
export const MULTIPLIER: Record<Channel, boolean> = { x: false, y: false, r: false, sx: true, sy: true, o: true, show: false, yaw: false, pitch: false }
export const restOf = (c: Channel) => (MULTIPLIER[c] ? 100 : 0)
export interface Key { t: number; v: number; ease?: EaseName }
export type Curves = Partial<Record<Channel, Key[]>>
export type PivotName = 'center' | 'bottom' | 'top' | 'left' | 'right'

interface Preset {
  pivot: PivotName // where the part turns / squashes when the rig gives no pivot
  len: (p: Params, duration: number) => number
  curves: (p: Params, len: number) => Curves
}
type Params = Record<string, unknown>

const num = (p: Params, key: string, fallback: number): number => {
  const v = p[key]
  if (v === undefined) return fallback
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`параметр ${key}: ожидается число`)
  return v
}

// Same key times for both scale axes, values given as [sx, sy] pairs.
function scale(times: number[], pairs: [number, number][], eases: EaseName[]): Curves {
  return {
    sx: times.map((t, n) => ({ t, v: pairs[n][0], ease: eases[n] })),
    sy: times.map((t, n) => ({ t, v: pairs[n][1], ease: eases[n] })),
  }
}

export const PRESETS: Record<string, Preset> = {
  // Jump with anticipation, stretch on take-off, slow apex, squash on landing and a settle.
  bounce: {
    pivot: 'bottom',
    len: (p) => num(p, 'len', 1),
    curves: (p, len) => {
      const h = num(p, 'height', 40), q = num(p, 'squash', 0.15) * 100
      const T = (f: number) => f * len
      return {
        y: [
          { t: 0, v: 0 }, { t: T(0.16), v: 0, ease: 'out' }, { t: T(0.46), v: -h, ease: 'in' },
          { t: T(0.72), v: 0 }, { t: T(1), v: 0 },
        ],
        ...scale(
          [0, T(0.16), T(0.26), T(0.46), T(0.68), T(0.76), T(0.88), T(1)],
          [[100, 100], [100 + q * 0.6, 100 - q], [100 - q * 0.5, 100 + q * 0.7], [100, 100],
            [100 - q * 0.3, 100 + q * 0.4], [100 + q * 0.8, 100 - q * 0.8], [100 - q * 0.15, 100 + q * 0.2], [100, 100]],
          ['inOut', 'out', 'inOut', 'in', 'out', 'inOut', 'inOut', 'inOut'],
        ),
      }
    },
  },
  // Gentle hover up and down.
  float: {
    pivot: 'center',
    len: (p, d) => num(p, 'len', d),
    curves: (p, len) => {
      const a = num(p, 'amp', 8)
      return { y: [{ t: 0, v: 0, ease: 'inOut' }, { t: len / 2, v: -a, ease: 'inOut' }, { t: len, v: 0 }] }
    },
  },
  // Rock left and right around the pivot.
  sway: {
    pivot: 'bottom',
    len: (p, d) => num(p, 'len', d),
    curves: (p, len) => {
      const a = num(p, 'angle', 8)
      return {
        r: [
          { t: 0, v: 0, ease: 'out' }, { t: len / 4, v: a, ease: 'inOut' }, { t: (3 * len) / 4, v: -a, ease: 'in' },
          { t: len, v: 0 },
        ],
      }
    },
  },
  // A beat: grow fast, overshoot back, settle.
  pulse: {
    pivot: 'center',
    len: (p) => num(p, 'len', 0.6),
    curves: (p, len) => {
      const a = num(p, 'amount', 0.08) * 100
      return scale(
        [0, len * 0.3, len * 0.65, len],
        [[100, 100], [100 + a, 100 + a], [100 - a * 0.35, 100 - a * 0.35], [100, 100]],
        ['out', 'inOut', 'inOut', 'inOut'],
      )
    },
  },
  // Accent pop (like the NEW button): 100 → peak → small undershoot → 100.
  pop: {
    pivot: 'center',
    len: (p) => num(p, 'len', 0.5),
    curves: (p, len) => {
      const peak = num(p, 'peak', 118)
      return scale(
        [0, len * 0.35, len * 0.7, len],
        [[100, 100], [peak, peak], [100 - (peak - 100) * 0.25, 100 - (peak - 100) * 0.25], [100, 100]],
        ['backOut', 'inOut', 'inOut', 'inOut'],
      )
    },
  },
  // Eyelid blink: squash vertically to almost nothing and back.
  blink: {
    pivot: 'center',
    len: (p) => num(p, 'len', 0.22),
    curves: (_p, len) => ({
      sy: [
        { t: 0, v: 100, ease: 'in' }, { t: len * 0.35, v: 8 }, { t: len * 0.5, v: 8, ease: 'out' }, { t: len, v: 100 },
      ],
    }),
  },
  // Decaying shake (rotation).
  shake: {
    pivot: 'center',
    len: (p) => num(p, 'len', 0.5),
    curves: (p, len) => {
      const a = num(p, 'angle', 6)
      const amps = [0, a, -a * 0.8, a * 0.55, -a * 0.3, a * 0.1, 0]
      return { r: amps.map((v, n) => ({ t: (len * n) / (amps.length - 1), v, ease: 'inOut' as const })) }
    },
  },
  // A hit and a settle on any channels given as parameters (r: -20, x: -14, show: 100, yaw: 12 …):
  // rest → peak in `attack`, held for `hold`, back to rest in `release`. Recoil, slide blowback,
  // trigger pull, a one-frame light flash and a turn in perspective are all kicks.
  kick: {
    pivot: 'center',
    len: (p) => num(p, 'attack', 0.025) + num(p, 'hold', 0) + num(p, 'release', 0.15),
    curves: (p) => {
      const a = num(p, 'attack', 0.025), h = num(p, 'hold', 0), r = num(p, 'release', 0.15)
      const attackEase = (p.attackEase as EaseName | undefined) ?? 'out'
      const releaseEase = (p.releaseEase as EaseName | undefined) ?? 'release'
      const out: Curves = {}
      for (const c of CHANNELS) {
        if (p[c] === undefined) continue
        const peak = num(p, c, 0), rest = restOf(c)
        out[c] = [{ t: 0, v: rest, ease: attackEase }, { t: a, v: peak, ease: h > 0 ? 'linear' : releaseEase },
          ...(h > 0 ? [{ t: a + h, v: peak, ease: releaseEase }] : []), { t: a + h + r, v: rest }]
      }
      if (!Object.keys(out).length) throw new Error('kick: не задан ни один канал (x, y, r, sx, sy, o, show, yaw, pitch)')
      return out
    },
  },
  // Thrown object (a shell casing): shown at the start, flies along a parabola while spinning,
  // hidden at the end. vx, vy in px/s (vy < 0 = up), gravity px/s², spin °/s.
  eject: {
    pivot: 'center',
    len: (p) => num(p, 'len', 0.6),
    curves: (p, len) => {
      const vx = num(p, 'vx', 260), vy = num(p, 'vy', -520), g = num(p, 'gravity', 2400), spin = num(p, 'spin', 900)
      const y = (t: number) => vy * t + (g * t * t) / 2
      const apex = Math.min(Math.max(-vy / g, 0.01), len - 0.01)
      return {
        x: [{ t: 0, v: 0, ease: 'linear' }, { t: len, v: vx * len }],
        y: [{ t: 0, v: 0, ease: 'quadOut' }, { t: apex, v: y(apex), ease: 'quadIn' }, { t: len, v: y(len) }],
        r: [{ t: 0, v: 0, ease: 'linear' }, { t: len, v: spin * len }],
        show: [{ t: 0, v: 100, ease: 'linear' }, { t: len - 0.001, v: 100, ease: 'linear' }, { t: len, v: 0 }],
      }
    },
  },
  // Full turns, constant speed (360° looks the same as 0°, so the loop is seamless).
  spin: {
    pivot: 'center',
    len: (p, d) => num(p, 'len', d),
    curves: (p, len) => ({ r: [{ t: 0, v: 0, ease: 'linear' }, { t: len, v: 360 * num(p, 'turns', 1) }] }),
  },
}

export function presetNames(): string[] {
  return [...Object.keys(PRESETS), 'follow']
}
