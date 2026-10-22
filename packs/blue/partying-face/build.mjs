import {read,by,replaceHead,whiteMouth,mapVector} from '../lib/large-face.mjs'
import {finish} from '../lib/silhouette.mjs'
const name='partying-face',source=await read(`packs/blue/${name}/source.tgs`),anim=structuredClone(source)
anim.nm='035 · Вечеринка'
const ls=anim.assets.find(a=>a.id==='comp_0').layers
for(const nm of ['brow L','brow R','eye_L','eye_R','Cheeks'])ls.splice(ls.indexOf(by(ls,nm)),1)
// Leave a few pixels above the crown at the highest bounce (frames 16–17).
replaceHead(by(ls,'bodyface'),[-2.824,14.66797])
whiteMouth(by(ls,'mouth'),['Group 1','Group 2','Group 3','Group 4','Group 5'])
by(ls,'hat').ks.p=mapVector(by(ls,'hat').ks.p,p=>[p[0]+34,p[1],...p.slice(2)])
await finish(name,source,anim,[0,15,30,45,60,75,90,105,120,140,160,179])
