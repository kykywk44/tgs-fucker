// 🧑‍💻 in the 👤 manner: technologist (200) restyled like `technologist/`, then its head (an oval
// with separate ears) is replaced by the head of packs/blue/base/bust.tgs — one outline with the
// ears drawn into it and the neck under them (dark outline down the neck), a light rim over the
// crown. The new head hangs from the old HEAD layer (so it moves as before) and lies under the
// shirt, which covers the end of the neck.
// Usage: node packs/blue/technologist-bust/build.mjs → exports/blue/technologist-bust.tgs, exports/sheets/blue-technologist-bust.png

import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = join(import.meta.dirname, '..', '..', '..')
const { Canvas, encodePng, engine, framesAt, load } = await import(pathToFileURL(join(ROOT, 'scripts', 'lib', 'sheets.mjs')).href)
const { readTgs, writeTgs, sizeKb } = await load('src/core/tgs.ts')
const { telegramChecks } = await load('src/core/checks.ts')
const cfg = JSON.parse(await readFile(join(import.meta.dirname, 'head.json'), 'utf8'))

execFileSync(process.execPath, [join(ROOT, 'scripts', 'restyle.mjs'), 'blue/technologist-bust'], { stdio: 'ignore' })
const OUT = join(ROOT, 'exports', 'blue', 'technologist-bust.tgs')
const anim = await readTgs(new Uint8Array(await readFile(OUT)))
const bust = await readTgs(new Uint8Array(await readFile(join(ROOT, 'packs', 'blue', 'base', 'bust.tgs'))))

const byName = (layers, nm) => layers.find((l) => l.nm === nm)
const head = byName(anim.layers, 'HEAD')
const body = byName(anim.layers, 'BODY R')
const pathsIn = (list) => list.flatMap((it) => (it.ty === 'sh' ? [it] : it.ty === 'gr' ? pathsIn(it.it) : []))
const shapeOf = (sh) => (sh.ks.a ? sh.ks.k[0].s[0] : sh.ks.k)

// bust space (its «silhouette» layer) → HEAD space: the bust's head width at the ears onto the
// oval's, crowns level
const { scale: K, crown, axis, from } = cfg
const map = (v) => [(v[0] - from.axis) * K + axis, (v[1] - from.crown) * K + crown]
const mapPath = (p, keep = p.v.map((_, i) => i)) => ({
  c: p.c,
  v: keep.map((i) => map(p.v[i])),
  i: keep.map((i) => p.i[i].map((x) => x * K)),
  o: keep.map((i) => p.o[i].map((x) => x * K)),
})

// head and neck: the silhouette between the two neck bottoms, carried straight down under the shirt
const sil = shapeOf(pathsIn(byName(bust.layers, 'silhouette').shapes)[0])
const outline = mapPath(sil, cfg.keep)
outline.c = true
const [l, r] = [outline.v[outline.v.length - 1], outline.v[0]]
outline.v.push([l[0], cfg.neck_end], [r[0], cfg.neck_end])
outline.i.push([0, 0], [0, 0])
outline.o.push([0, 0], [0, 0])
// the rim over the crown, ear to ear
const rim = mapPath(shapeOf(pathsIn(byName(bust.layers, 'top').shapes)[0]))

// the restyled face's body gradient and outline stroke: the new head draws in HEAD's own space
const first = (list, ty) => { for (const it of list) { if (it.ty === ty) return it; if (it.ty === 'gr') { const f = first(it.it, ty); if (f) return f } } }
const faceFill = first(head.shapes, 'gf')
const outlineStroke = first(head.shapes, 'st')
const TR = { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
const newHead = {
  ty: 4, nm: 'Bust head', ind: Math.max(...anim.layers.map((x) => x.ind ?? 0)) + 1, parent: head.ind,
  ip: head.ip, op: head.op, st: 0, sr: 1, ao: 0, bm: 0,
  ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [0, 0, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } },
  shapes: [
    { ty: 'gr', nm: 'Rim', it: [{ ty: 'sh', ks: { a: 0, k: rim } }, { ...structuredClone(outlineStroke), c: { a: 0, k: [...rgb(cfg.rim), 1] }, lc: 2, lj: 2 }, TR] },
    { ty: 'gr', nm: 'Head', it: [{ ty: 'sh', ks: { a: 0, k: outline } }, { ...structuredClone(outlineStroke), lc: 2, lj: 2 }, structuredClone(faceFill), TR] },
  ],
}

// out: the oval head, the separate ears and the old neck
head.shapes = []
anim.layers = anim.layers.filter((x) => x.nm !== 'Ears')
for (const nm of cfg.drop) {
  const [layer, ...path] = nm.split(' > ')
  const owner = path.slice(0, -1).reduce((list, g) => list.find((it) => it.nm === g).it, byName(anim.layers, layer).shapes)
  const at = owner.findIndex((it) => it.nm === path[path.length - 1])
  owner.splice(at, 1)
}
anim.layers.splice(anim.layers.indexOf(body) + 1, 0, newHead)

// the rim over each shoulder, as on 👤: the shirt's outline again, in the rim colour, trimmed to its top
for (const [nm, [start, end]] of Object.entries(cfg.shoulder_rim)) {
  const layer = byName(anim.layers, nm)
  const src = layer.shapes.find((g) => g.nm === 'Group 1')
  const line = structuredClone(src)
  const st = line.it.find((it) => it.ty === 'st')
  st.c = { a: 0, k: [...rgb(cfg.rim), 1] }
  line.it.splice(line.it.indexOf(st), 0, { ty: 'tm', s: { a: 0, k: start }, e: { a: 0, k: end }, o: { a: 0, k: 0 }, m: 1 })
  line.nm = 'Rim'
  layer.shapes.unshift(line)
}

const bytes = await writeTgs(anim)
await writeFile(OUT, bytes)
const inst = (await engine()).create(JSON.stringify(anim))
const C = 160
const shots = framesAt(inst.frameCount, 12)
const sheet = new Canvas(C * 6, (C + 16) * 2)
shots.forEach((f, i) => {
  sheet.draw(inst.render(f, C, C).slice(), C, (i % 6) * C, Math.floor(i / 6) * (C + 16) + 16)
  sheet.text(`f ${f}`, (i % 6) * C + 4, Math.floor(i / 6) * (C + 16) + 4, [90, 90, 90])
})
inst.drop()
await writeFile(join(ROOT, 'exports', 'sheets', 'blue-technologist-bust.png'), encodePng(sheet.px, sheet.width, sheet.height))
const checks = telegramChecks(anim, bytes.length)
console.log(`exports/blue/technologist-bust.tgs ${sizeKb(bytes)} KB, проверки Telegram ${checks.every((c) => c.ok) ? '✓' : '✕'}; exports/sheets/blue-technologist-bust.png`)
