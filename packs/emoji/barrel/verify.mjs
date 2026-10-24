import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {gunzipSync} from 'node:zlib'
import {ROOT,engine,Canvas,encodePng} from '../../../scripts/lib/sheets.mjs'

const dir=import.meta.dirname,cfg=JSON.parse(await readFile(join(dir,'recipe.json'),'utf8'))
const source=await readFile(join(dir,'source.tgs'))
assert(source.equals(await readFile(join(ROOT,'library/emoji/569.tgs'))),'Original 569 changed')
const old=JSON.parse(gunzipSync(source)),bytes=await readFile(join(ROOT,'exports/emoji/barrel.tgs'))
const anim=JSON.parse(gunzipSync(bytes)),ink=anim.layers.find(l=>l.ind===1001)
assert(bytes.length<=65536);assert.equal(anim.w,512);assert.equal(anim.h,512)
assert.equal(anim.fr,60);assert.equal(anim.ip,0);assert.equal(anim.op,180)
assert.equal(anim.layers.length,old.layers.length+1)
assert.equal(ink.parent,cfg.bodyLayer);assert.equal(ink.shapes[0].nm,'СЕМЯ')
// All original geometry, hierarchy, easing, timing and gradient alpha stops
// must survive recolouring exactly, including the lid's foreground order.
function restorePaint(after,before){
  assert.equal(after.length,before.length)
  for(let n=0;n<after.length;n++){
    const a=after[n],b=before[n]
    if(b.it)restorePaint(a.it,b.it)
    if(b.c)a.c=structuredClone(b.c)
    if(b.g){
      const ac=a.g.k,bc=b.g.k
      assert.equal(ac.a,bc.a)
      assert.equal(ac.a,0,'Unexpected animated source gradient')
      assert.equal(ac.k.length,bc.k.length)
      for(let stop=0;stop<b.g.p;stop++)assert.equal(ac.k[stop*4],bc.k[stop*4])
      assert.deepEqual(ac.k.slice(b.g.p*4),bc.k.slice(b.g.p*4),'Gradient alpha ramp changed')
      a.g.k=structuredClone(b.g.k)
    }
  }
}
for(const before of old.layers){
  const after=structuredClone(anim.layers.find(l=>l.ind===before.ind))
  if(before.shapes)restorePaint(after.shapes,before.shapes)
  assert.deepEqual(after,before,`Motion/geometry changed: ${before.nm}`)
}
assert(anim.layers.findIndex(l=>l.ind===1001)>anim.layers.findIndex(l=>l.ind===22),'Print draws above moving lid')
const e=await engine(),full=e.create(JSON.stringify(anim)),original=e.create(JSON.stringify(old))
const isolated=structuredClone(anim)
for(const layer of isolated.layers)if(layer.ind!==1001)layer.shapes=[]
const label=e.create(JSON.stringify(isolated))
const body=structuredClone(anim)
for(const layer of body.layers)if(layer.ind!==cfg.bodyLayer)layer.shapes=[]
const barrel=e.create(JSON.stringify(body))
const all=new Canvas(18*96,10*112)
for(let frame=0;frame<180;frame++){
  const before=new Uint8Array(original.render(frame,512,512)),after=full.render(frame,512,512)
  for(let n=3;n<after.length;n+=4)assert.equal(after[n],before[n],`Silhouette changed at ${frame}`)
  const textPixels=new Uint8Array(label.render(frame,256,256)),bodyPixels=barrel.render(frame,256,256)
  let coverage=0
  for(let n=3;n<textPixels.length;n+=4){
    if(textPixels[n]>0)assert.equal(bodyPixels[n],255,`Print leaves barrel at ${frame}`)
    coverage+=textPixels[n]
  }
  assert(coverage>250000,`Print disappears or collapses at ${frame}`)
  const x=frame%18*96,y=Math.floor(frame/18)*112
  all.text(''+frame,x+3,y+3,[25,25,25],1);all.draw(full.render(frame,96,96),96,x,y+16)
}
await writeFile(join(ROOT,'exports/sheets/emoji-barrel/all.png'),encodePng(all.px,all.width,all.height))
for(const r of [full,original,label,barrel])r.drop()
console.log(`PASS: 180 frames; silhouette/motion unchanged; cylindrical print stays on barrel; ${(bytes.length/1024).toFixed(1)} KB`)
