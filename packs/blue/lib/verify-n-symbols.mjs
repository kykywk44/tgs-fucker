// Verify the two n variants preserve source framing/rig and don't spill ink.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {ROOT,engine} from '../../../scripts/lib/sheets.mjs'
import {read,walk,at} from './silhouette.mjs'
const e=await engine(),results=[]
for(const [name,id] of [['n-flag','756'],['n-bubble','727']]){
 const source=await read(`packs/blue/${name}/source.tgs`),anim=await read(`exports/blue/${name}.tgs`)
 assert.deepEqual(await readFile(join(ROOT,`packs/blue/${name}/source.tgs`)),await readFile(join(ROOT,`library/emoji/${id}.tgs`)))
 for(const l of anim.layers.filter(l=>![100,101].includes(l.ind))){
  const old=source.layers.find(p=>p.ind===l.ind);assert.ok(old)
  const expected=structuredClone(old.ks)
  if(name==='n-bubble'&&l.nm==='Layer 2')expected.o={a:0,k:0}
  if(name==='n-bubble'&&l.nm==='Layer 3')expected.o={a:0,k:18}
  assert.deepEqual(l.ks,expected,'Original motion preserved; only bubble reflection opacity changes');assert.equal(l.parent,l.nm==='NULL'&&name==='n-bubble'?101:old.parent)
 }
 if(name==='n-flag'){
  assert.ok(!anim.layers.some(l=>l.nm==='круг'))
  assert.ok(walk(anim.layers.find(l=>l.ind===100).shapes).find(p=>p.ty==='sh').ks.a,'Cloth letter must deform')
  assert.deepEqual(anim.layers.find(l=>l.ind===100).ks,source.layers.find(l=>l.nm==='круг').ks)
 }else assert.ok(!anim.layers.some(l=>['Layer 9','Layer 10','Layer 11'].includes(l.nm)))
 if(name==='n-bubble'){
  source.layers.find(l=>l.nm==='NULL').parent=101
  source.layers.push(structuredClone(anim.layers.find(l=>l.ind===101)))
 }
 const a=e.create(JSON.stringify(source)),b=e.create(JSON.stringify(anim)),S=256
 let alphaMismatch=0,margin=S
 for(let f=0;f<180;f++){
  const x=a.render(f,S,S).slice(),y=b.render(f,S,S)
  for(let i=0;i<S*S;i++){
   if(x[4*i+3]!==y[4*i+3])alphaMismatch++
   if(y[4*i+3])margin=Math.min(margin,i%S,Math.floor(i/S),S-1-i%S,S-1-Math.floor(i/S))
  }
 }
 a.drop();b.drop();assert.equal(alphaMismatch,0,'Changing symbol must not change source exterior/alpha');assert.ok(margin>=4,'Canvas clearance')
 results.push({name,frames:180,source:id,rigPreserved:true,alphaMismatch,marginPixels:margin*2})
 if(name==='n-flag'){
  const prop=walk(anim.layers.find(l=>l.ind===100).shapes).find(p=>p.ty==='sh').ks
  const poses=Array.from({length:180},(_,f)=>at(prop,f)[0].v)
  const speed=f=>Math.max(...poses[f].map((p,i)=>Math.hypot(...p.map((x,d)=>x-poses[f-1][i][d]))))*.8
  const speeds=Array.from({length:179},(_,i)=>speed(i+1))
  const localMax=Math.max(...speeds.slice(59,90))
  assert.ok(localMax<3,`Unexpected letter jump near frame70: ${localMax}px/frame`)
  results.at(-1).letterMaxStep60to90=localMax
  results.at(-1).letterMaxStepAll=Math.max(...speeds)
 }
}
await writeFile(join(ROOT,'exports/sheets/n-symbols-verification.json'),JSON.stringify(results,null,2)+'\n')
console.log(results)
