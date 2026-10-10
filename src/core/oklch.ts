// OKLCH helpers: '#rrggbb' ↔ OKLCH with sRGB gamut handling.
// Maths from Björn Ottosson, "A perceptual color space for image processing".
// Pure TS, no DOM; inputs are never mutated.

export interface Oklch {
  l: number // 0..1
  c: number // ≥ 0
  h: number // degrees, [0, 360)
}

const GAMUT_EPS = 1e-6
const ACHROMATIC_C = 1e-9

const HEX_RE = /^#[0-9a-fA-F]{6}$/

function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
}

function linearRgbToOklab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

function oklabToLinearRgb(L: number, a: number, b: number): { r: number; g: number; b: number } {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  }
}

function oklchToLinearRgb(l: number, c: number, h: number): { r: number; g: number; b: number } {
  const rad = (h * Math.PI) / 180
  return oklabToLinearRgb(l, c * Math.cos(rad), c * Math.sin(rad))
}

function inGamut(lin: { r: number; g: number; b: number }, eps = GAMUT_EPS): boolean {
  const lo = -eps
  const hi = 1 + eps
  return (
    lin.r >= lo && lin.r <= hi &&
    lin.g >= lo && lin.g <= hi &&
    lin.b >= lo && lin.b <= hi
  )
}

function normaliseHue(h: number): number {
  const wrapped = ((h % 360) + 360) % 360
  // Guard against -0 and values that round up to 360 after the modulo.
  return wrapped >= 360 ? 0 : wrapped
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

// Largest chroma at (l, h) that stays in gamut, found by bisection. The sRGB
// cube is convex in OKLab, so in-gamut chroma is a single interval from 0.
// eps is the per-channel slack: the hex path uses GAMUT_EPS, while maxChroma
// uses 0 so that near-black l does not inherit the cube-root amplification.
function fitChroma(l: number, h: number, tolerance: number, eps: number): number {
  if (inGamut(oklchToLinearRgb(l, 0.5, h), eps)) return 0.5
  let lo = 0
  let hi = 0.5
  while (hi - lo > tolerance) {
    const mid = (lo + hi) / 2
    if (inGamut(oklchToLinearRgb(l, mid, h), eps)) lo = mid
    else hi = mid
  }
  return lo
}

export function hexToOklch(hex: string): Oklch {
  if (typeof hex !== 'string' || !HEX_RE.test(hex)) {
    throw new Error(`Malformed hex colour: ${String(hex)}`)
  }
  const r = srgbToLinear(parseInt(hex.slice(1, 3), 16) / 255)
  const g = srgbToLinear(parseInt(hex.slice(3, 5), 16) / 255)
  const b = srgbToLinear(parseInt(hex.slice(5, 7), 16) / 255)
  const lab = linearRgbToOklab(r, g, b)
  const c = Math.sqrt(lab.a * lab.a + lab.b * lab.b)
  const h = c < ACHROMATIC_C ? 0 : normaliseHue((Math.atan2(lab.b, lab.a) * 180) / Math.PI)
  return { l: lab.L, c: c < ACHROMATIC_C ? 0 : c, h }
}

export function oklchToHex(color: Oklch): string {
  const l = clamp01(color.l)
  const h = normaliseHue(color.h)
  let c = Math.max(0, color.c)
  if (!inGamut(oklchToLinearRgb(l, c, h))) {
    c = fitChroma(l, h, 1e-7, GAMUT_EPS)
  }
  const lin = oklchToLinearRgb(l, c, h)
  const channel = (v: number) => {
    const byte = Math.round(clamp01(linearToSrgb(clamp01(v))) * 255)
    return byte.toString(16).padStart(2, '0')
  }
  return `#${channel(lin.r)}${channel(lin.g)}${channel(lin.b)}`
}

export function maxChroma(l: number, h: number): number {
  return fitChroma(clamp01(l), normaliseHue(h), 1e-5, 0)
}
