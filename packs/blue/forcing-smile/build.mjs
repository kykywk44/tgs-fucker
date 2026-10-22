import {read,by,whiteMouth,restyled} from '../lib/large-face.mjs'
import {head,path,finish} from '../lib/silhouette.mjs'
const name='forcing-smile',source=await read(`packs/blue/${name}/source.tgs`),anim=await restyled(name)
anim.nm='045 · Натягивает улыбку'
const body=by(anim.layers,'body'),outer=by(source.layers,'body').shapes[0]
const shapes=head(path(body),{width:300/.97,height:378.29418/.97,center:[215.644,215.645],
  bottom:[215.644,410.642],top:[215.644,20.648],outline:8/.97})
// Keep the source's additional animated rotation inside the body group.
body.shapes=[{...structuredClone(outer),it:[...shapes,structuredClone(outer.it.find(x=>x.ty==='tr'))]}]
whiteMouth(by(anim.layers,'mouth'),['Group 1','Group 2'])
await finish(name,source,anim,[0,15,30,45,60,75,90,105,120,140,160,179])
