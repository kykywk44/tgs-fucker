import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {gunzipSync} from 'node:zlib'
import {read,walk,at} from '../lib/silhouette.mjs'
import {engine} from '../../../scripts/lib/sheets.mjs'
const source=await read('packs/blue/skibidi-toilet/source.tgs'),anim=await read('exports/blue/skibidi-toilet.tgs')
for(const layer of source.layers)if(layer.nm!=='mouth')assert.deepEqual(anim.layers.find(l=>l.ind===layer.ind).ks,layer.ks)
for(const nm of ['hair','nose','eye 1','eye 2','brow','ear 1','ear 2'])assert.equal(anim.layers.find(l=>l.nm===nm).shapes.length,0)
const native=source.layers.find(l=>l.nm==='Face').shapes.find(g=>g.nm==='Group 5').it.find(s=>s.ty==='sh').ks
const shapes=walk(anim.layers.find(l=>l.nm==='Face').shapes).filter(s=>s.ty==='sh')
for(let f=16;f<=102;f++){
 const raw=at(native,f),p=Array.isArray(raw)?raw[0]:raw,bound=210.748+Math.max(...p.v.map(v=>v[1]))-8
 for(const s of shapes){
  const raw=at(s.ks,f),p=Array.isArray(raw)?raw[0]:raw
  for(let i=0;i<p.v.length;i++){
   const j=(i+1)%p.v.length;if(!p.c&&j===0)break
   for(let n=0;n<=16;n++){
    const t=n/16,a=p.v[i][1],b=a+p.o[i][1],d=p.v[j][1],c=d+p.i[j][1]
    assert((1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d<=bound+.001,`Head below rim: frame ${f}`)
   }
  }
 }
}
for(const l of anim.layers.filter(l=>l.nm==='paper'||l.nm==='paper 2'))for(const s of walk(l.shapes)){
 if(s.c&&!s.c.a)assert(Math.abs(s.c.k[0]-s.c.k[1])<1e-8&&Math.abs(s.c.k[1]-s.c.k[2])<1e-8)
}
const e=await engine(),r=e.create(JSON.stringify(anim));assert(r)
for(let f=0;f<180;f++){const px=r.render(f,512,512);assert(px&&px.some((v,i)=>i%4===3&&v>0))}
r.drop();console.log('180 frames render; original rig intact; blue head stays above native rim cut; grey paper verified')
