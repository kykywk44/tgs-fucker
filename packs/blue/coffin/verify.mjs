// Source timing/rig unchanged; reclining silhouette stays within the coffin.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {ROOT,engine} from '../../../scripts/lib/sheets.mjs'
import {read,walk} from '../lib/silhouette.mjs'
const source=await read('packs/blue/coffin/source.tgs'),anim=await read('exports/blue/coffin.tgs')
assert.deepEqual(await readFile(join(ROOT,'library/emoji/584.tgs')),await readFile(join(import.meta.dirname,'source.tgs')))
for(const k of ['ip','op','fr','w','h'])assert.equal(anim[k],source[k])
for(let i=0;i<source.layers.length;i++){
  const a=source.layers[i],b=anim.layers.find(l=>l.ind===a.ind)
  for(const k of ['ind','parent','ks','ip','op','st','sr'])assert.deepEqual(b[k],a[k],`${a.nm}.${k}`)
}
const person=anim.layers.find(l=>l.nm==='grob').shapes[0].it.find(g=>g.nm.startsWith('Синий'))
assert.ok(person)
// Regression: all figure endpoints stay on the inside of the near wall, with
// an antialiasing margin, in every key of the keyed ones (the head turning up, the neck after it).
for(const sh of walk(person.it).filter(x=>x.ty==='sh'&&!x.hd)){
 for(const [x,y] of sh.ks.a?sh.ks.k.flatMap(k=>k.s[0].v):sh.ks.k.v){
  const dx=331.042-97.413,dy=428.432-253.098
  assert.ok((dx*(y-253.098)-dy*(x-97.413))/Math.hypot(dx,dy)<-.6,'Figure crosses near inner wall')
 }
}
const outlineOnly=p=>p.ty==='sh'||p.ty==='tr'
function paths(xs){return xs.flatMap(p=>p.ty==='gr'?paths(p.it):outlineOnly(p)?[p]:[])}
// Exact source geometry remains, aside from the extra person and zero skew removal.
function normalize(x){x=structuredClone(x);function go(v){if(!v||typeof v!=='object')return;if(v.ty==='tr'){delete v.sk;delete v.sa}for(const n of Object.values(v))go(n)}go(x);return x}
for(let i=0;i<source.layers.length;i++){
  const a=source.layers[i],b=structuredClone(anim.layers.find(l=>l.ind===a.ind))
  if(b.nm==='grob')b.shapes[0].it.splice(7,2)
  assert.deepEqual(normalize(paths(b.shapes??[])),normalize(paths(a.shapes??[])),a.nm)
}
for(const name of ['kr1','kr2','grob']){
 const material=structuredClone(anim.layers.find(l=>l.nm===name).shapes)
 if(name==='grob')material[0].it.splice(7,2)
 for(const p of walk(material)){
  if(p.c){
    const colors=p.c.a?p.c.k.flatMap(k=>[k.s,k.e].filter(Boolean)):[p.c.k]
    // The person is intentionally blue; every source coffin paint is neutral.
    for(const c of colors)assert.ok(c.every(Number.isFinite)&&Math.abs(c[0]-c[1])<1e-9&&Math.abs(c[1]-c[2])<1e-9,'Non-grey coffin paint')
  }
 }
}
const eng=await engine(),players=[source,anim].map(a=>eng.create(JSON.stringify(a))),N=180,S=256
let alphaDifferences=0
for(let f=0;f<N;f++){
  const a=players[0].render(f,S,S).slice(),b=players[1].render(f,S,S).slice()
  for(let i=3;i<a.length;i+=4)if(a[i]!==b[i])alphaDifferences++
}
players.forEach(p=>p.drop())
assert.equal(alphaDifferences,0,'The person escapes the original silhouette')
await writeFile(join(ROOT,'exports/sheets/coffin/verified.json'),JSON.stringify({frames:N,sourceRigUnchanged:true,
  sourceGeometryUnchanged:true,sourceFileUnchanged:true,alphaDifferences},null,2)+'\n')
console.log('coffin: source/rig/geometry, 180 frames, exact outer silhouette PASS')
