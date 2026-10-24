// 727: original bubble volume and bounce, with a single fixed n instead of dots.
import {readFile} from 'node:fs/promises'
import {read,walk,group,rgb,finish} from '../lib/silhouette.mjs'
const source=await read('packs/blue/n-bubble/source.tgs'),anim=structuredClone(source)
anim.nm='727 · Синий бабл n'
const middle=source.layers.find(l=>l.nm==='Layer 10')
anim.layers=anim.layers.filter(l=>!['Layer 9','Layer 10','Layer 11'].includes(l.nm))
for(const l of anim.layers)for(const p of walk(l.shapes??[])){
 if(p.ty==='gf')p.g={p:3,k:{a:0,k:[.303,...rgb('#6086a7'),.909,...rgb('#517594'),1,...rgb('#44688b')]}}
 if(p.c){const v=p.c.k[0],color=p.ty==='st'?(v>.55?'#a5d6ea':'#335375'):v>.95?'#a5d6ea':v>.7?'#6086a7':'#335375';p.c={a:0,k:[...rgb(color),1]}}
}
// The source's large inner white overlay was still bleaching the blue body.
// Keep only a restrained top reflection; centre volume comes from the blue ramp.
anim.layers.find(l=>l.nm==='Layer 2').ks.o={a:0,k:0}
anim.layers.find(l=>l.nm==='Layer 3').ks.o={a:0,k:18}
const logo=JSON.parse(await readFile(new URL('../technologist-bust/logo.json',import.meta.url),'utf8')).shape
const box=[0,1].map(d=>[Math.min(...logo.v.map(v=>v[d])),Math.max(...logo.v.map(v=>v[d]))]),center=box.map(([a,b])=>(a+b)/2),scale=125/(box[1][1]-box[1][0])
const path={c:true,v:logo.v.map(v=>v.map((x,d)=>(x-center[d])*scale)),i:logo.i.map(v=>v.map(x=>x*scale)),o:logo.o.map(v=>v.map(x=>x*scale))}
const mark={ty:4,ind:100,nm:'n · вместо точек',parent:1,ip:0,op:180,st:0,sr:1,
 ks:{p:{a:0,k:middle.ks.p.k[0].s},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}},
 shapes:[group('n',[{ty:'sh',ks:{a:0,k:path}},{ty:'fl',c:{a:0,k:[1,1,1,1]},o:{a:0,k:100},r:1}])]}
anim.layers.splice(1,0,mark)
// Source 727 reaches x=515 during its initial tilt. Fit the complete rig,
// including the letter, so the animation has real clearance instead of clipping.
anim.layers.find(l=>l.nm==='NULL').parent=101
// Source contains unused AE slider controls with expressions. The actual
// overshoot/bounce is already baked into NULL.r, so discard unsupported metadata.
delete anim.layers.find(l=>l.nm==='NULL').ef
anim.layers.push({ty:3,ind:101,nm:'Запас до края',ip:0,op:180,st:0,sr:1,
 ks:{p:{a:0,k:[256,256]},a:{a:0,k:[256,256]},s:{a:0,k:[95,95]},r:{a:0,k:0},o:{a:0,k:100}}})
await finish('n-bubble',source,anim,[0,10,21,36,50,66,81,96,111,140,160,179])
