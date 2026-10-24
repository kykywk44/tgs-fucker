import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {read,walk,world,point,transform,mul,I,at} from '../lib/silhouette.mjs'
import {ROOT,engine,load} from '../../../scripts/lib/sheets.mjs'
import {characterTime,tabletTime,turn,getShape,boardProjection,cameraMatrix,camera,penScreen,approach} from './scene.mjs'
const source=await read('packs/blue/clipboard/source-193.tgs'),anim=await read('exports/blue/clipboard.tgs'),board=boardProjection(source)
const by=(a,nm)=>a.layers.find(l=>l.nm===nm),ls=source.assets[0].layers,now=anim.assets[0].layers
for(const [file,id] of [['source.tgs','194'],['source-193.tgs','193']])assert.deepEqual(await readFile(join(import.meta.dirname,file)),await readFile(join(ROOT,`library/emoji/${id}.tgs`)))
assert.deepEqual(anim.layers.filter(l=>l.ind!==90).map(l=>l.nm),source.layers.filter(l=>['NULL SCALE','NULL FACE','Shape Layer 1','Pre-comp 1','Mouth','HEAD','BODY'].includes(l.nm)).map(l=>l.nm))
assert.ok(!JSON.stringify(anim).includes('writing-blue-hand'),'No imported/additional hands')
const dampedSource=structuredClone(source)
for(const k of by(dampedSource,'BODY').ks.s.k)for(const axis of ['s','e'])if(k[axis])k[axis]=k[axis].map(v=>100+(v-100)*.5)
for(const nm of ['BODY','HEAD','NULL FACE','Mouth','NULL SCALE']){
 assert.equal(by(anim,nm).parent,nm==='NULL SCALE'?90:by(source,nm).parent,`${nm} rig parent`)
 for(const f of [0,15,30,45,60,84,105,135,165,179]){
  const actual=world(anim.layers,by(anim,nm),f),expected=mul(cameraMatrix(f),world(dampedSource.layers,by(dampedSource,nm),characterTime(f)))
  for(const p of [[0,0],[-80,80],[80,80]])assert.ok(Math.hypot(...point(actual,p).map((v,d)=>v-point(expected,p)[d]))<.2,`${nm} source rig at ${f}`)
 }
}
let maxClockSpeed=0,maxReturnHeadSpeed=0,prev=null
for(let f=0;f<180;f++){
 if(f)maxClockSpeed=Math.max(maxClockSpeed,Math.abs(characterTime(f)-characterTime(f-1)))
 const pos=point(world(anim.layers,by(anim,'HEAD'),f),[0,0])
 if(prev&&f>=126)maxReturnHeadSpeed=Math.max(maxReturnHeadSpeed,Math.hypot(...pos.map((v,d)=>v-prev[d])))
 prev=pos
}
assert.ok(maxClockSpeed<1.05,'No fast-forward at the return')
assert.ok(maxReturnHeadSpeed<5,'Bound the smooth framing return for the taller head')
assert.equal(approach(48),0);assert.equal(approach(96),1);assert.equal(approach(126),1);assert.equal(approach(176),0)
function sourceShapes(items,parent,f,out=[]){const tr=items.find(p=>p.ty==='tr'),matrix=tr?mul(parent,transform(tr,f)):parent;for(const p of items){if(p.ty==='gr')sourceShapes(p.it,matrix,f,out);if(p.ty==='sh')out.push({p:getShape(p.ks,f),matrix})}return out}
let maxWritingError=0
for(const nm of ['Tablet','Pen','Исходный металлический зажим'])for(const f of [0,15,30,60,96,126,150,177,179]){
 const l=structuredClone(ls.find(l=>l.nm===(nm==='Pen'?'Pen':'Tablet')))
 if(nm==='Tablet')l.shapes[0].it=l.shapes[0].it.filter(g=>g.nm!=='Group 3')
 if(nm==='Исходный металлический зажим')l.shapes[0].it=l.shapes[0].it.filter(g=>['Group 3','Transform'].includes(g.nm))
 const original=sourceShapes(l.shapes,world(ls,l,tabletTime(f)),tabletTime(f)),shapes=walk(now.find(l=>l.nm===nm).shapes).filter(p=>p.ty==='sh')
 assert.equal(shapes.length,original.length)
 shapes.forEach((s,k)=>{const p=getShape(s.ks,f),o=original[k];p.v.forEach((v,i)=>{const src=point(o.matrix,o.p.v[i]),q=nm==='Pen'?penScreen(src,f):board.screen(src,f);maxWritingError=Math.max(maxWritingError,Math.hypot(...v.map((x,d)=>x-q[d])))})})
}
assert.ok(maxWritingError<.02,'Source writing tablet/pen geometry and position changed')
assert.equal(turn(0),0);assert.equal(turn(179),0);assert.equal(turn(80),1)
const mouth=walk(by(anim,'Mouth').shapes).find(p=>p.ty==='sh')
assert.ok(mouth.ks.a,'Smile should morph, not stay static')
const mouthWidths=[0,24,44,90,179].map(f=>{const p=getShape(mouth.ks,f);assert.equal(p.v.length,4);return Math.max(...p.v.map(v=>v[0]))-Math.min(...p.v.map(v=>v[0]))})
assert.ok(Math.max(...mouthWidths)/Math.min(...mouthWidths)>1.2,'Visible smile morph')
const bodyPaints=walk(by(anim,'BODY').shapes)
assert.equal(bodyPaints.filter(p=>p.ty==='sh').length,2,'Approved facepalm body outline and fill, without neck')
assert.ok(!bodyPaints.some(p=>p.c&&p.c.k[0]>.6),'No pale invented shoulder highlights')
const {telegramChecks}=await load('src/core/checks.ts'),bytes=await readFile(join(ROOT,'exports/blue/clipboard.tgs'))
assert.ok(telegramChecks(anim,bytes.length).every(c=>c.ok));assert.equal(anim.op-anim.ip,180)
const e=await engine(),p=e.create(JSON.stringify(anim)),S=512;let first,last,topShown=512,whiteShown=0,whiteStart=0,maxYStart=0,minYStart=512
for(let f=0;f<180;f++){
 const px=p.render(f,S,S).slice();let count=0
 for(let y=0;y<S;y++)for(let x=0;x<S;x++){const k=(y*S+x)*4;if(px[k+3]>0){count++;if(f===105)topShown=Math.min(topShown,y);if(f===0){maxYStart=Math.max(maxYStart,y);minYStart=Math.min(minYStart,y)}}if(px[k]>240&&px[k+1]>240&&px[k+2]>240&&px[k+3]>250){if(f===105)whiteShown++;if(f===0)whiteStart++}}
 assert.ok(count>20000,`Empty frame ${f}`);if(f===0)first=px;if(f===179)last=px
}
p.drop();assert.deepEqual(first,last,'Loop join');assert.ok(topShown>=80&&topShown<=90,'Reserve about 1/6 of the frame above the presented board');assert.equal(maxYStart,511,'Character must meet the bottom edge');assert.ok(minYStart>=8&&minYStart<=45,'Taller head has top clearance');assert.ok(whiteShown>S*S*.45);assert.ok(whiteShown>whiteStart*20)
await writeFile(join(ROOT,'exports/sheets/clipboard/verified.json'),JSON.stringify({frames:180,bytes:bytes.length,loopPixelExact:true,sourceRig:true,maxWritingError,topShown,maxYStart,minYStart,maxClockSpeed,maxReturnHeadSpeed,whiteStart,whiteShown,noAddedHands:true},null,2)+'\n')
console.log('clipboard: source rig + facepalm-scale framing at bottom edge, cubic approach/return, no fast-forward/head jerk, no added hands, simple smile, 1/6 top space, 180 frames and loop PASS')

