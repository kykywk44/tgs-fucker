// Separate15s writing/dozing scene; approved clipboard and sign versions stay intact.
import assert from 'node:assert/strict'
import {writeFile,mkdir,readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {read,at,baked,walk,group,stroke} from '../lib/silhouette.mjs'
import {getShape,warpShape} from '../clipboard/scene.mjs'
import {ROOT,engine,Canvas,encodePng} from '../../../scripts/lib/sheets.mjs'
const N=900,STEP=3,FPS=60
const motion=JSON.parse(await readFile(new URL('./motion.json',import.meta.url),'utf8'))
const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*x*(10-15*x+6*x*x)}
const ramp=(t,a,b)=>ease((t-a)/(b-a)),window=(t,a,b,c,d)=>ramp(t,a,b)*(1-ramp(t,c,d))
const pulse=(t,a,b,c)=>window(t,a,b,b,c)
const time=f=>15*f/(N-1)
export const sleepy=t=>ramp(t,4.2,8.1)*(1-ramp(t,10.45,10.72))
export const startle=t=>pulse(t,10.44,10.66,11.12)
export const nod=t=>pulse(t,1.05,1.3,1.66)+pulse(t,3.0,3.24,3.57)+pulse(t,11.22,11.43,11.73)+pulse(t,11.86,12.07,12.39)
const listening=t=>.65*window(t,.8,1.1,1.5,1.9)+.65*window(t,2.8,3.05,3.4,3.8)+.78*window(t,10.6,10.98,12.35,12.85)
// Integrate writing speed: it slows and stops as he falls asleep, then resumes.
// Integrate a gradually falling speed; resume naturally after waking and close the loop.
const speed=t=>{
 for(let i=1;i<motion.writingSpeed.length;i++){
  const [a,x]=motion.writingSpeed[i-1],[b,y]=motion.writingSpeed[i]
  if(t<=b)return x+(y-x)*ramp(t,a,b)
 }
 return motion.writingSpeed.at(-1)[1]
}
const activity=Array.from({length:N},(_,f)=>speed(time(f)))
const integral=[0];for(let f=1;f<N;f++)integral.push(integral.at(-1)+(activity[f-1]+activity[f])/2)
const clock=f=>129-39*Math.cos(2*Math.PI*motion.writingCycles*integral[Math.round(f)]/integral.at(-1))
const mix=(a,b,u)=>typeof a==='number'?a+(b-a)*u:Array.isArray(a)?a.map((v,i)=>mix(v,b[i],u)):{...a,...Object.fromEntries(['v','i','o'].map(k=>[k,mix(a[k],b[k],u)]))}
function retime(x,pose=false){
 if(!x||typeof x!=='object')return x
 if(Array.isArray(x))return x.map(v=>retime(v,pose))
 if(x.a===1&&Array.isArray(x.k)&&x.k[0]?.t!=null)return baked(f=>pose?mix(at(x,90),at(x,0),listening(time(f))):at(x,clock(f)),N,false,STEP)
 return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,retime(v,pose)]))
}
const source=await read('packs/blue/clipboard-sleep/base.tgs'),anim=retime(source)
anim.nm='193 + 090 · Пишет, засыпает, просыпается · 15с';anim.op=N
const by=nm=>anim.layers.find(l=>l.nm===nm),old=nm=>source.layers.find(l=>l.nm===nm)
function snapshot(x){
 if(!x||typeof x!=='object')return x
 if(x.a===1&&Array.isArray(x.k)&&x.k[0]?.t!=null){let k=at(x,0);if(Array.isArray(k)&&k.length===1)k=k[0];return {a:0,k}}
 return Array.isArray(x)?x.map(snapshot):Object.fromEntries(Object.entries(x).map(([k,v])=>[k,snapshot(v)]))
}
// He holds the clipboard steadily. Repeated subpixel breathing of the whole
// torso/tablet costs bitrate and distracts from the writing, nods and dozing.
by('BODY').ks.s=snapshot(by('BODY').ks.s)
for(const nm of ['HEAD','NULL FACE']){
 by(nm).ks=retime(old(nm).ks,true)
 if(old(nm).shapes)by(nm).shapes=retime(old(nm).shapes,true)
}
const oldPosition=structuredClone(by('HEAD').ks.p),oldRotation=structuredClone(by('HEAD').ks.r)
by('HEAD').ks.p=baked(f=>{const t=time(f),p=at(oldPosition,f),s=sleepy(t),n=nod(t),w=startle(t);return [p[0]+3*s,p[1]+17*s+3.8*n-7*w,p[2]??0]},N,false,STEP)
by('HEAD').ks.r=baked(f=>{const t=time(f);return [Number(at(oldRotation,f))+11*sleepy(t)+3.5*nod(t)-7*startle(t)]},N,false,STEP)
const mouth=walk(old('Mouth').shapes).find(p=>p.ty==='sh'),smile=getShape(mouth.ks,90)
const bounds=[0,1].map(d=>[Math.min(...smile.v.map(p=>p[d])),Math.max(...smile.v.map(p=>p[d]))]),center=bounds.map(([a,b])=>(a+b)/2)
walk(by('Mouth').shapes).find(p=>p.ty==='sh').ks=baked(f=>{
 const t=time(f),s=sleepy(t),w=startle(t),width=44-17*s-9*w,height=10-8.5*s+3*w
 return warpShape(smile,p=>[(p[0]-center[0])*width/(bounds[0][1]-bounds[0][0])+center[0],(p[1]-center[1])*height/(bounds[1][1]-bounds[1][0])+center[1]+2*s])
},N,true,STEP)
// Only the original writing-side tablet/clip/pen; no presentation face or turn.
anim.assets[0].layers=anim.assets[0].layers.filter(l=>l.nm!=='Лицевая сторона · пустой лист')
anim.assets[0].layers=anim.assets[0].layers.map(l=>l.nm==='Pen'?l:snapshot(l))
for(const l of [...anim.layers,...anim.assets.flatMap(a=>a.layers??[])]){l.ip=0;l.op=N}
// Copy the complete approved yawning Z rig, not a manually rebuilt trajectory.
// Source100..179 is its emergence; then the letters continue drifting asleep.
const zsource=await read('packs/blue/clipboard-sleep/zzz-donor.tgs')
const zclock=f=>Math.max(100,Math.min(179,100+(time(f)-motion.zClockStart)*60))
function zretime(x){
 if(!x||typeof x!=='object')return x
 if(Array.isArray(x))return x.map(zretime)
 if(x.a===1&&Array.isArray(x.k)&&x.k[0]?.t!=null)return baked(f=>at(x,zclock(f)),N,false,STEP)
 return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,zretime(v)]))
}
// Begin the added flight during the donor's last27frames, not after it stops.
const floatTime=f=>Math.max(0,time(f)-(motion.zClockStart+79/60-motion.zHandoverLead))*motion.zFloatRate
const rig=structuredClone(zsource.layers.find(l=>l.ind===2))
rig.ind=120;rig.nm='Z · исходный масштаб';rig.ip=0;rig.op=N;anim.layers.unshift(rig)
for(const [i,donor]of zsource.layers.filter(l=>/^Z [123]$/.test(l.nm)).entries()){
 const letter=zretime(donor);letter.ind=110+i;letter.parent=120
 letter.nm=donor.nm+' · из090';letter.ip=0;letter.op=N
 // Blend the added outward flight into the donor's last moving poses.
 const drift=f=>{const d=floatTime(f);return d<.2?d*d/.4:d-.1}
 letter.ks.p=baked(f=>{
  const p=at(donor.ks.p,zclock(f)),d=drift(f),elapsed=floatTime(f),envelope=ramp(elapsed,0,.35)
  const sway=2.5*envelope*(Math.sin(2*Math.PI*elapsed/1.8+i*.7)-Math.sin(i*.7))
  const bob=(5+2*i)*envelope*(Math.sin(2*Math.PI*elapsed/1.3+i*.65)-Math.sin(i*.65))
  return [p[0]+(6+3*i)*d+sway,p[1]-(10+3*i)*d+bob,p[2]??0]
 },N,false,STEP)
 // The smallest letter goes first, followed rapidly by medium and large.
 letter.ks.o=baked(f=>[Number(at(donor.ks.o,zclock(f)))*ramp(time(f),motion.zClockStart,motion.zClockStart+.05)*(1-ramp(time(f),10.42+.09*i,10.50+.09*i))],N,false,STEP)
 const pop=10.42+.09*i,end=pop+.08
 letter.ks.s=baked(f=>{
  const base=at(donor.ks.s,zclock(f),[100,100,100]),factor=1+.12*pulse(time(f),pop-.035,pop+.005,pop+.045)-.65*ramp(time(f),pop+.025,end)
  return [base[0]*factor,base[1]*factor,base[2]??100]
 },N,false,STEP)
 anim.layers.unshift(letter)
 const vertices=walk(donor.shapes).filter(p=>p.ty==='sh').flatMap(p=>getShape(p.ks,179).v),box=[0,1].map(d=>[Math.min(...vertices.map(p=>p[d])),Math.max(...vertices.map(p=>p[d]))])
 const center=box.map(([a,b])=>(a+b)/2),height=box[1][1]-box[1][0]
 const rays=Array.from({length:4},(_,ray)=>{
  const angle=Math.PI/4+ray*Math.PI/2
  return group('Вспышка '+ray,[{ty:'sh',ks:baked(f=>{
   const u=ramp(time(f),pop+.025,pop+.22),radius=height*(.28+.12*u),length=7*(1-u)+1
   return {c:false,v:[radius,radius+length].map(r=>[center[0]+Math.cos(angle)*r,center[1]+Math.sin(angle)*r]),i:[[0,0],[0,0]],o:[[0,0],[0,0]]}
  },N,true,STEP)},stroke(5),stroke(2.5,'#ffffff')])
 })
 anim.layers.unshift({ty:4,ind:130+i,nm:'Z pop '+(i+1),parent:120,ip:0,op:N,
  ks:{...structuredClone(letter.ks),s:donor.ks.s?zretime(donor.ks.s):{a:0,k:[100,100,100]},o:baked(f=>[100*ramp(time(f),pop+.025,pop+.065)*(1-ramp(time(f),pop+.08,pop+.24))],N,false,STEP)},shapes:rays})
}
const dir=join(ROOT,'exports/clipboard-sleep');await mkdir(dir,{recursive:true})
await writeFile(join(dir,'drawing.json'),JSON.stringify(anim)+'\n')
await writeFile(join(dir,'writing-speed.json'),JSON.stringify(Array.from({length:31},(_,i)=>({seconds:i/2,speed:speed(i/2)})),null,2)+'\n')
const player=(await engine()).create(JSON.stringify(anim))
assert.deepEqual(player.render(0,512,512).slice(),player.render(N-1,512,512).slice(),'Exact loop seam')
const seconds=[0,1.3,2.3,3.24,4.5,5.8,7.1,8.3,9.7,10.65,11.43,12.07,13.3,14.99],sheet=new Canvas(256*7,276*2)
for(const [i,t]of seconds.entries()){
 const f=Math.round(t*(N-1)/15),px=player.render(f,512,512).slice()
 await writeFile(join(dir,`pose-${t}.png`),encodePng(px,512,512))
 sheet.text(`f ${f}`,i%7*256+3,Math.floor(i/7)*276+2,[60,60,60]);sheet.draw(player.render(f,256,256).slice(),256,i%7*256,Math.floor(i/7)*276+20)
}
await writeFile(join(dir,'storyboard.png'),encodePng(sheet.px,sheet.width,sheet.height));player.drop()
console.log('15s scene: exact loop; storyboard ready')

