// 068 · Задумался (🤔): рука синяя по рецепту, круг лица — голова 069 без шеи в группе круга (её
// масштаб 92 % учтён в толщине контура); глаза, брови, тени руки и отдельная обводка круга убраны,
// рот белый. node packs/blue/thinking-face/build.mjs
import {read,by,walk,whiteMouth,restyled} from '../lib/large-face.mjs'
import {finish} from '../lib/silhouette.mjs'
import {fittedHead} from '../lib/fit-head.mjs'
const name='thinking-face',source=await read(`packs/blue/${name}/source.tgs`),anim=await restyled(name)
anim.nm='068 · Задумался'
const body=by(anim.layers,'body')
body.shapes=body.shapes.filter(g=>g.nm==='body')
const inner=body.shapes[0].it.find(g=>g.nm==='Group 1')
// the circle's own group (it carries the offset) keeps its transform; the head goes inside it
const ring=inner.it.find(g=>g.nm==='Group 5')
const circle=ring.it.find(x=>x.ty==='sh').ks
ring.it=[...fittedHead(circle,{bottom:[0,200],top:[0,-200],scale:.92}),ring.it.find(x=>x.ty==='tr')]
inner.it=inner.it.filter(g=>g.nm!=='Group 6')
whiteMouth(by(anim.layers,'mouth'),['Group 1'])
await finish(name,source,anim,[0,15,30,45,60,75,90,105,120,140,160,179])
