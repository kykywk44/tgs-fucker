// Offline visual survey. Layer names are deliberately never used to identify emotions.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { Canvas, ROOT, encodePng, engine } from '../../scripts/lib/sheets.mjs'

const out = join(ROOT, 'exports/rabbit/references')
await mkdir(out, { recursive: true })
const eng = await engine()
const cols = 8, size = 96, row = 116, count = 16
const catalogue = []
for (let start = 1; start <= 107; start += count) {
  const sheet = new Canvas(36 + cols * size, Math.min(count, 108 - start) * row, [224, 228, 234])
  for (let id = start; id < Math.min(start + count, 108); id++) {
    const number = String(id).padStart(3, '0')
    const anim = JSON.parse(gunzipSync(await readFile(join(ROOT, `library/emoji/${number}.tgs`))))
    const inst = eng.create(JSON.stringify(anim))
    const y = (id - start) * row
    sheet.text(number, 3, y + 46, [16, 22, 28], 2)
    const frames = Array.from({ length: cols }, (_, i) => Math.floor(i * (anim.op - anim.ip) / cols))
    for (const [i, f] of frames.entries()) {
      sheet.draw(inst.render(f, size, size).slice(), size, 36 + i * size, y)
      sheet.text(String(f), 42 + i * size, y + size + 3, [40, 44, 48], 2)
    }
    catalogue.push({ reference: number, fps: anim.fr, frames: anim.op - anim.ip, sampled: frames })
    inst.drop()
  }
  await writeFile(join(out, `survey-${String(start).padStart(3, '0')}-${String(Math.min(start + count - 1, 107)).padStart(3, '0')}.png`), encodePng(sheet.px, sheet.width, sheet.height))
}
await writeFile(join(out, 'survey.json'), JSON.stringify(catalogue, null, 2))
console.log('Rendered 001–107 at eight phases each into exports/rabbit/references/')
