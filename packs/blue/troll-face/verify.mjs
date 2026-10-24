// Content/rig checks plus every rendered frame; no Telegram requests.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {ROOT,engine} from '../../../scripts/lib/sheets.mjs'
import {read,walk,mapProperty,rgb} from '../lib/silhouette.mjs'

const cfg=JSON.parse(await readFile(join(import.meta.dirname,'recipe.json'),'utf8'))
const source=await read('packs/blue/troll-face/source.tgs')
const originals=source.assets[0].layers,eng=await engine(),reports=[]
const by=(layers,name)=>layers.find(l=>l.nm===name)
const shapes=layer=>walk(layer.shapes??[]).filter(p=>p.ty==='sh')
const allowed=new Set(['#335375','#a5d6ea','#44688b','#6086a7','#7ba3c3','#ffffff'])
const hex=c=>'#'+c.slice(0,3).map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('')
for(const [index,name]of cfg.variants.entries()){
  const anim=await read(`exports/blue/${name}.tgs`),layers=anim.assets[0].layers
  assert.deepEqual(anim.layers,source.layers,'Original root movement changed')
  for(const old of originals){
    const layer=by(layers,old.nm)
    assert.ok(layer,old.nm)
    assert.deepEqual({...layer,ty:old.ty,shapes:undefined},{...old,shapes:undefined},`${old.nm}: rig/timing changed`)
  }
  for(const name of ['brows Outlines','nose1 Outlines','eye1 Outlines'])assert.equal(by(layers,name).ty,3)
  const head=by(layers,'head1 Outlines')
  assert.deepEqual(shapes(head)[0].ks,by(originals,'head1 Outlines').shapes[1].it[0].ks,'Troll silhouette changed')
  const rim=by(layers,'head1 Outlines 2')
  const expectedRim=mapProperty(shapes(by(originals,rim.nm))[0].ks,p=>({c:false,
    ...Object.fromEntries(['v','i','o'].map(k=>[k,cfg.crownVertices.map(i=>p[k][i])]))}))
  assert.deepEqual(shapes(rim)[0].ks,expectedRim,'Rim does not follow original contour')
  assert.equal(walk(head.shapes).find(p=>p.ty==='st').w.k,cfg.outlineWidth)
  assert.deepEqual(walk(rim.shapes).find(p=>p.ty==='st').c.k,[...rgb('#a5d6ea'),1])
  assert.deepEqual(shapes(by(layers,'mouth Outlines')),shapes(by(originals,'mouth Outlines')),'Grin silhouette changed')
  for(const name of ['teeth1 Outlines','teeth2 Outlines']){
    const white=layer=>layer.shapes.filter(g=>g.it.some(p=>p.ty==='fl'&&p.c.k.slice(0,3).every(v=>v===1)))
    const layer=by(layers,name),old=by(originals,name)
    assert.deepEqual(white(layer).map(g=>g.it.find(p=>p.ty==='sh').ks),white(old).map(g=>g.it.find(p=>p.ty==='sh').ks),'White tooth row movement changed')
    assert.ok(walk(layer.shapes).filter(p=>p.ty==='st').every(p=>p.w.k===cfg.toothSeparatorWidth))
  }
  for(const name of ['forhead Outlines','chin Outlines','cheecks Outlines']){
    const layer=by(layers,name)
    if(index===1)assert.equal(layer.ty,3,'Creases remain in clean variant')
    else assert.deepEqual(shapes(layer),shapes(by(originals,name)),'Crease motion changed')
  }
  for(const layer of layers)for(const paint of walk(layer.shapes??[])){
    if(paint.c)assert.ok(allowed.has(hex(paint.c.k)),`Unexpected paint ${hex(paint.c.k)}`)
    if(paint.ty==='gf')for(let p=0;p<paint.g.p;p++)assert.ok(allowed.has(hex(paint.g.k.k.slice(p*4+1,p*4+4))))
    assert.notEqual(paint.ty,'gs','Gradient strokes are not supported by Telegram')
  }
  const player=eng.create(JSON.stringify(anim));assert.equal(player.frameCount,180)
  let margin=512
  for(let f=0;f<180;f++){
    const px=player.render(f,512,512).slice();let count=0
    for(let y=0;y<512;y++)for(let x=0;x<512;x++)if(px[(y*512+x)*4+3]>0){count++;margin=Math.min(margin,x,y,511-x,511-y)}
    assert.ok(count>10000,`${name}: empty frame ${f}`)
  }
  player.drop();assert.ok(margin>=4,`${name}: cropped frame, margin ${margin}`)
  reports.push({name,frames:180,minimumMarginPx:margin,originalRig:true,originalSilhouette:true,originalGrin:true,eyesRemoved:true,creases:index===0,whiteTeeth:true})
}
const hash=createHash('sha256').update(await readFile(join(import.meta.dirname,'source.tgs'))).digest('hex')
await writeFile(join(ROOT,'exports/sheets/troll-face/content-verification.json'),JSON.stringify({sourceSHA256:hash,variants:reports},null,2)+'\n')
console.log(JSON.stringify(reports))
