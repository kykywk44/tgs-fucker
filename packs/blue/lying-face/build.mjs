import {read,by,replaceHead,whiteMouth,restyled} from '../lib/large-face.mjs'
import {finish,walk,gradient,baked,world,transform,mul,inverse,point} from '../lib/silhouette.mjs'
const name='lying-face',source=await read(`packs/blue/${name}/source.tgs`),anim=await restyled(name)
anim.nm='075 · Врёт, растёт нос'
replaceHead(by(anim.layers,'BODY'),[.19075,-4.04492])
whiteMouth(by(anim.layers,'Mouth'),['Group 1','Group 2'])
// Match the base of the growing nose to the head, avoiding a rectangular colour seam.
const nose=by(anim.layers,'Nose'),base=nose.shapes.find(g=>g.nm==='Group 5')
const local=base.it.find(x=>x.ty==='tr'),body=by(anim.layers,'BODY')
for(const p of walk([base]).filter(x=>x.ty==='gf')) {
  const coordinate=v=>baked(f=>point(inverse(mul(world(anim.layers,nose,f),transform(local,f))),
    point(world(anim.layers,body,f),v)))
  for(const k of Object.keys(p))delete p[k]
  Object.assign(p,gradient([.19075,185.10217],[.19075,-193.19201]),{
    s:coordinate([.19075,185.10217]),e:coordinate([.19075,-193.19201]),
  })
}
await finish(name,source,anim,[0,15,30,45,60,75,90,105,120,140,160,179])
