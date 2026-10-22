import {read,by,replaceHead,whiteMouth,restyled} from '../lib/large-face.mjs'
import {finish} from '../lib/silhouette.mjs'
const name='zipper-mouth-face',source=await read(`packs/blue/${name}/source.tgs`),anim=await restyled(name)
anim.nm='096 · Рот на молнии'
replaceHead(by(anim.layers,'BODY'),[0,-9.0745])
whiteMouth(by(anim.layers,'Mouth'),['Group 1','Group 2'])
// Preserve the neutral metal of the zipper and every link.
for(const l of anim.layers)if(l.nm==='Zipper'||l.nm.startsWith('Link '))
  Object.assign(l,structuredClone(by(source.layers,l.nm)))
await finish(name,source,anim,[0,15,30,45,60,75,90,105,120,140,160,179])
