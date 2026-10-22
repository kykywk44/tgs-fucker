import {read,by,walk,replaceHead,whiteMouth,restyled} from '../lib/large-face.mjs'
import {finish} from '../lib/silhouette.mjs'
const name='face-with-hand-over-mouth',source=await read(`packs/blue/${name}/source.tgs`),anim=await restyled(name)
anim.nm='070 · Хихикает за рукой'
replaceHead(by(anim.layers,'Head'),[256.332,250.44797])
whiteMouth(by(anim.layers,'mouth 3'),['Group 1'])
const grin=by(anim.layers,'mouth-2')
grin.shapes=structuredClone(by(source.layers,'mouth-2').shapes.filter(g=>['Group 1','Group 4','Group 9','Group 10','zubki'].includes(g.nm)))
for(const p of walk(grin.shapes))if(p.c) {
  const c=p.c.k,white=c[0]>.7&&c[1]>.7&&c[2]>.7
  p.c={a:0,k:white?[1,1,1,1]:[.2,83/255,117/255,1]}
}
await finish(name,source,anim,[0,12,25,40,60,80,100,120,140,155,165,179])
