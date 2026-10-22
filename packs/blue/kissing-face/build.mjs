// 022 · Воздушный поцелуй, в манере больших лиц пака (forcing-smile, partying-face): голова 069 без
// шеи и глаз на месте круга, рты белые. Большие губы, летящие в зрителя (кадры 58–113), — белые с
// контуром #335375, голубой тенью #a5d6ea и бликами; след поцелуя на «стекле» — белый, тает как в оригинале.
// node packs/blue/kissing-face/build.mjs
import {read,by,whiteMouth,walk,rgb} from '../lib/large-face.mjs'
import {head,path,finish} from '../lib/silhouette.mjs'
const name='kissing-face',source=await read(`packs/blue/${name}/source.tgs`),anim=structuredClone(source)
anim.nm='022 · Воздушный поцелуй'
anim.layers.splice(anim.layers.indexOf(by(anim.layers,'Eyes')),1)

// the face: the 069 head in the circle's group, which keeps its transform (scale 97 %)
const body=by(anim.layers,'BODY'),outer=body.shapes[0]
const shapes=head(path(body),{width:300/.97,height:378.29418/.97,center:[0,12],
  bottom:[0,12+378.29418/.97/2],top:[0,12-378.29418/.97/2],outline:8/.97})
body.shapes=[{...structuredClone(outer),it:[...shapes,structuredClone(outer.it.find(x=>x.ty==='tr'))]}]

// the smile and the pucker: the mouth shapes white, their warm highlights dropped
whiteMouth(by(anim.layers,'Mouth Open'),['Group 1','Group 2'])
whiteMouth(by(anim.layers,'Kiss Lips'),['Group 1','Group 2','Group 3','Group 4','Group 5'])

// the big lips: white lips, the pack's outline, light-blue shade, white glints
const PAINT={'#e76900':'#335375','#fbdb34':'#ffffff','#f4b11c':'#d6ecf6','#eaac1f':'#a5d6ea',
  '#ffeec0':'#ffffff','#ffedab':'#ffffff','#ffffff':'#ffffff'}
const hex=c=>'#'+c.slice(0,3).map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('')
for(const p of walk(by(anim.layers,'Lips Big').shapes))if(p.c&&!p.c.a){
  const to=PAINT[hex(p.c.k)];if(!to)throw new Error('lips: '+hex(p.c.k))
  p.c={a:0,k:[...rgb(to),1]}
}
// the print left on the glass
for(const p of walk(by(anim.layers,'Trace BLUE').shapes))if(p.c)p.c={a:0,k:[1,1,1,1]}

await finish(name,source,anim,[0,30,58,75,90,105,120,150])
