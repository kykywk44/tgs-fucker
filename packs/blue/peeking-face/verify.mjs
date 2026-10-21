// Проверка исходных движений/рта, отсутствия глаз, толщины обводки и всех 180 кадров.
// node packs/blue/peeking-face/verify.mjs
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Canvas, ROOT, encodePng, engine, load } from '../../../scripts/lib/sheets.mjs'
const { readTgs } = await load('src/core/tgs.ts')
const { telegramChecks } = await load('src/core/checks.ts')
const originalBytes = await readFile(join(ROOT,'packs/blue/peeking-face/source.tgs'))
assert.deepEqual(originalBytes,await readFile(join(ROOT,'library/emoji/069.tgs')))
const bytes = await readFile(join(ROOT,'exports/blue/peeking-face.tgs'))
const source = await readTgs(originalBytes), blue = await readTgs(bytes)
const recipe = JSON.parse(await readFile(join(import.meta.dirname,'recipe.json'),'utf8'))
const byName = (a,n) => a.layers.find(l => l.nm === n)
const walk = xs => xs.flatMap(x => x.ty === 'gr' ? walk(x.it) : [x])
const noShapes = ({shapes,...rest}) => rest
assert.deepEqual(blue.layers.map(l => l.nm),source.layers.filter(l => !recipe.remove.includes(l.nm)).map(l => l.nm))
for (const l of blue.layers) {
  assert.deepEqual(noShapes(l),noShapes(byName(source,l.nm)),`Изменён риг или тайминг ${l.nm}`)
  if (l.parent != null) assert.ok(blue.layers.some(p => p.ind === l.parent))
}
for (const field of ['ip','op','fr','w','h']) assert.equal(blue[field],source[field])
for (const name of ['Hand L','Hand R']) {
  const paths = a => walk(byName(a,name).shapes).filter(x => ['sh','tr'].includes(x.ty))
  assert.deepEqual(paths(blue),paths(source),`Изменены пути/ключи руки ${name}`)
}
for (const name of ['BODY','Hand L','Hand R'])
  for (const p of walk(byName(blue,name).shapes).filter(x => x.ty === 'st')) assert.equal(p.w.k,8)
const mouth = structuredClone(byName(source,'Mouth').shapes.filter(g => ['Group 1','Group 2'].includes(g.nm)))
for (const p of walk(mouth).filter(x => x.c)) p.c = {a:0,k:[1,1,1,1]}
assert.deepEqual(byName(blue,'Mouth').shapes,mouth,'Изменены геометрия/ключи рта')
for (const name of ['Brows','Eye L','Eye R','Eyeball L','Eyeball R']) assert.ok(!byName(blue,name),'Лишняя мимика: '+name)
const allowed = new Set(['#335375','#44688b','#6086a7','#7ba3c3','#a5d6ea','#8cb7d3','#ffffff'])
const hex = c => '#'+c.slice(0,3).map(v => Math.round(v*255).toString(16).padStart(2,'0')).join('')
for (const p of blue.layers.flatMap(l => walk(l.shapes ?? []))) {
  if (p.c) assert.ok(allowed.has(hex(p.c.k)),hex(p.c.k))
  if (p.g) for (let j=0;j<p.g.p;j++) assert.ok(allowed.has(hex(p.g.k.k.slice(j*4+1,j*4+4))))
}
assert.ok(telegramChecks(blue,bytes.length).every(c => c.ok))
// Независимый рендер исходного рта и исходного рига с теми же руками для перекрытия.
const reference = structuredClone(source)
for (const l of reference.layers) l.shapes = l.nm === 'Mouth' ? structuredClone(mouth) :
  ['Hand L','Hand R'].includes(l.nm) ? structuredClone(byName(blue,l.nm).shapes) : []
const headOnly = structuredClone(blue)
for (const l of headOnly.layers) if (l.nm !== 'BODY') l.shapes = []
const eng = await engine(), actual = eng.create(JSON.stringify(blue)), expected = eng.create(JSON.stringify(reference)), head = eng.create(JSON.stringify(headOnly))
const white = (a,i) => a[i] === 255 && a[i+1] === 255 && a[i+2] === 255 && a[i+3] === 255
let sheet
let visibleMouthFrames = 0
const bounds = [256,256,0,0]
for (let f=0;f<180;f++) {
  const a = actual.render(f,256,256,false).slice(), b = expected.render(f,256,256,false).slice(), h = head.render(f,256,256,false).slice()
  let diff = 0, outside = 0, whites = 0
  for (let i=0;i<a.length;i+=4) {
    if (white(a,i) !== white(b,i)) diff++
    if (white(a,i)) { whites++; if (!h[i+3]) outside++ }
    if (a[i+3]) { const x=i/4%256,y=Math.floor(i/4/256);bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y) }
  }
  assert.equal(diff,0,`Контур/перекрытие рта отличается в кадре ${f}`)
  assert.equal(outside,0,`Рот выходит за голову в кадре ${f}`)
  if (whites) visibleMouthFrames++
  if (f%30 === 0) sheet = new Canvas(160*6,180*5)
  const x=f%6*160,y=Math.floor(f%30/6)*180
  sheet.text(`f ${f}`,x+4,y+4,[70,70,70]);sheet.draw(actual.render(f,160,160).slice(),160,x,y+20)
  if (f%30 === 29) await writeFile(join(ROOT,`exports/sheets/peeking-face/all-${Math.floor(f/30)+1}.png`),encodePng(sheet.px,sheet.width,sheet.height))
}
actual.drop();expected.drop();head.drop()
const report = {bytes:bytes.length,kb:+(bytes.length/1024).toFixed(1),frames:180,fps:blue.fr,
  originalTransforms:true,originalHandPaths:true,originalMouthPaths:true,identicalVisibleMouthMasks:180,
  visibleMouthFrames,noEyesOrBrows:true,stroke:8,boundsAt256:bounds}
await writeFile(join(ROOT,'exports/sheets/peeking-face/verification.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
