// Restyle 193 in place: retain source rig/framing/writing geometry, replace only appearance
// and the tablet's old put-away section. The presentation has no added hand/arm layers.
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {read,head,at,baked,walk,group,stroke,gradient,rgb,finish,point,mapProperty} from '../lib/silhouette.mjs'
import {retime,characterTime,tabletTime,turn,getShape,roundRect,warpShape,boardProjection,bakeSourceLayer,STEP,FRAMES,LONG,poseValue,nod,smileAmount,presentationDrop,approach,penScreen} from './scene.mjs'
const source=await read('packs/blue/clipboard/source-193.tgs'),anim=retime(source)
anim.nm=LONG?'193 · 6с · Взгляд, кивок, запись, показ (WebM-превью)':'193 · Записывает и показывает'
const by=nm=>anim.layers.find(l=>l.nm===nm),original=nm=>source.layers.find(l=>l.nm===nm)
// Keep the source breathing curve, with half its amplitude after the 142% close-up.
for(const k of by('BODY').ks.s.k)for(const axis of ['s','e'])if(k[axis])k[axis]=k[axis].map(v=>100+(v-100)*.5)
const keep=new Set(['NULL SCALE','NULL FACE','Shape Layer 1','Pre-comp 1','HEAD','Mouth','BODY'])
anim.layers=anim.layers.filter(l=>keep.has(l.nm))
// The original face envelope sets the head's size and centre every frame, on the original rig.
const matte=walk(original('Shape Layer 1').shapes).find(p=>p.ty==='sh').ks
walk(by('Shape Layer 1').shapes).find(p=>p.ty==='sh').ks=baked(f=>{const p=structuredClone(getShape(matte,0));for(const i of [1,2])p.v[i][1]+=49.5*approach(f);return p},FRAMES,true,STEP)
const oldOval=walk(original('HEAD').shapes).find(p=>p.ty==='sh').ks
const sourceHeads=head(oldOval,{outline:7,bottom:[0,119],top:[0,-125]})
by('HEAD').shapes=retime(sourceHeads,characterTime,poseValue)
// Match facepalm's 1.341 height/width ratio in each writing and frontal pose.
// Jaw-relative fitting and downward clearance keep the taller crown inside.
const headPaths=walk(by('HEAD').shapes).filter(p=>p.ty==='sh'),headEnvelope=structuredClone(headPaths.at(-1).ks)
for(const p of headPaths){const before=structuredClone(p.ks);p.ks=baked(f=>{
 const envelope=getShape(headEnvelope,f),bounds=[0,1].map(d=>[Math.min(...envelope.v.map(v=>v[d])),Math.max(...envelope.v.map(v=>v[d]))])
 const jaw=bounds[1][1],factor=1.341013287*(bounds[0][1]-bounds[0][0])/(bounds[1][1]-bounds[1][0])
 return warpShape(getShape(before,f),([x,y])=>[x,jaw+(y-jaw)*factor+(LONG?22:10)])
},FRAMES,true,STEP)}
if(LONG){
 by('HEAD').ks=retime(original('HEAD').ks,characterTime,poseValue)
 by('NULL FACE').ks=retime(original('NULL FACE').ks,characterTime,poseValue)
 by('HEAD').ks.p=baked(f=>{const p=poseValue(original('HEAD').ks.p,f);return [p[0],p[1]+7*nod(f),p[2]]},FRAMES,false,STEP)
 by('HEAD').ks.r=baked(f=>[Number(poseValue(original('HEAD').ks.r,f))+3*nod(f)],FRAMES,false,STEP)
}
// Reuse the approved card's smile curve, centred symmetrically. A shape morph
// gently broadens it before presentation, without lips or an opacity fade.
const card=await read('packs/blue/ready/identification-card.tgs')
const cardMouth=[...card.layers,...card.assets.flatMap(a=>a.layers??[])].find(l=>l.nm==='Mouth')
const cardSmile=getShape(walk(cardMouth.shapes).find(s=>s.ty==='sh').ks,110)
const mouthBox=[0,1].map(d=>[Math.min(...cardSmile.v.map(v=>v[d])),Math.max(...cardSmile.v.map(v=>v[d]))])
const mouthCenter=mouthBox.map(([a,b])=>(a+b)/2)
by('Mouth').shapes=[group('Улыбка карточки · плавный морф',[
 {ty:'sh',ks:baked(f=>{
  const u=smileAmount(f),scale=[(43+15*u)/(mouthBox[0][1]-mouthBox[0][0]),(9+6*u)/(mouthBox[1][1]-mouthBox[1][0])]
  return {c:true,v:cardSmile.v.map(v=>v.map((x,d)=>(d?73:4)+(x-mouthCenter[d])*scale[d])),
   i:cardSmile.i.map(v=>v.map((x,d)=>x*scale[d])),o:cardSmile.o.map(v=>v.map((x,d)=>x*scale[d]))}
 },FRAMES,true,STEP)},
 {ty:'fl',c:{a:0,k:[1,1,1,1]},o:{a:0,k:100},r:1}])]
// Transplant the approved facepalm torso, with its original rounded shoulders,
// fill and outline. Only an affine fit changes; the old neck is gone entirely.
const facepalm=await read('packs/blue/ready/facepalm.tgs')
const approvedBody=facepalm.assets[0].layers.find(l=>l.nm==='BODY')
const bodyFit=[.80,0,0,1.13,0,-1.85]
function bodySnapshot(x){
 if(!x||typeof x!=='object')return x
 if(Array.isArray(x))return x.map(bodySnapshot)
 if(x.a===1&&Array.isArray(x.k)&&x.k[0]?.t!=null){const v=at(x,0);return {a:0,k:Array.isArray(v)&&v.length===1?v[0]:v}}
 return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,bodySnapshot(v)]))
}
by('BODY').shapes=bodySnapshot(approvedBody.shapes)
for(const p of walk(by('BODY').shapes)){
 if(p.ty==='sh')p.ks=mapProperty(p.ks,s=>warpShape(s,q=>point(bodyFit,q)))
 if(p.ty==='st')p.w={a:0,k:7}
 if(p.ty==='gf')for(const k of ['s','e'])p[k]={a:0,k:point(bodyFit,p[k].k)}
}
const board=boardProjection(source),srcPen=board.ls.find(l=>l.nm==='Pen')
const tablet=bakeSourceLayer(board.ls,board.tablet,board.screen),pen=bakeSourceLayer(board.ls,srcPen,penScreen)
const gray={'#b7632a':'#959ba2','#773113':'#50575f','#cc7a36':'#b4b9c0','#b57709':'#6c7680','#f7df2d':'#b9c1ca'}
const hex=c=>'#'+c.slice(0,3).map(n=>Math.round(n*255).toString(16).padStart(2,'0')).join('')
for(const p of walk(tablet.shapes))if(p.c){const c=gray[hex(p.c.k)];if(c)p.c={a:0,k:[...rgb(c),1]}}
// Pen uses its original shapes/motion; remove the purple cast, keep grey highlights.
const dark=c=>{const v=c[0]*.2126+c[1]*.7152+c[2]*.0722;return [v*.72,v*.72,v*.72,c[3]??1]}
for(const p of walk(pen.shapes)){
 if(p.c&&!p.c.a)p.c.k=dark(p.c.k)
 if(p.g){const a=p.g.k.k;for(let i=0;i<p.g.p;i++)a.splice(i*4+1,3,...dark(a.slice(i*4+1,i*4+4)).slice(0,3))}
}
// Keep one actual source clip through the whole turn. It sits above the paper
// on both sides instead of switching to a differently shaped front replacement.
const clipBack=tablet.shapes[0].it.find(g=>g.nm==='Group 3')
tablet.shapes[0].it=tablet.shapes[0].it.filter(g=>g!==clipBack)
const solid=c=>({ty:'fl',c:{a:0,k:[...rgb(c),1]},o:{a:0,k:100},r:1})
const warp=(nm,p,paint,outline=0)=>group(nm,[{ty:'sh',ks:baked(f=>warpShape(p,q=>board.front(q,f)),FRAMES,true,STEP)},...(outline?[stroke(outline,'#9ca3ac')]:[]),paint])
const front=group('Белый лист под зажимом',[
 warp('Лист',roundRect(-.87,-.88,1.74,1.78,.018),solid('#ffffff'),1),
 warp('Тень бумаги',roundRect(-.84,-.85,1.74,1.78,.018),solid('#707781'))])
front.it.at(-1).o=baked(f=>[turn(f)>=.5?100:0],FRAMES)
const identity={o:{a:0,k:100},r:{a:0,k:0},p:{a:0,k:[0,0,0]},a:{a:0,k:[0,0,0]},s:{a:0,k:[100,100,100]}}
const page={ty:4,ind:3,nm:'Лицевая сторона · пустой лист',ip:0,op:FRAMES,st:0,sr:1,ks:identity,shapes:[front]}
const sourceClip={ty:4,ind:4,nm:'Исходный металлический зажим',ip:0,op:FRAMES,st:0,sr:1,ks:structuredClone(identity),shapes:[clipBack]}
// Preserve original board-over-pen occlusion. No attached presentation hand.
anim.assets[0].layers=[sourceClip,page,tablet,pen]
// One framing transform for the inherited rig and original matte. Board presentation
// is independently projected into the canvas so its 1/6 top margin remains fixed.
for(const nm of ['NULL SCALE','Shape Layer 1'])by(nm).parent=90
anim.layers.push({ty:3,ind:90,nm:'Масштаб facepalm · к нижней грани',ip:0,op:FRAMES,st:0,sr:1,
 ks:{o:{a:0,k:100},r:{a:0,k:0},a:{a:0,k:[256,462.5,0]},p:baked(f=>[234,512+presentationDrop*approach(f),0],FRAMES,false,STEP),s:{a:0,k:[142,142,100]}}})
// The long vector scene is a local master, not a claim to pass TGS upload rules.
// All layer out-points must extend too, otherwise the second half renders empty.
if(LONG){
 anim.op=FRAMES
 for(const l of [...anim.layers,...anim.assets.flatMap(a=>a.layers??[])])l.op=FRAMES
}
function clean(x){if(!x||typeof x!=='object')return;if(x.ty==='tr'){delete x.sk;delete x.sa}for(const v of Object.values(x))if(v&&typeof v==='object')clean(v)}clean(anim)
function roundAll(x){if(!x||typeof x!=='object')return;for(const k of Object.keys(x)){if(typeof x[k]==='number'&&!Number.isInteger(x[k]))x[k]=Math.round(x[k]*100)/100;else roundAll(x[k])}}roundAll(anim)
// Retain hold endpoints but remove redundant identical samples. This leaves space
// for the future inscription without changing the rendered trajectory.
function compact(x){
 if(!x||typeof x!=='object')return
 if(x.a===1&&Array.isArray(x.k)&&x.k[0]?.t!=null){
  const keys=x.k,values=keys.map(k=>JSON.stringify(k.s))
  if(values.every(v=>v===values[0])){const s=keys[0].s;x.a=0;x.k=s.length===1?s[0]:s;return}
  x.k=keys.filter((k,i)=>i===0||i===keys.length-1||values[i]!==values[i-1]||values[i]!==values[i+1])
 }
 for(const v of Object.values(x))compact(v)
}compact(anim)
if(LONG){
 const {exportLong}=await import('./long-preview.mjs')
 await exportLong(anim)
}else{
 await finish('clipboard',source,anim,[0,24,44,56,68,80,96,112,126,140,152,164,176,179])
 await writeFile(join(import.meta.dirname,'drawing.json'),JSON.stringify(anim)+'\n')
}
