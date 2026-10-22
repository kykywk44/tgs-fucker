import {read,by,walk,replaceHead,whiteMouth,restyled} from '../lib/large-face.mjs'
import {finish,at,baked,path,stroke} from '../lib/silhouette.mjs'
const name='yawning-face',source=await read(`packs/blue/${name}/source.tgs`),anim=await restyled(name)
anim.nm='089 + 090 · Зевает с zzz'
replaceHead(by(anim.layers,'body'),[208.917,209.15597])
whiteMouth(by(anim.layers,'mouth'),['Group 1','Group 2'])
const sleep=await read(`packs/blue/${name}/zzz-source.tgs`)
// Use the actual animated mouth opening to gate the borrowed letters.
const opening=f=>{
  const s=at(path(by(source.layers,'mouth')),f),p=Array.isArray(s)?s[0]:s
  return Math.max(...p.v.map(v=>v[1]))-Math.min(...p.v.map(v=>v[1]))
}
const letters=sleep.layers.filter(l=>/^Z [123]$/.test(l.nm)).map((l,i)=>{
  const z=structuredClone(l);z.ind=100+i;z.parent=2
  z.ks.o=baked(f=>[100*Math.max(0,Math.min(1,(opening(f)-28-i*8)/34))])
  for(const p of walk(z.shapes)) {
    if(p.c)p.c={a:0,k:[1,1,1,1]}
    if(p.ty==='gf') {
      for(const key of Object.keys(p))delete p[key]
      Object.assign(p,{ty:'fl',c:{a:0,k:[1,1,1,1]},o:{a:0,k:100},r:1})
    }
  }
  for(const g of z.shapes)g.it.splice(g.it.findIndex(x=>x.ty==='fl'),0,stroke(2.5))
  return z
})
anim.layers.splice(1,0,...letters)
await finish(name,source,anim,[0,15,30,50,70,90,105,120,135,150,165,179])
