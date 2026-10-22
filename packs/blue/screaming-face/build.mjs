// 062 · В ужасе (😱): руки синие по рецепту, круг лица — голова 069 без шеи, которая вытягивается
// вместе с исходным кругом в крике (lib/fit-head.mjs); глаза, тени рук и голубой «страх» убраны,
// рот белый. node packs/blue/screaming-face/build.mjs
import {read,by,walk,whiteMouth,restyled} from '../lib/large-face.mjs'
import {finish} from '../lib/silhouette.mjs'
import {fittedHead} from '../lib/fit-head.mjs'
const name='screaming-face',source=await read(`packs/blue/${name}/source.tgs`),anim=await restyled(name)
anim.nm='062 · В ужасе'
const base=by(anim.layers,'base')
const circle=walk(by(source.layers,'base').shapes.filter(g=>g.nm==='gr blue')).find(x=>x.ty==='sh').ks
base.shapes=fittedHead(circle,{bottom:[0,190],top:[0,-200]})
whiteMouth(by(anim.layers,'mouth'),['Group 1','Group 2'])
await finish(name,source,anim,[0,15,30,45,60,75,90,105,120,140,160,179])
