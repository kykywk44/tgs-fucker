// Preserve the card rig/material while replacing personal information and portrait.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {ROOT,engine} from '../../../scripts/lib/sheets.mjs'
import {read,walk,at} from '../lib/silhouette.mjs'
const dir=import.meta.dirname
const cfg=JSON.parse(await readFile(join(dir,'recipe.json'),'utf8'))
assert.deepEqual(await readFile(join(dir,'source.tgs')),await readFile(join(ROOT,'library/emoji/573.tgs')))
const source=await read('packs/blue/identification-card/source.tgs')
const anim=await read('exports/blue/identification-card.tgs')
assert.deepEqual(anim.layers,source.layers,'Card timing/flip changed')
const originals=source.assets[0].layers,layers=anim.assets[0].layers
const changed=new Set(['HEAD','Mouth','sign'])
const removed=new Set(['Hair','Brows 2','Eyes 2','Brows','Eyes','Nose','Ears','Hair Back'])
for(const original of originals){
  if(removed.has(original.nm)||original.nm.startsWith('Isolation Mode'))continue
  const layer=layers.find(l=>l.ind===original.ind)
  assert.ok(layer,original.nm)
  const expected=structuredClone(original)
  if(expected.nm==='HEAD')expected.ks.p.k=expected.ks.p.k.map((v,d)=>v+(cfg.portrait.positionOffset[d]??0))
  if(changed.has(original.nm))assert.deepEqual({...layer,shapes:undefined},{...expected,shapes:undefined},`${original.nm}: original rig changed`)
  else assert.deepEqual(layer,original,`${original.nm}: card element changed`)
}
assert.ok(layers.every(l=>!removed.has(l.nm)&&!l.nm.startsWith('Isolation Mode')),'Personal information remains')
const text=layers.filter(l=>l.nm==='n · Большая буква')
assert.equal(text.length,1)
assert.deepEqual(text[0].ks.s,originals.find(l=>l.nm==='Isolation Mode').ks.s,'Letter appearance timing changed')
assert.deepEqual(layers.find(l=>l.nm==='sign').shapes.find(s=>s.ty==='tm'),originals.find(l=>l.nm==='sign').shapes.find(s=>s.ty==='tm'),'Signature drawing timing changed')
const mouth=layers.find(l=>l.nm==='Mouth')
assert.ok(walk(mouth.shapes).filter(p=>p.c).every(p=>p.c.k.slice(0,3).every(v=>v===1)))
const prop=walk(mouth.shapes).find(p=>p.ty==='sh').ks
const bounds=p=>[Math.max(...p.v.map(v=>v[0]))-Math.min(...p.v.map(v=>v[0])),Math.max(...p.v.map(v=>v[1]))-Math.min(...p.v.map(v=>v[1]))]
const normal=bounds(at(prop,110)[0]),broad=bounds(at(prop,140)[0])
assert.ok(broad[0]/normal[0]>1.6&&broad[1]/normal[1]>2.1,'Smile should stretch clearly')
assert.deepEqual(at(prop,140),at(prop,170),'Broad smile is not held')
assert.deepEqual(at(prop,60),at(prop,188),'Smile does not return before the loop')
const eng=await engine(),player=eng.create(JSON.stringify(anim))
assert.equal(player.frameCount,180)
let margin=512
for(let f=0;f<180;f++){
  const px=player.render(f,512,512).slice()
  for(let y=0;y<512;y++)for(let x=0;x<512;x++)if(px[(y*512+x)*4+3]>0)margin=Math.min(margin,x,y,511-x,511-y)
}
player.drop()
assert.ok(margin>=4,`Drawing leaves the canvas: margin ${margin}`)
const report={source:'573',frames:180,originalCardRig:true,originalPersonalInformationRemoved:true,
  letters:1,handwrittenSignature:true,smileWidthGain:broad[0]/normal[0],smileHeightGain:broad[1]/normal[1],minimumMarginPx:margin}
await writeFile(join(ROOT,'exports/sheets/identification-card/content-verification.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
