// All timings are measured in frames at 60 fps, after visual inspection of 001–107.
// Smoothstep interpolation has zero velocity at extrema. Final 18 frames hold the
// starting pose, so there is no seam between frame 179 and frame 0.
export function curve(keys, frame) {
  if (frame <= keys[0][0]) return keys[0][1]
  for (let j = 1; j < keys.length; j++) {
    const [t, b] = keys[j], [start, a] = keys[j - 1]
    if (frame <= t) { const u = (frame - start) / (t - start), s = u * u * (3 - 2 * u); return a + (b - a) * s }
  }
  return keys.at(-1)[1]
}
const k = (f, values) => curve(values, f)
const pulse = (f, a, b, c) => k(f, [[0, 0], [a, 0], [b, 1], [c, 0], [180, 0]])
export function pose(kind, f) {
  const p = { x: 0, y: 0, headR: 0, bodyR: 0, yaw: 0, pitch: 0, squash: 0, earL: 0, earR: 0,
    eyeL: 1, eyeR: 1, smile: 0,
    pawL: [0, 0], pawR: [0, 0], legL: 0, legR: 0 }
  if (kind === 'neutral') {
    const breath = (1 - Math.cos(f / 180 * Math.PI * 2)) / 2
    p.y = -2 * breath; p.earL = -0.7 * breath; p.earR = 1.2 * breath
    p.eyeL = p.eyeR = 1 - pulse(f, 58, 64, 72)
  }
  if (kind === 'laugh') {
    const a = pulse(f, 12, 38, 68), b = pulse(f, 60, 85, 112), c = pulse(f, 106, 128, 154)
    const active = k(f, [[0, 0], [12, 0], [32, 1], [130, 1], [161, 0], [180, 0]])
    p.y = -24 * a - 18 * b - 11 * c
    p.headR = -5 * a + 4 * b - 3 * c; p.bodyR = 2 * a - 2 * b
    p.squash = 0.045 * a + 0.04 * b + 0.025 * c
    p.yaw = -7 * a + 8 * b - 4 * c; p.pitch = -5 * active
    p.earL = -7 * pulse(f, 25, 48, 78) + 5 * pulse(f, 76, 101, 133)
    p.earR = 11 * pulse(f, 28, 51, 81) - 9 * pulse(f, 79, 102, 140)
    p.smile = active; p.eyeL = p.eyeR = 1 - 0.24 * active
    p.pawL = [31 * active, -88 * active - 18 * a - 13 * b]
    p.pawR = [-31 * active, -84 * active - 13 * a - 18 * b]
    p.legL = 5 * a + 3 * b; p.legR = -5 * a - 3 * b
  }
  if (kind === 'wink') {
    const a = k(f, [[0, 0], [14, 0], [40, 1], [110, 1], [158, 0], [180, 0]])
    const wink = Math.max(pulse(f, 35, 48, 75), 0.9 * pulse(f, 88, 98, 114))
    p.headR = -8 * a; p.bodyR = 2 * a; p.yaw = -18 * a; p.pitch = -3 * a
    p.y = -8 * a; p.earL = -7 * pulse(f, 23, 56, 130); p.earR = 8 * pulse(f, 30, 67, 140)
    p.eyeL = 1 - wink; p.eyeR = 1 - 0.17 * a; p.smile = 0.2 * a
    p.pawL = [49 * a, -113 * a]; p.pawR = [-10 * a, 15 * a]
  }
  if (kind === 'angry') {
    const a = pulse(f, 22, 42, 74), b = pulse(f, 84, 103, 133)
    const active = k(f, [[0, 0], [16, 0], [32, 1], [124, 1], [160, 0], [180, 0]])
    p.y = 15 * a + 9 * b - 9 * pulse(f, 46, 57, 76)
    p.squash = -0.045 * a - 0.035 * b; p.headR = -2 * a + 2 * b
    p.yaw = -8 * a + 7 * b; p.pitch = 8 * active
    p.earL = 5 * pulse(f, 30, 51, 84) + 3 * pulse(f, 94, 115, 145)
    p.earR = -8 * pulse(f, 30, 51, 84) - 5 * pulse(f, 94, 115, 145)
    p.eyeL = p.eyeR = 1 - 0.23 * active - 0.50 * (pulse(f, 44, 52, 66))
    p.pawL = [44 * active, -10 * active - 25 * a]
    p.pawR = [-44 * active, -10 * active - 25 * a]
    p.legL = 5 * active; p.legR = -5 * active
  }
  if (kind === 'yawn') {
    const a = k(f, [[0, 0], [22, 0], [65, 1], [103, 1], [153, 0], [180, 0]])
    p.y = -12 * a; p.squash = 0.06 * a; p.headR = 6 * a; p.bodyR = -2 * a
    p.yaw = 12 * a; p.pitch = -10 * a
    p.earL = -6 * pulse(f, 27, 84, 159); p.earR = 14 * pulse(f, 35, 97, 161)
    p.eyeL = p.eyeR = Math.max(0.04, 1 - 0.94 * a - 0.55 * pulse(f, 18, 25, 34) - 0.9 * pulse(f, 133, 143, 154))
    p.smile = 0.45 * a
    const cover = k(f, [[0, 0], [45, 0], [75, 1], [108, 1], [148, 0], [180, 0]])
    p.pawR = [-84 * cover, -157 * cover]; p.pawL = [-14 * a, -48 * a]
    p.legL = 3 * a; p.legR = -3 * a
  }
  return p
}
