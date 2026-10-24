// Censorship saw: preserve source action; replace poop with the approved blue head.
import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import{read,head,walk,rgb,gradient,finish,group,baked}from'../lib/silhouette.mjs'
import{getShape}from'../clipboard/scene.mjs'
import{ROOT}from'../../../scripts/lib/sheets.mjs'
const source=await read('packs/blue/censorship-saw/source.tgs'),anim=structuredClone(source)
anim.nm='Синий · Пилит цензуру'
const by=nm=>anim.layers.find(l=>l.nm===nm)
const removed=['MUHA','MUHA Stroke WIDE','Eyes L','Eye R','fiii','fiii 3','fiii 4','SHadow']
anim.layers=anim.layers.filter(l=>!removed.includes(l.nm))
for(const name of ['Arm L','Arm R']){const l=by(name);l.ty=3;delete l.shapes}
const shape=walk(by('BODY').shapes).find(p=>p.ty==='sh').ks
by('BODY').shapes=head({a:0,k:getShape(shape,0)},{width:314,height:421,center:[0,39.5],bottom:[0,250],top:[0,-171],outline:12})
// Collapse the ear bulges during the source turn, keeping a smooth temple-to-jaw
// curve and the light crown rim attached to that same contour.
const [rim,face]=by('BODY').shapes.map(g=>g.it.find(p=>p.ty==='sh'))
const round=structuredClone(face.ks.k),profile=structuredClone(round)
profile.o[1]=[5,-25];profile.i[2]=[2,26]
profile.o[6]=[-2,26];profile.i[7]=[-5,-25]
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i])
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t)
function split(p0,p1,p2,p3,t){const a=lerp(p0,p1,t),b=lerp(p1,p2,t),c=lerp(p2,p3,t),d=lerp(a,b,t),e=lerp(b,c,t),p=lerp(d,e,t);return[[p0,a,d,p],[p,e,c,p3]]}
const rimRound=structuredClone(rim.ks.k),rimProfile=structuredClone(rimRound)
const r=split(profile.v[1],add(profile.v[1],profile.o[1]),add(profile.v[2],profile.i[2]),profile.v[2],.8)[1]
rimProfile.v[0]=r[0];rimProfile.o[0]=sub(r[1],r[0]);rimProfile.i[1]=sub(r[2],r[3])
const l=split(profile.v[6],add(profile.v[6],profile.o[6]),add(profile.v[7],profile.i[7]),profile.v[7],.2)[0]
rimProfile.o[5]=sub(l[1],l[0]);rimProfile.v[6]=l[3];rimProfile.i[6]=sub(l[2],l[3])
const turn=(front,side)=>({a:1,k:[[0,front],[15,front],[23,side],[27,side],[35,front],[179,front]].map(([t,p])=>({t,s:[structuredClone(p)],o:{x:.42,y:0},i:{x:.58,y:1}}))})
face.ks=turn(round,profile);rim.ks=turn(rimRound,rimProfile)
const solid=(p,color)=>{const keep={nm:p.nm,hd:p.hd,bm:p.bm??0,o:p.o??{a:0,k:100},r:p.r??1};for(const k of Object.keys(p))delete p[k];Object.assign(p,{ty:'fl',...keep,c:{a:0,k:[...rgb(color),1]}})}
// Original mouth contours, tooth divisions, lip motion and fades are retained.
for(const name of ['rot','rot stroke','Teeth'])for(const p of walk(by(name).shapes)){
 if(p.ty==='st')p.c={a:0,k:[...rgb(name==='Teeth'?'#335375':'#ffffff'),1]}
 if(p.ty==='fl'||p.ty==='gf')solid(p,'#ffffff')
}
// The source mouth turns in from the side of a much wider poop silhouette.
// Clip each inherited mouth layer to the actual blue face, so it wraps behind
// the cheek instead of floating outside it during that entrance.
let matteIndex=40
for(const name of ['rot stroke','Teeth','rot']){
 const target=by(name),shapes=structuredClone(by('BODY').shapes.slice(1))
 function mask(items){return items.filter(p=>p.ty!=='st').map(p=>{if(p.ty==='gr')p.it=mask(p.it);if(p.ty==='gf'||p.ty==='fl')solid(p,'#ffffff');return p})}
 const matte={ty:4,ind:matteIndex++,nm:'Face matte · '+name,parent:20,td:1,ip:0,op:180,st:0,sr:1,
  ks:{p:{a:0,k:[0,0]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}},shapes:mask(shapes)}
 target.tt=1;anim.layers.splice(anim.layers.indexOf(target),0,matte)
}
function blueHand(items,bottom,top){for(const p of walk(items)){
 if(p.ty==='st')p.c={a:0,k:[...rgb('#335375'),1]}
 if(p.ty==='fl'){
  if(p.c.k[0]>.95){const name=p.nm,rule=p.r;for(const k of Object.keys(p))delete p[k];Object.assign(p,{...gradient(bottom,top),nm:name,r:rule??1})}
  else p.c={a:0,k:[...rgb('#44688b'),1]}
 }
}}
blueHand(by('2 Hand L').shapes,[0,-35],[0,-90])
// The original white glove has an open thumb/palm seam. The source white sign
// was showing through that gap. Bridge it behind the original moving fingers.
const left=by('2 Hand L'),finger=left.shapes.find(g=>g.nm==='Group 2'),middle=left.shapes.find(g=>g.nm==='Group 3'),palm=left.shapes.find(g=>g.nm==='Group 4')
const local=(g,f,i)=>add(getShape(g.it.find(p=>p.ty==='sh').ks,f).v[i],g.it.find(p=>p.ty==='tr').p.k)
// Reach the middle finger too: at65–67 it separates slightly from both palm
// and thumb. The backing stays behind their original contours and follows
// every source frame, including the quick hand entrance.
const seam=baked(f=>{const a=local(palm,f,4),b=local(finger,f,0),c=local(middle,f,0),d=local(middle,f,2);const v=[[a[0]-2,a[1]-3],[b[0]-2,b[1]+3],[c[0]+3,c[1]+3],[d[0]+3,d[1]-3]];return{c:true,v,i:v.map(()=>[0,0]),o:v.map(()=>[0,0])}},180,true)
left.shapes.push(group('Синяя перемычка кисти',[{ty:'sh',ks:seam},{ty:'fl',c:{a:0,k:[...rgb('#6086a7'),1]},o:{a:0,k:100},r:1}]))
for(const p of walk(by('Hand L Shadow').shapes)){
 if(p.c)p.c={a:0,k:[...rgb('#6086a7'),1]}
 if(p.ty==='tr')p.o={a:0,k:100}
}
// This is now an opaque cuff backing, so it belongs behind the finger contours.
const cuff=by('Hand L Shadow');anim.layers.splice(anim.layers.indexOf(cuff),1)
anim.layers.splice(anim.layers.indexOf(left)+1,0,cuff)
for(const p of walk(by('SAW Shadow').shapes))if(p.c)p.c={a:0,k:[...rgb(p.ty==='st'?'#335375':'#44688b'),1]}
for(const p of walk(by('SAW Back').shapes))if(p.c)p.c={a:0,k:[...rgb(p.ty==='st'?'#50575f':'#b4b9c0'),1]}
const all=by('SAW R').shapes.find(g=>g.nm==='All')
for(const group of all.it.filter(g=>g.ty==='gr')){
 if(['Hand R','Big finger'].includes(group.nm)){blueHand([group],[0,50],[0,-55]);continue}
 // Blade/metal stay intact; only the old yellow grip and brass details go grey.
 if(['Group 9','Group 5','Yellow part'].includes(group.nm))for(const p of walk([group])){
  if(p.ty==='st')p.c={a:0,k:[...rgb('#50575f'),1]}
  if(p.ty==='fl')p.c={a:0,k:[...rgb('#b4b9c0'),1]}
 }
 if(group.nm==='Yellow part Stroke')for(const p of walk([group]))if(p.c)p.c={a:0,k:[...rgb('#d5d9de'),1]}
}
assert.ok(all.it.some(g=>g.nm==='Hand R'))
await finish('censorship-saw',source,anim,[0,15,20,25,30,35,85,95,98,115,145,179])
await writeFile(join(ROOT,'packs/blue/censorship-saw/drawing.json'),JSON.stringify(anim)+'\n')
