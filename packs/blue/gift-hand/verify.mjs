// Verify the retained hand geometry/rig, palette, and every rendered frame.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { ROOT, engine } from '../../../scripts/lib/sheets.mjs'
import { read, walk, style } from '../lib/silhouette.mjs'

const source = await read('packs/blue/gift-hand/source.tgs')
const anim = await read('exports/blue/gift-hand.tgs')
for (const field of ['w','h','fr','ip','op']) assert.equal(anim[field],source[field])
assert.deepEqual(anim.layers.map(l => l.ind),[16,20,19])
const noShapes = ({shapes,...rest}) => rest
assert.deepEqual(noShapes(anim.layers[0]),{...noShapes(source.layers.find(l => l.ind === 16)),ty:3})
const matte = anim.layers[1], hand = anim.layers[2], old = source.layers.find(l => l.ind === 19)
assert.deepEqual(noShapes(hand),{...noShapes(old),tt:1},'Changed hand rig/timing')
assert.deepEqual(noShapes(matte),{...noShapes(old),ind:20,nm:'Hand silhouette matte',td:1})
const keep = {
  'два передних пальца': ['лайн','лайн 2','заливка','заливка 2'],
  'два дальних пальца': ['лайн 1','лайн 2','заливка 1','заливка 2'],
  'ладонь': ['лайн ладони','заливка'],
  'большой палец': ['Group 1','Group 5'],
}
const structural = items => items.filter(x => ['gr','sh','tr'].includes(x.ty))
  .map(x => x.ty === 'gr' ? {...x,it:structural(x.it)} : x)
const expected = structuredClone(old.shapes).filter(g => keep[g.nm])
for (const g of expected) g.it = g.it.filter(x => x.ty === 'tr' || keep[g.nm].includes(x.nm))
const base = structuredClone(hand.shapes)
for (const g of base) g.it = g.it.filter(x => x.ty === 'tr' || !/^(Highlight|Shadow):/.test(x.nm))
assert.deepEqual(structural(base),structural(expected),'Changed finger/palm contours or keyframes')
assert.deepEqual(structural(matte.shapes),structural(expected),'Matte does not follow the original hand')
const rgb = hex => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255)
let highlights=0, shadows=0
for (const g of hand.shapes) {
  for (const detail of g.it.filter(x => /^(Highlight|Shadow):/.test(x.nm))) {
    const light = detail.nm.startsWith('Highlight:')
    light ? highlights++ : shadows++
    const originalName = detail.nm.replace(/^(Highlight|Shadow): /,'')
    assert.ok(old.shapes.find(x => x.nm === g.nm).it.some(x =>
      x.nm === originalName && JSON.stringify(structural(x.it)) === JSON.stringify(structural(detail.it))),
    `Changed moving shading geometry: ${detail.nm}`)
    if (!light) {
      assert.equal(g.nm,'большой палец','Only the small thumb crease should remain shaded')
      assert.equal(originalName,'Shape 1')
    }
    for (const p of walk(detail.it).filter(x => ['fl','gf','gs'].includes(x.ty))) {
      if (light) {
        assert.ok(['gf','gs'].includes(p.ty))
        assert.equal(p.g.k.a,0)
        for(let i=0;i<p.g.p;i++) assert.deepEqual(p.g.k.k.slice(i*4+1,i*4+4),rgb(style.handHighlight))
        assert.deepEqual(p.o,{a:0,k:p.ty==='gs'?100:45})
      } else {
        assert.equal(p.ty,'fl','Thumb shading must have a crisp edge')
        assert.deepEqual(p.c,{a:0,k:[...rgb('#44688b'),1]})
        assert.deepEqual(p.o,{a:0,k:100})
      }
    }
  }
}
assert.equal(highlights,6)
assert.equal(shadows,1)
for (const paint of walk(base).filter(x => ['fl','gf','gs','st'].includes(x.ty))) {
  assert.ok(['st','gf'].includes(paint.ty),'Unexpected base paint')
  assert.deepEqual(paint.o,{a:0,k:100})
  if (paint.ty === 'st') {
    assert.deepEqual(paint.c,{a:0,k:[...rgb(style.outline),1]})
    assert.equal(paint.w.k,8)
  } else assert.deepEqual(paint.g.k.k,style.body.stops.flatMap(([s,c]) => [s,...rgb(c)]))
}

const eng = await engine(), player = eng.create(JSON.stringify(anim)), size = 512
const silhouette = structuredClone(anim)
silhouette.layers = [silhouette.layers[0],silhouette.layers[1]]
delete silhouette.layers[1].td
const maskPlayer = eng.create(JSON.stringify(silhouette))
assert.equal(player.frameCount,180)
for (let f=0;f<180;f++) {
  const px = player.render(f,size,size).slice()
  const mask = maskPlayer.render(f,size,size).slice()
  let opaque=0
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const i=y*size+x
    if (px[i*4+3]>0) {
      opaque++
      assert.ok(mask[i*4+3]>0,`Shading leaks outside the original hand f${f}, pixel ${i}`)
      assert.ok(x>0&&y>0&&x<size-1&&y<size-1,`Clipped outline f${f}`)
    }
  }
  assert.ok(opaque>1000,`Empty hand f${f}`)
}
player.drop()
maskPlayer.drop()
const report = {frames:180,originalRigAndContours:true,noBowOrSparkles:true,highlights,shadows,unclippedFrames:180,
  sourceSha256:createHash('sha256').update(await readFile(join(ROOT,'packs/blue/gift-hand/source.tgs'))).digest('hex')}
await writeFile(join(ROOT,'exports/sheets/gift-hand/geometry-verification.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
