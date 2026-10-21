// Разбор оригинала: абсолютные кадры Lottie (60–239), крупные лица и ключи мимики.
// node packs/blue/family/analyze.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Canvas, ROOT, encodePng, engine, load } from '../../../scripts/lib/sheets.mjs'

const { readTgs } = await load('src/core/tgs.ts')
const source = await readTgs(new Uint8Array(await readFile(join(ROOT, 'library/emoji/221.tgs'))))
const dir = join(ROOT, 'exports/sheets/family')
await mkdir(dir, { recursive: true })
const eng = await engine()
const inst = eng.create(JSON.stringify(source))
const frames = [60, 79, 86, 92, 96, 106, 112, 120, 121, 131, 141, 142, 150, 160, 162, 173, 184, 187, 197, 198, 210, 219, 229, 239]
const cell = 320
const sheet = new Canvas(cell * 6, (cell + 20) * 4)
for (const [i, f] of frames.entries()) {
  const x = i % 6 * cell, y = Math.floor(i / 6) * (cell + 20)
  sheet.text(`f ${f}`, x + 8, y + 4, [60, 60, 60])
  sheet.draw(inst.render(f - source.ip, cell, cell).slice(), cell, x, y + 20)
}
await writeFile(join(dir, 'original-keyframes.png'), encodePng(sheet.px, sheet.width, sheet.height))
for (const f of [79, 92, 106, 120, 142, 162, 184, 219]) {
  await writeFile(join(dir, `original-${f}.png`), encodePng(inst.render(f - source.ip, 1024, 1024).slice(), 1024, 1024))
}
inst.drop()
const walk = (xs) => xs.flatMap(x => x.ty === 'gr' ? walk(x.it) : [x])
const layers = source.assets.find(a => a.id === 'comp_0').layers
const details = layers.filter(l => /mouth|eye/.test(l.nm)).map(l => ({
  name: l.nm, start: l.st, transform: l.ks,
  groups: l.shapes.map(g => ({ name: g.nm, transform: g.it?.find(x => x.ty === 'tr'),
    paths: walk(g.it ?? []).filter(x => x.ty === 'sh').map(x => x.ks),
    opacity: g.it?.filter(x => x.ty === 'fl' || x.ty === 'st').map(x => x.o),
  })),
}))
await writeFile(join(dir, 'expression-paths.json'), JSON.stringify(details, null, 2))
console.log('exports/sheets/family/original-keyframes.png; expression-paths.json')
