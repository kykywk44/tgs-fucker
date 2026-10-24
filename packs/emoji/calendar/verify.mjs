import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {gunzipSync} from 'node:zlib'
import {ROOT,engine,Canvas,encodePng} from '../../../scripts/lib/sheets.mjs'

const dir=import.meta.dirname,cfg=JSON.parse(await readFile(join(dir,'recipe.json'),'utf8'))
const source=await readFile(join(dir,'source.tgs'))
assert(source.equals(await readFile(join(ROOT,'library/emoji/631.tgs'))),'Original 631 changed')
const original=JSON.parse(gunzipSync(source)),bytes=await readFile(join(ROOT,'exports/emoji/calendar.tgs'))
const anim=JSON.parse(gunzipSync(bytes))
const withoutCompoundMerge=value=>Array.isArray(value)?value.filter(s=>s?.ty!=='mm'||s.mm!==1).map(withoutCompoundMerge):
  value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,withoutCompoundMerge(v)])):value
assert(bytes.length<=65536);assert.equal(anim.w,512);assert.equal(anim.h,512);assert.equal(anim.fr,60)
assert.equal(anim.ip,original.ip);assert.equal(anim.op,original.op)
assert.equal(anim.layers.length,original.layers.length-cfg.removeLayers.length+2*cfg.dates.length)
assert(!anim.layers.some(l=>cfg.removeLayers.includes(l.ind)||l.nm==='Heart'),'Hearts remain')
const template=anim.layers.find(l=>l.ind===1100+cfg.dates[0].layer).shapes[0].it[0].it.filter(s=>s.ty==='sh')
for(const old of original.layers){
  if(cfg.removeLayers.includes(old.ind))continue
  const layer=anim.layers.find(l=>l.ind===old.ind),repaired=structuredClone(layer)
  for(const date of cfg.dates.filter(d=>d.layer===old.ind)){
    const ink=anim.layers.find(l=>l.ind===1100+date.layer),mask=anim.layers.find(l=>l.ind===1000+date.layer)
    const group=ink.shapes[0],paper=original.layers.find(l=>l.ind===date.paper)
    assert.equal(ink.parent,old.ind);assert.equal(ink.tt,1);assert.equal(mask.td,1)
    assert.equal(anim.layers.indexOf(mask)+1,anim.layers.indexOf(ink),'Matte must immediately precede its ink')
    assert.deepEqual(mask.ks,paper.ks,'Paper matte motion changed')
    assert.equal(mask.parent,paper.parent)
    const paths=items=>items.flatMap(s=>s.ty==='sh'?[s]:s.it?paths(s.it):[])
    assert.deepEqual(paths(mask.shapes),paths([paper.shapes[date.paperGroup]]),'Paper matte contour changed')
    assert.equal(layer.shapes[date.group].nm,'Date replaced')
    assert.equal(group.nm,`${cfg.text} · fixed date`)
    assert.deepEqual(group.it[0].it.filter(s=>s.ty==='sh'),template,'Different print on another month')
    assert.deepEqual(group.it.at(-1),old.shapes[date.group].it.at(-1),'Date visibility/transform changed')
    repaired.shapes[date.group]=structuredClone(old.shapes[date.group])
  }
  assert.deepEqual(withoutCompoundMerge(repaired),withoutCompoundMerge(old),`Month, page or motion changed: ${old.nm}`)
}
// Isolate each print and its actual paper face while keeping every parent
// transform. Across all frames, no obsolete ink may survive outside its sheet.
const e=await engine()
let clippedPixels=0
for(const date of cfg.dates){
  const maskId=1000+date.layer,inkId=1100+date.layer
  const isolated=structuredClone(anim)
  for(const l of isolated.layers){
    if(l.ind!==maskId&&l.ind!==inkId){l.shapes=[];delete l.tt;delete l.td}
  }
  const inkRender=e.create(JSON.stringify(isolated))
  const unmasked=structuredClone(isolated)
  delete unmasked.layers.find(l=>l.ind===inkId).tt
  unmasked.layers.find(l=>l.ind===maskId).shapes=[]
  delete unmasked.layers.find(l=>l.ind===maskId).td
  const rawRender=e.create(JSON.stringify(unmasked))
  const face=structuredClone(isolated)
  delete face.layers.find(l=>l.ind===maskId).td
  face.layers.find(l=>l.ind===inkId).shapes=[]
  delete face.layers.find(l=>l.ind===inkId).tt
  const faceRender=e.create(JSON.stringify(face))
  for(let frame=0;frame<179;frame++){
    const ink=new Uint8Array(inkRender.render(frame,256,256))
    const paper=new Uint8Array(faceRender.render(frame,256,256))
    const raw=rawRender.render(frame,256,256)
    for(let i=3;i<ink.length;i+=4){
      assert(ink[i]<=paper[i]+1,`Ink escapes page ${date.layer}, frame ${frame}`)
      if(raw[i]>ink[i]+2)clippedPixels++
    }
  }
  inkRender.drop();rawRender.drop();faceRender.drop()
}
assert(clippedPixels>0,'Paper clipping does not remove any of the old trails')
const full=e.create(JSON.stringify(anim)),sourceRender=e.create(JSON.stringify(original))
const withMerge=structuredClone(anim)
withMerge.layers.find(l=>l.ind===40).shapes[0].it[0].it.splice(2,0,
  structuredClone(original.layers.find(l=>l.ind===40).shapes[0].it[0].it[2]))
const originalMergeRender=e.create(JSON.stringify(withMerge))
assert(full&&sourceRender)
const all=new Canvas(18*96,10*112)
for(let frame=0;frame<179;frame++){
  const before=new Uint8Array(sourceRender.render(frame,512,512)),after=full.render(frame,512,512)
  assert(after)
  for(let i=3;i<after.length;i+=4)assert.equal(after[i],before[i],`Print leaves paper/silhouette at frame ${frame}`)
  const fixedPixels=new Uint8Array(after),mergePixels=originalMergeRender.render(frame,512,512)
  assert(fixedPixels.every((v,i)=>v===mergePixels[i]),`FEB drawing changes when removing Merge Paths at ${frame}`)
  const x=frame%18*96,y=Math.floor(frame/18)*112
  all.text(''+frame,x+3,y+3,[25,25,25],1);all.draw(full.render(frame,96,96),96,x,y+16)
}
await writeFile(join(ROOT,'exports/sheets/emoji-calendar/all.png'),encodePng(all.px,all.width,all.height))
full.drop();sourceRender.drop();originalMergeRender.drop()
console.log(`PASS: 179 frames, 10 page mattes; ${clippedPixels} trailing pixels clipped; all dates = ${cfg.text}; months/pages/motion unchanged; hearts removed; ${(bytes.length/1024).toFixed(1)} KB`)
