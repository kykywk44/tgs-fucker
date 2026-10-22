import {read,by,walk,replaceHead,rgb,mapVector} from '../lib/large-face.mjs'
import {finish} from '../lib/silhouette.mjs'
const name='grimacing-face',source=await read(`packs/blue/${name}/source.tgs`),anim=structuredClone(source)
anim.nm='082 · Стиснутые зубы и капли'
anim.layers=anim.layers.filter(l=>l.nm!=='Eyes')
const center=[.054,-10.93103]
replaceHead(by(anim.layers,'BODY'),center)
for(const g of by(anim.layers,'Mouth').shapes)for(const p of walk([g])) {
  if(p.c)p.c={a:0,k:[...rgb(g.nm==='Group 10'?'#6086a7':'#335375'),1]}
  if(p.ty==='gf') {
    for(const k of Object.keys(p))delete p[k]
    Object.assign(p,{ty:'fl',c:{a:0,k:[1,1,1,1]},o:{a:0,k:100},r:1})
  }
}
for(const l of anim.layers.filter(l=>l.nm.startsWith('Drop'))) {
  // The drops retain their own shape and speed, but follow the narrower head.
  const sx=300/378.29418
  l.ks.p=mapVector(l.ks.p,p=>[center[0]+(p[0]-center[0])*sx,p[1],...p.slice(2)])
  for(const k of l.ks.p.k)if(l.ks.p.a)for(const key of ['to','ti'])if(k[key])k[key][0]*=sx
  l.shapes=l.shapes.filter(g=>g.nm!=='Group 6')
  for(const p of walk(l.shapes))if(p.c) {
    const c=p.c.k,col=c[0]>.9&&c[1]>.9?'#ffffff':p.ty==='st'?'#335375':c[0]>.4?'#a5d6ea':'#8cb7d3'
    p.c={a:0,k:[...rgb(col),1]}
  }
}
await finish(name,source,anim,[0,15,30,45,60,75,90,105,120,140,160,179])
