#!/usr/bin/env node
// Dev only: bake Roboto Black (weight 900) outlines into src/core/glyphs/roboto-900.json.
//
// Usage: npm run glyphs
//
// The app never imports opentype.js or @fontsource/roboto (both are devDependencies); it reads the
// generated JSON through src/core/glyphs.ts. Output is deterministic: characters are written in
// CHARSET order, object keys in a fixed order, and all coordinates are integers, so re-running the
// script on the same dependency versions yields a byte-identical file.
//
// Contour convention is Lottie's: closed, y axis DOWN (font y is negated), `v` absolute vertices,
// `i`/`o` in-/out-tangents relative to their vertex. Quadratic segments are elevated to cubic
// exactly (C1 = P0 + 2/3 (Q - P0), C2 = P1 + 2/3 (Q - P1)); lines get zero handles.

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import opentype from 'opentype.js'

const require = createRequire(import.meta.url)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'src', 'core', 'glyphs')

const LICENSE_PATH = require.resolve('@fontsource/roboto/LICENSE')
const FONT_DIR = join(dirname(LICENSE_PATH), 'files')
// A character is taken from the first font that has it.
const FONT_FILES = ['roboto-latin-900-normal.woff', 'roboto-cyrillic-900-normal.woff']

const CHARSET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ' +
  '0123456789' +
  '!?.,:;-+&\'"*#%@()' +
  ' '
const CHARS = [...CHARSET]
if (new Set(CHARS).size !== CHARS.length) throw new Error('CHARSET has duplicate characters')

// opentype.js parses WOFF 1.0 directly (it unwraps the compressed tables itself), so no manual
// zlib unwrapping is needed.
function loadFont(name) {
  const buf = readFileSync(join(FONT_DIR, name))
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
}

// Math.round, but never -0 (y negation turns 0 into -0).
const int = (n) => Math.round(n) || 0

/**
 * opentype.js path commands (font units, y up) -> Lottie contours (y down, integers).
 * All absolute points are rounded to integers first; tangents are then taken between the rounded
 * points, so they are integers too and the rounded outline stays self-consistent.
 */
function toContours(commands, label) {
  const contours = []
  let vs = null // rounded absolute vertices
  let ins = null // rounded absolute in-control per vertex (or null = straight)
  let outs = null // rounded absolute out-control per vertex (or null = straight)
  let cur = null // exact current point (y down)

  const finish = () => {
    if (!vs) return
    // The closing segment ends on the start vertex: drop the duplicate vertex but keep its
    // in-handle on the start vertex.
    const last = vs.length - 1
    if (last > 0 && vs[last][0] === vs[0][0] && vs[last][1] === vs[0][1]) {
      if (ins[last]) ins[0] = ins[last]
      vs.pop()
      ins.pop()
      outs.pop()
    }
    if (vs.length < 3) throw new Error(`${label}: degenerate contour with ${vs.length} vertices`)
    const rel = (ctrl, k) => (ctrl ? [ctrl[0] - vs[k][0], ctrl[1] - vs[k][1]] : [0, 0])
    contours.push({
      v: vs,
      i: ins.map((c, k) => rel(c, k)),
      o: outs.map((c, k) => rel(c, k)),
    })
    vs = ins = outs = cur = null
  }
  const pt = (x, y) => [x, -y]
  const round = (p) => [int(p[0]), int(p[1])]

  for (const c of commands) {
    if (c.type === 'M') {
      finish()
      cur = pt(c.x, c.y)
      vs = [round(cur)]
      ins = [null]
      outs = [null]
    } else if (c.type === 'L') {
      const end = round(pt(c.x, c.y))
      const prev = vs[vs.length - 1]
      // Roboto repeats points (zero-length lines); they carry no geometry, so skip them.
      if (end[0] !== prev[0] || end[1] !== prev[1]) {
        vs.push(end)
        ins.push(null)
        outs.push(null)
      }
      cur = pt(c.x, c.y)
    } else if (c.type === 'Q' || c.type === 'C') {
      const end = pt(c.x, c.y)
      let c1
      let c2
      if (c.type === 'Q') {
        const q = pt(c.x1, c.y1)
        c1 = [cur[0] + ((q[0] - cur[0]) * 2) / 3, cur[1] + ((q[1] - cur[1]) * 2) / 3]
        c2 = [end[0] + ((q[0] - end[0]) * 2) / 3, end[1] + ((q[1] - end[1]) * 2) / 3]
      } else {
        c1 = pt(c.x1, c.y1)
        c2 = pt(c.x2, c.y2)
      }
      outs[outs.length - 1] = round(c1)
      vs.push(round(end))
      ins.push(round(c2))
      outs.push(null)
      cur = end
    } else if (c.type === 'Z') {
      finish()
    } else {
      throw new Error(`${label}: unsupported path command ${c.type}`)
    }
  }
  finish()
  return contours
}

const fonts = FONT_FILES.map(loadFont)
for (const f of fonts) {
  if (f.unitsPerEm !== fonts[0].unitsPerEm) throw new Error('fonts disagree on unitsPerEm')
  if (f.tables.os2.sCapHeight !== fonts[0].tables.os2.sCapHeight) {
    throw new Error('fonts disagree on capHeight')
  }
}
const unitsPerEm = fonts[0].unitsPerEm
const capHeight = fonts[0].tables.os2.sCapHeight

const source = new Map() // char -> { font, glyph }
const glyphs = {}
for (const ch of CHARS) {
  const font = fonts.find((f) => f.hasChar(ch) && f.charToGlyph(ch).index !== 0)
  if (!font) throw new Error(`no font has U+${ch.codePointAt(0).toString(16).toUpperCase()} "${ch}"`)
  const glyph = font.charToGlyph(ch)
  source.set(ch, { font, glyph })
  glyphs[ch] = {
    advance: int(glyph.advanceWidth),
    contours: toContours(glyph.path.commands, `"${ch}"`),
  }
  if (ch !== ' ' && glyphs[ch].contours.length === 0) throw new Error(`"${ch}" has no contours`)
}

// Non-zero kerning for pairs drawn from the same font (GPOS pair adjustment, xAdvance).
const kerning = {}
for (const a of CHARS) {
  for (const b of CHARS) {
    const sa = source.get(a)
    const sb = source.get(b)
    if (sa.font !== sb.font) continue
    const k = int(sa.font.getKerningValue(sa.glyph, sb.glyph))
    if (k !== 0) kerning[a + b] = k
  }
}

// Compact, diff-friendly JSON: one character / kerning pair per line, fixed key order.
const json = (x) => JSON.stringify(x)
const lines = ['{', `  "unitsPerEm": ${unitsPerEm},`, `  "capHeight": ${capHeight},`, '  "glyphs": {']
CHARS.forEach((ch, n) => {
  const g = glyphs[ch]
  const contours = g.contours.map((c) => `{"v":${json(c.v)},"i":${json(c.i)},"o":${json(c.o)}}`)
  const comma = n < CHARS.length - 1 ? ',' : ''
  lines.push(`    ${json(ch)}: {"advance":${g.advance},"contours":[${contours.join(',')}]}${comma}`)
})
lines.push('  },', '  "kerning": {')
const pairs = Object.keys(kerning)
pairs.forEach((p, n) => lines.push(`    ${json(p)}: ${kerning[p]}${n < pairs.length - 1 ? ',' : ''}`))
lines.push('  }', '}', '')

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(join(OUT_DIR, 'roboto-900.json'), lines.join('\n'))
copyFileSync(LICENSE_PATH, join(OUT_DIR, 'OFL.txt'))

const vertexCounts = CHARS.map((ch) => glyphs[ch].contours.reduce((s, c) => s + c.v.length, 0))
console.log(
  `roboto-900.json: ${CHARS.length} glyphs, ${pairs.length} kerning pairs, ` +
    `${vertexCounts.reduce((s, n) => s + n, 0)} vertices (max ${Math.max(...vertexCounts)} per glyph)`,
)
