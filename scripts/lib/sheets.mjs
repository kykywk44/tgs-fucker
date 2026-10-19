// Shared helpers of the sheet scripts: core TS loading, the tlottie engine,
// a tiny PNG encoder and a canvas with a 3×5 bitmap font.

import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { runnerImport } from 'vite'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

// A src/ TypeScript module, through Vite (no build step, no new dependency).
export async function load(path) {
  return (await runnerImport(join(ROOT, path), { configFile: false, logLevel: 'silent', root: ROOT })).module
}

export async function engine() {
  const { loadEngine } = await load('src/player/engine.ts')
  return loadEngine(await readFile(join(ROOT, 'node_modules', 'tlottie', 'dist', 'core', 'tlottie.wasm')))
}

export const framesAt = (count, n) => Array.from({ length: n }, (_, i) => Math.floor((i * count) / n))

// ---------- PNG ----------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}
export function encodePng(rgba, width, height) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 6, 0, 0, 0], 8) // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------- drawing ----------

export class Canvas {
  constructor(width, height, bg = [255, 255, 255]) {
    this.width = width
    this.height = height
    this.px = new Uint8Array(width * height * 4)
    for (let i = 0; i < width * height; i++) this.px.set([...bg, 255], i * 4)
  }
  set(x, y, [r, g, b], a = 1) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const i = (y * this.width + x) * 4
    this.px[i] = this.px[i] * (1 - a) + r * a
    this.px[i + 1] = this.px[i + 1] * (1 - a) + g * a
    this.px[i + 2] = this.px[i + 2] * (1 - a) + b * a
  }
  // Straight-alpha RGBA image over a checkerboard, at (ox, oy).
  draw(rgba, size, ox, oy, dim = 0) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4
        const check = ((x >> 4) + (y >> 4)) % 2 ? 236 : 250
        const a = rgba[i + 3] / 255
        const mix = (c) => Math.round((c * a + check * (1 - a)) * (1 - dim) + 255 * dim)
        this.set(ox + x, oy + y, [mix(rgba[i]), mix(rgba[i + 1]), mix(rgba[i + 2])])
      }
    }
  }
  rect(x0, y0, w, h, color, a = 1) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, color, a)
  }
  text(str, x, y, color, scale = 2) {
    let cx = x
    for (const ch of str) {
      const glyph = FONT[ch]
      if (glyph) {
        glyph.forEach((row, gy) => {
          for (let gx = 0; gx < 3; gx++) if (row[gx] === '1') this.rect(cx + gx * scale, y + gy * scale, scale, scale, color)
        })
      }
      cx += 4 * scale
    }
  }
}

// 3×5 bitmap digits (and a few letters for headings).
const FONT = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'],
  f: ['011', '100', '110', '100', '100'], ' ': ['000', '000', '000', '000', '000'],
}

// A distinct, readable outline colour per atom.
export function hue(id) {
  const h = (id * 137.508) % 360
  const f = (n) => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (0.55 - 0.45 * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return [f(0), f(8), f(4)]
}

