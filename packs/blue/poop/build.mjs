// 111 💩: синий объём, только белая улыбка, без мух, дыма и глаз; исходные движения.
// node packs/blue/poop/build.mjs
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Canvas, ROOT, encodePng, engine, load } from '../../../scripts/lib/sheets.mjs'
const { readTgs, writeTgs, sizeKb } = await load('src/core/tgs.ts')
const { telegramChecks } = await load('src/core/checks.ts')
execFileSync(process.execPath,[join(ROOT,'scripts/restyle.mjs'),'blue/poop'],{stdio:'ignore'})
const source = await readTgs(new Uint8Array(await readFile(join(import.meta.dirname,'source.tgs'))))
const anim = await readTgs(new Uint8Array(await readFile(join(ROOT,'exports/blue/poop.tgs'))))
const mouth = anim.layers.find(l => l.nm === 'Mouth')
// Отбрасываем коричневые блики/тени вокруг губ. Геометрия улыбки и её ключи неизменны.
mouth.shapes = structuredClone(source.layers.find(l => l.nm === 'Mouth').shapes
  .filter(g => ['Group 1','Group 2','Group 3'].includes(g.nm)))
for (const g of mouth.shapes) for (const x of g.it) if (x.c) x.c = {a:0,k:[1,1,1,1]}
// Все 47 ассетов обслуживали только удалённый дым. Не оставляем их в итоговом TGS.
assert.ok(!anim.layers.some(l => l.refId),'В стикере остался используемый precomp')
anim.assets = []
const bytes = await writeTgs(anim)
assert.ok(telegramChecks(anim,bytes.length).every(c => c.ok))
await writeFile(join(ROOT,'exports/blue/poop.tgs'),bytes)
const eng = await engine(), rows = [source,anim].map(a => eng.create(JSON.stringify(a)))
const C=256,frames=[0,30,60,90,120,150],sheet=new Canvas(C*6,(C+20)*2)
for (const [r,p] of rows.entries()) for (const [i,f] of frames.entries()) {
  sheet.text(`f ${f}`,i*C+4,r*(C+20)+4,[70,70,70])
  sheet.draw(p.render(f,C,C).slice(),C,i*C,r*(C+20)+20)
}
await writeFile(join(ROOT,'exports/sheets/blue-poop.png'),encodePng(sheet.px,sheet.width,sheet.height))
rows.forEach(p => p.drop())
console.log(`exports/blue/poop.tgs: ${sizeKb(bytes)} KB; exports/sheets/blue-poop.png`)
