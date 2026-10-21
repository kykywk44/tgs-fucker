// Проверки именно этой сборки: исходник, движения, рты, палитра, обводка и все 180 кадров.
// node packs/blue/family/verify.mjs
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Canvas, ROOT, encodePng, engine, load } from '../../../scripts/lib/sheets.mjs'

const { readTgs } = await load('src/core/tgs.ts')
const { telegramChecks } = await load('src/core/checks.ts')
const sourceBytes = await readFile(join(ROOT,'packs/blue/family/source.tgs'))
assert.deepEqual(sourceBytes,await readFile(join(ROOT,'library/emoji/221.tgs')),'Исходник изменён')
const bytes = await readFile(join(ROOT,'exports/blue/family.tgs'))
const source = await readTgs(sourceBytes), blue = await readTgs(bytes)
const cfg = JSON.parse(await readFile(join(import.meta.dirname,'heads.json'),'utf8'))
const recipe = JSON.parse(await readFile(join(import.meta.dirname,'recipe.json'),'utf8'))
const walk = xs => xs.flatMap(x => x.ty === 'gr' ? walk(x.it) : [x])
const layers = blue.assets.find(a => a.id === 'comp_0').layers
const originalLayers = source.assets.find(a => a.id === 'comp_0').layers
const find = (ls,nm) => ls.find(l => l.nm === nm)
const firstPath = l => walk(l.shapes).find(x => x.ty === 'sh').ks
const noShapes = ({ shapes, ...rest }) => rest

assert.deepEqual(blue.layers,source.layers,'Изменены фон, рамка или их анимация')
for (const field of ['ip','op','fr','w','h']) assert.equal(blue[field],source[field])
assert.deepEqual(layers.map(l => l.nm).sort(),originalLayers.filter(l => !recipe.remove.includes(l.nm)).map(l => l.nm).sort())
for (const l of layers) {
  assert.deepEqual(noShapes(l),noShapes(find(originalLayers,l.nm)),`Изменено движение: ${l.nm}`)
  if (l.parent != null) assert.ok(layers.some(p => p.ind === l.parent),`Потерян родитель ${l.nm}`)
}
for (const person of cfg.people) {
  const head = find(layers,person.head), body = find(layers,person.body)
  const width = walk(body.shapes).find(x => x.ty === 'st').w.k
  for (const st of walk(head.shapes).filter(x => x.ty === 'st')) assert.equal(st.w.k,width,'Обводка головы должна совпадать с телом')
  assert.deepEqual(walk(body.shapes).filter(x => ['sh','tr'].includes(x.ty)),
    walk(find(originalLayers,person.body).shapes).filter(x => ['sh','tr'].includes(x.ty)),`Изменена геометрия тела ${person.name}`)
  const old = firstPath(find(originalLayers,person.head))
  const newHead = head.shapes.find(g => g.nm === 'Голова').it.find(x => x.ty === 'sh').ks
  const timeline = p => p.a ? p.k.map(({s,e,...key}) => key) : []
  assert.deepEqual(timeline(newHead),timeline(old),`Изменены ключи головы ${person.name}`)
  const oldShapes = old.a ? old.k.flatMap(k => k.s ?? []) : [old.k]
  const headShapes = newHead.a ? newHead.k.flatMap(k => k.s ?? []) : [newHead.k]
  const offsetY = find(originalLayers,person.head).shapes[0].it.find(x => x.ty === 'tr').p.k[1]
  for (const [i,p] of headShapes.entries()) {
    assert.equal(p.c,true)
    assert.equal(p.v.length,cfg.bust.keep.length+1,'Голова должна замыкаться подбородком без шеи')
    assert.ok(Math.abs(Math.max(...p.v.map(v => v[1]))-(Math.max(...oldShapes[i].v.map(v => v[1]))+offsetY))<1e-8,'Подбородок выходит ниже исходной головы')
  }
  const mouth = structuredClone(find(originalLayers,person.mouth).shapes)
    .filter(g => (person.mouthGroups ?? ['Group 2','Group 3']).includes(g.nm))
  for (const p of walk(mouth).filter(x => x.ty === 'fl' || x.ty === 'st')) p.c = { a: 0,k: [1,1,1,1] }
  assert.deepEqual(find(layers,person.mouth).shapes,mouth,`Изменён контур или тайминг рта ${person.name}`)
}
const hex = c => '#'+c.slice(0,3).map(v => Math.round(v*255).toString(16).padStart(2,'0')).join('')
const allowed = new Set(['#335375','#44688b','#6086a7','#7ba3c3','#a5d6ea','#ffffff'])
const palette = new Set()
for (const p of layers.flatMap(l => walk(l.shapes ?? []))) {
  const add = c => { const h = hex(c); palette.add(h); assert.ok(allowed.has(h),`Лишний цвет ${h}`) }
  if (p.c) { assert.equal(p.c.a,0); add(p.c.k) }
  if (p.g) { assert.equal(p.g.k.a,0); for (let i=0;i<p.g.p;i++) add(p.g.k.k.slice(i*4+1,i*4+4)) }
}
assert.ok(telegramChecks(blue,bytes.length).every(c => c.ok))

// Независимый эталон белых ртов: оригинал, в котором оставлены только исходные группы ртов,
// перекрашенные в белый. Все родительские transform и корневые матты/рамка остаются на месте.
const reference = structuredClone(source)
reference.layers = structuredClone(blue.layers)
for (const l of reference.assets.find(a => a.id === 'comp_0').layers) {
  const person = cfg.people.find(p => p.mouth === l.nm)
  if (person) {
    l.shapes = l.shapes.filter(g => (person.mouthGroups ?? ['Group 2','Group 3']).includes(g.nm))
    for (const p of walk(l.shapes).filter(x => x.ty === 'fl' || x.ty === 'st')) p.c = { a: 0,k: [1,1,1,1] }
  } else l.shapes = l.nm === 'top hair 3' ? structuredClone(find(layers,l.nm).shapes) : []
}
const eng = await engine(), actual = eng.create(JSON.stringify(blue)), expected = eng.create(JSON.stringify(reference))
assert.equal(actual.frameCount,180)
const white = (p,i) => p[i] === 255 && p[i+1] === 255 && p[i+2] === 255 && p[i+3] === 255
let sheet
for (let f=0;f<actual.frameCount;f++) {
  // Без AA: полупрозрачная кромка белого рта смешивается с синим фоном в полном стикере,
  // а в изолированном эталоне — с прозрачностью. Сравниваем точное покрытие, а не эту смесь.
  const a = actual.render(f,512,512,false).slice(), b = expected.render(f,512,512,false).slice()
  let diff = 0
  for (let i=0;i<a.length;i+=4) if (white(a,i) !== white(b,i)) diff++
  assert.equal(diff,0,`Белые рты не совпали с оригиналом в кадре ${f+blue.ip}: ${diff} пикселей`)
  if (f%30 === 0) sheet = new Canvas(160*6,180*5)
  const x = f%6*160, y = Math.floor(f%30/6)*180
  sheet.text(`f ${f+blue.ip}`,x+4,y+4,[70,70,70])
  sheet.draw(actual.render(f,160,160).slice(),160,x,y+20)
  if (f%30 === 29) await writeFile(join(ROOT,`exports/sheets/family/all-${Math.floor(f/30)+1}.png`),encodePng(sheet.px,sheet.width,sheet.height))
}
actual.drop(); expected.drop()
const report = { bytes: bytes.length, kb: +(bytes.length/1024).toFixed(1), frames: 180,
  fps: blue.fr, size: [blue.w,blue.h], sourceSha256: createHash('sha256').update(sourceBytes).digest('hex'),
  palette: [...palette].sort(), identicalMouthMasks: 180, originalTransforms: true,
  originalBackgroundAndFrame: true, headAndBodyStroke: 8, noNecks: true }
await writeFile(join(ROOT,'exports/sheets/family/verification.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
