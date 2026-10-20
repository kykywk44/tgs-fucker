// Builds a sticker from a sketch and a motion spec:
//   stickers/<name>/sketch.svg  (named groups = parts; Figma: export SVG with «Include id attribute»;
//                               a variant may name another drawing with "sketch")
//   stickers/<name>/motion.json (MotionSpec, src/core/motion/compile.ts; "sources": { name: "path.tgs" }
//                               are the stickers its effects are copied from, paths from the repo root)
// → exports/<name>.tgs, exports/sheets/<name>.motion.png (12 frames), Telegram checks on stdout.
// The SVG is converted by python-lottie (lottie_convert.py from .venv, set up by scripts/check.sh).
// Usage: node scripts/motion.mjs <name|stickers/name> [...] [--closeup=x,y,size,from-to]

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { Canvas, ROOT, encodePng, engine, framesAt, load } from './lib/sheets.mjs'

const CELL = 192
const CONVERT = join(ROOT, '.venv', 'bin', 'lottie_convert.py')

const { compileMotion } = await load('src/core/motion/compile.ts')
const { readTgs, writeTgs, sizeKb } = await load('src/core/tgs.ts')
const { telegramChecks } = await load('src/core/checks.ts')

if (!existsSync(CONVERT)) {
  console.error('нет .venv/bin/lottie_convert.py — сначала запустите bash scripts/check.sh (ставит python-lottie)')
  process.exit(1)
}
const names = process.argv.slice(2).filter((a) => !a.startsWith('--')).map((a) => basename(a))
if (!names.length) {
  console.error('usage: node scripts/motion.mjs <name> [...]')
  process.exit(1)
}

const eng = await engine()
await mkdir(join(ROOT, 'exports', 'sheets'), { recursive: true })
let failed = false

// 12 frames of the animation, and with --closeup x,y,size,f1-f2 a crop of every frame in a range
const closeupArg = process.argv.find((a) => a.startsWith('--closeup='))
async function sheet(anim, out) {
  const inst = eng.create(JSON.stringify(anim))
  const frames = framesAt(inst.frameCount, 12)
  const s = new Canvas(CELL * 4, (CELL + 20) * 3)
  frames.forEach((frame, i) => {
    const ox = (i % 4) * CELL, oy = Math.floor(i / 4) * (CELL + 20)
    s.draw(inst.render(frame, CELL, CELL).slice(), CELL, ox, oy + 20)
    s.text(`f ${frame}`, ox + 4, oy + 4, [90, 90, 90])
  })
  await writeFile(join(ROOT, 'exports', 'sheets', `${out}.motion.png`), encodePng(s.px, s.width, s.height))
  if (closeupArg) {
    const [x0, y0, size, range] = closeupArg.slice(10).split(',')
    const [f0, f1] = range.split('-').map(Number), list = Array.from({ length: f1 - f0 + 1 }, (_, k) => f0 + k)
    const S = +size, cols = 6, c = new Canvas(S * cols, (S + 16) * Math.ceil(list.length / cols))
    list.forEach((f, i) => {
      const px = inst.render(f, 512, 512).slice(), crop = new Uint8Array(S * S * 4)
      for (let y = 0; y < S; y++) crop.set(px.subarray(((+y0 + y) * 512 + +x0) * 4, ((+y0 + y) * 512 + +x0 + S) * 4), y * S * 4)
      const ox = (i % cols) * S, oy = Math.floor(i / cols) * (S + 16)
      c.draw(crop, S, ox, oy + 16); c.text(`f ${f}`, ox + 4, oy + 3, [200, 0, 0])
    })
    await writeFile(join(ROOT, 'exports', 'sheets', `${out}.closeup.png`), encodePng(c.px, c.width, c.height))
  }
  inst.drop()
}

for (const name of names) {
  const dir = join(ROOT, 'stickers', name)
  try {
    // a variant may use another drawing: "sketch": "sketch-own.svg"
    const bases = new Map()
    const baseFor = async (file = 'sketch.svg') => {
      if (bases.has(file)) return bases.get(file)
      const basePath = join(ROOT, 'exports', `${name}.${basename(file, '.svg')}.base.json`)
      execFileSync(CONVERT, [join(dir, file), basePath, '--fps', '60'], { stdio: 'pipe' })
      const base = JSON.parse(await readFile(basePath, 'utf8'))
      base.w = base.w || 512
      base.h = base.h || 512
      bases.set(file, base)
      return base
    }
    const { sources: paths = {}, variants, ...spec } = JSON.parse(await readFile(join(dir, 'motion.json'), 'utf8'))
    const sources = {}
    for (const [key, path] of Object.entries(paths)) sources[key] = await readTgs(await readFile(join(ROOT, path)))
    // "variants": { "a": { ...overrides } } builds <name>-a.tgs, … ; the first one is also <name>.tgs
    const builds = variants ? Object.entries(variants).map(([v, over]) => [`${name}-${v}`, { ...spec, ...over }]) : [[name, spec]]
    if (variants) builds.push([name, builds[0][1]])
    for (const [out, variantSpec] of builds) {
      const { sketch, ...rest } = variantSpec
      const anim = compileMotion(await baseFor(sketch), rest, sources)
      const bytes = await writeTgs(anim)
      await writeFile(join(ROOT, 'exports', `${out}.tgs`), bytes)
      if (out !== name || !variants) await sheet(anim, out)
      const checks = telegramChecks(anim, bytes.length)
      console.log(`${out}: exports/${out}.tgs ${sizeKb(bytes)} KB${checks.every((c) => c.ok) ? ', проверки Telegram ✓' : ''}`)
      for (const c of checks) if (!c.ok) console.log(`  ✕ ${c.label} — ${c.value} / ${c.limit}`)
      if (!checks.every((c) => c.ok)) failed = true
    }
  } catch (err) {
    failed = true
    console.error(`${name}: ${err.stderr?.toString() || err.message}`)
  }
}
process.exit(failed ? 1 : 0)
