// Measures an inscription's own motion for a profile's TextSpec (plan,
// Iteration 4): the per-keyframe homographies (face kf 0 → face / shadow kf k),
// their largest residual and the cap box of the letters at keyframe 0.
// Read-only; prints a TypeScript snippet to paste into the profile.
//
//   node scripts/text-motion.mjs samples/NewSticker.tgs '{"layer":"NEW","path":["Group 1"]}'

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { load, ROOT } from './lib/sheets.mjs'

const [file, selectorJson] = process.argv.slice(2)
if (!file || !selectorJson) {
  console.error("usage: node scripts/text-motion.mjs <sticker.tgs> '<container selector JSON>'")
  process.exit(2)
}
const { readTgs } = await load('src/core/tgs.ts')
const { measureTextMotion } = await load('src/core/text.ts')

const anim = await readTgs(new Uint8Array(await readFile(resolve(ROOT, file))))
const { face, shadow, maxError, box } = measureTextMotion(anim, JSON.parse(selectorJson))
const fmt = (m) => `  [${m.map((v) => Number(v.toPrecision(12))).join(', ')}],`
const r2 = (v) => Math.round(v * 100) / 100
console.log(`// ${face.length} keyframes, largest residual ${maxError.toFixed(4)} px`)
console.log(`// box: { x0: ${r2(box.x0)}, y0: ${r2(box.y0)}, x1: ${r2(box.x1)}, y1: ${r2(box.y1)} }`)
console.log('const FACE_MOTION: Mat3[] = [')
face.forEach((m) => console.log(fmt(m)))
console.log(']\nconst SHADOW_MOTION: Mat3[] = [')
shadow.forEach((m) => console.log(fmt(m)))
console.log(']')
