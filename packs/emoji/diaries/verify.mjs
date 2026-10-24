import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {gunzipSync} from 'node:zlib'
import {ROOT,engine,Canvas,encodePng,load} from '../../../scripts/lib/sheets.mjs'

const sourceBytes=await readFile(new URL('./source.tgs',import.meta.url))
assert(sourceBytes.equals(await readFile(join(ROOT,'library/emoji/637.tgs'))),'637 source changed')
const original=JSON.parse(gunzipSync(sourceBytes))
const bytes=await readFile(join(ROOT,'exports/emoji/diaries.tgs'))
const anim=JSON.parse(gunzipSync(bytes))
assert.equal(anim.w,512);assert.equal(anim.h,512);assert.equal(anim.fr,60)
assert.equal(anim.ip,original.ip);assert.equal(anim.op,original.op);assert(bytes.length<=65536)
const withoutLogo=structuredClone(anim)
withoutLogo.layers=withoutLogo.layers.filter(l=>!l.nm.startsWith('+ąi ·'))
const originalLayers=withoutLogo.layers.filter(l=>!l.nm.startsWith('elastic ·'))
assert.equal(originalLayers.length,original.layers.length)
for(let n=0;n<original.layers.length;n++){
  const old=original.layers[n],now=originalLayers[n]
  for(const field of ['ind','parent','ks','ip','op','st','sr','ty'])assert.deepEqual(now[field],old[field],`${old.nm}: changed ${field}`)
  if(/page/.test(old.nm)||old.ty===3||/Shadow/.test(old.nm))assert.deepEqual(now,old,`${old.nm}: paper, shadows and rig unchanged`)
}
function validate(value){
  if(typeof value==='number')assert(Number.isFinite(value))
  if(value&&typeof value==='object'){
    assert(![5,2,1].includes(value.ty),'No text, image or solid layers')
    if(value.ty==='sh'&&value.ks.a){
      const lengths=value.ks.k.flatMap(k=>[...(k.s??[]),...(k.e??[])]).map(s=>s.v.length)
      assert(lengths.every(n=>n===lengths[0]),'Morph topology changes')
    }
    Object.values(value).forEach(validate)
  }
}
validate(anim)
const {easeAt}=await load('src/core/motion/easing.ts')
function verticesAt(prop,frame){
  if(!prop.a)return prop.k.v
  const keys=prop.k,next=keys.findIndex(k=>k.t>frame)
  if(next===0)return keys[0].s[0].v
  if(next<0)return keys.at(-1).s[0].v
  const a=keys[next-1],b=keys[next],u=(frame-a.t)/(b.t-a.t),pick=v=>Array.isArray(v)?v[0]:v
  const t=a.h?0:easeAt({x1:pick(a.o.x),y1:pick(a.o.y),x2:pick(a.i.x),y2:pick(a.i.y)},u)
  return a.s[0].v.map((p,n)=>p.map((v,d)=>v+(b.s[0].v[n][d]-v)*t))
}
// Measure attachment along the physical lower edge, removing the book's own
// movement. The 75–82 guide handoff used to overshoot left, then swing right.
const config=JSON.parse(await readFile(new URL('./recipe.json',import.meta.url),'utf8'))
const lowerBand=anim.layers.find(l=>l.nm==='elastic · b top 2').shapes[0].it.find(s=>s.ty==='sh').ks
const lowerFace=original.layers.find(l=>l.nm==='b top 2').shapes.at(-1)
const faceTransform=lowerFace.it.find(s=>s.ty==='tr')
const faceX=faceTransform.p.k[0]-faceTransform.a.k[0]
let previousAttachment=Infinity
for(let frame=64;frame<=85;frame++){
  const end=verticesAt(lowerBand,frame)[1],face=verticesAt(lowerFace.it.find(s=>s.ty==='sh').ks,frame)
  const attachment=(end[0]-faceX-face[2][0])/(face[3][0]-face[2][0])
  assert(attachment>=config.elastic.u-.00025,`Lower elastic overshoots left at ${frame}`)
  assert(attachment<=previousAttachment+.00025,`Lower elastic reverses sideways at ${frame}`)
  previousAttachment=attachment
}
const bands=anim.layers.filter(l=>l.nm.startsWith('elastic ·'))
assert.equal(bands.length,10,'Six cover stripes and four independent page-block stripes')
for(const band of bands){
  const stroke=band.shapes[0].it.find(s=>s.ty==='st')
  assert.deepEqual(stroke.c.k,[0,0,0,1]);assert.equal(stroke.w.k,8)
  const keys=band.shapes[0].it.find(s=>s.ty==='sh').ks.k
  if(band.nm.includes('pages'))for(const key of keys){
    const shape=key.s[0]
    assert.equal(shape.v.length,2,'Taut front elastic has only its two cover-edge anchors')
    assert([...shape.i,...shape.o].every(p=>p.every(v=>v===0)),'Taut elastic must not sag or bend onto pages')
  }
  const lengths=keys.map(k=>k.s[0].v.slice(1).reduce((total,p,i)=>total+Math.hypot(...p.map((v,d)=>v-k.s[0].v[i][d])),0))
  assert(Math.max(...lengths)-Math.min(...lengths)>1,'Elastic must follow the opening cover/page block')
  const parent=original.layers.find(l=>l.ind===band.parent)
  if(!band.nm.includes('pages'))assert(band.op<=parent.op,'Obsolete cover stripe must disappear with its cover variant')
  else{
    const paper=original.layers.find(l=>`elastic · ${l.nm}`===band.nm)
    assert.deepEqual(band.ks,paper.ks,'Page-block stripe must have its own paper visibility')
    assert.equal(band.ip,paper.ip);assert.equal(band.op,paper.op)
  }
}
// Hand-corrected edge-on poses must not shear even though the source cover
// corners move sideways independently. Test interpolated frames, not just keys.
for(const name of ['g pages','r pages','b pages','b top 2']){
  const keys=bands.find(l=>l.nm===`elastic · ${name}`).shapes[0].it.find(s=>s.ty==='sh').ks.k
  for(let frame=name==='b top 2'?55:54;frame<=68;frame++){
    const next=keys.findIndex(k=>k.t>frame)
    let points
    if(next<0)points=keys.at(-1).s[0].v
    else if(next===0)points=keys[0].s[0].v
    else{
      const a=keys[next-1],b=keys[next],u=(frame-a.t)/(b.t-a.t)
      points=a.s[0].v.map((p,i)=>p.map((v,d)=>v+(b.s[0].v[i][d]-v)*u))
    }
    assert(Math.abs(points[0][0]-points[1][0])<.001,`${name}: elastic shears sideways at ${frame}`)
  }
}
// Rim paths have their own endpoints; they must stop before the original
// pointed corner, otherwise their round cap recreates the unwanted spur.
for(const [name,group] of [['g top',0],['r top',0],['b top',1],['b top 2',1]]){
  const old=original.layers.find(l=>l.nm===name).shapes[group].it.find(s=>s.ty==='sh').ks
  const now=anim.layers.find(l=>l.nm===name).shapes[group].it.find(s=>s.ty==='sh').ks
  for(const key of old.k){
    if(!key.s)continue
    const previous=key.s[0].v.at(-1),current=now.k.find(k=>k.t===key.t).s[0].v.at(-1)
    const moved=Math.hypot(...current.map((v,d)=>v-previous[d]))
    assert(moved>0&&moved<=13.001,`${name}: rim endpoint not inset at ${key.t}`)
  }
}
const e=await engine(),full=e.create(JSON.stringify(anim)),base=e.create(JSON.stringify(withoutLogo))
assert(full&&base)
// Regression: the old blue page block remains visible after its cover switches
// at frame 56. Its stripe must stay on that page face, with no dangling segment
// drawn across the new front cover of the lower book.
const isolate=name=>{
  const a=structuredClone(anim)
  for(const layer of a.layers)if(layer.shapes&&layer.nm!==name)layer.shapes=[]
  return a
}
const oldSide=e.create(JSON.stringify(isolate('elastic · b pages')))
const mask=isolate('b pages'),paperMask=mask.layers.find(l=>l.nm==='b pages')
paperMask.shapes=[paperMask.shapes[3]]
for(const item of paperMask.shapes[0].it){
  if(item.ty==='fl'||item.ty==='st')item.c={a:0,k:[1,1,1,1]}
  if(item.ty==='st')item.w={a:0,k:12}
}
const faceMask=e.create(JSON.stringify(mask))
for(let frame=56;frame<=71;frame++){
  const stripe=new Uint8Array(oldSide.render(frame,512,512)),face=faceMask.render(frame,512,512)
  for(let i=3;i<stripe.length;i+=4)if(stripe[i]>30)assert(face[i]>0,`Old stripe leaks through lower cover at ${frame}`)
}
oldSide.drop();faceMask.drop()
// The lower book switches between two separately translating rigs. Comparing
// local X alone misses the sideways drift: check the rendered common axis.
const lowerCover=e.create(JSON.stringify(isolate('elastic · b top 2')))
const lowerPages=e.create(JSON.stringify(isolate('elastic · b pages')))
const stripeX=pixels=>{
  let weight=0,x=0
  for(let i=3;i<pixels.length;i+=4){const alpha=pixels[i];weight+=alpha;x+=((i-3)/4%512)*alpha}
  assert(weight>0);return x/weight
}
for(let frame=56;frame<=71;frame++){
  const coverX=stripeX(lowerCover.render(frame,512,512))
  const pageX=stripeX(lowerPages.render(frame,512,512))
  assert(Math.abs(coverX-pageX)<.15,`Lower elastic drifts between cover and page rigs at ${frame}: ${coverX-pageX}px`)
}
lowerCover.drop();lowerPages.drop()
for(const name of ['g pages','r pages','b pages']){
  const isolated=e.create(JSON.stringify(isolate(`elastic · ${name}`)))
  for(let frame=56;frame<=60;frame++){
    const stripe=new Uint8Array(isolated.render(frame,512,512)),actual=full.render(frame,512,512)
    let black=0
    for(let i=0;i<stripe.length;i+=4)if(stripe[i+3]>250&&actual[i]<3&&actual[i+1]<3&&actual[i+2]<3)black++
    assert(black>25,`${name}: front stripe disappears at ${frame}`)
  }
  isolated.drop()
}
const all=new Canvas(18*96,10*112)
let printed=0
for(let frame=0;frame<179;frame++){
  const reference=new Uint8Array(base.render(frame,512,512)),result=full.render(frame,512,512)
  assert(result)
  for(let i=0;i<result.length;i+=4){
    assert.equal(result[i+3],reference[i+3],`Logo changes silhouette at frame ${frame}`)
    if(result[i]!==reference[i]||result[i+1]!==reference[i+1]||result[i+2]!==reference[i+2]){
      assert(reference[i+3]>250,`Logo outside the cover at frame ${frame}`);printed++
    }
  }
  const x=frame%18*96,y=Math.floor(frame/18)*112
  all.text(''+frame,x+3,y+3,[20,20,20],1);all.draw(full.render(frame,96,96),96,x,y+16)
}
assert(printed>0)
await writeFile(join(ROOT,'exports/sheets/emoji-diaries/all.png'),encodePng(all.px,all.width,all.height))
full.drop();base.drop()
console.log(`PASS: all 179 frames; original animation/rig/pages unchanged; logo stays inside silhouette; ${(bytes.length/1024).toFixed(1)} KB`)
