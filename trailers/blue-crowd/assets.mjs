// Exact pack artwork. Independent body/laptop passes let every lid cover its row.
import assert from 'node:assert/strict'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {ROOT,engine,encodePng} from '../../scripts/lib/sheets.mjs'
import {read,walk,point,world} from '../../packs/blue/lib/silhouette.mjs'
import {freeze} from '../../packs/blue/lib/freeze.mjs'

const cfg=JSON.parse(await readFile(join(import.meta.dirname,'scene.json'),'utf8'))
const out=join(ROOT,'exports/blue-crowd'),SIZE=768,H=cfg.hero
for(const type of ['typing','hero'])for(const pass of ['body','laptop'])
  await mkdir(join(out,type,pass),{recursive:true})
const source=await read('packs/blue/ready/technologist-bust.tgs')
const finger=await read('packs/blue/ready/middle-finger.tgs')
const laugh=await read('packs/blue/ready/face-with-hand-over-mouth.tgs')
const eng=await engine()
const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10)}
const phase=(t,a,b)=>smooth((t-a)/(b-a))
const by=(a,name)=>a.layers.find(l=>l.nm===name)
const typingFrame=t=>25-25*Math.cos(t*Math.PI*2)
function mix(a,b,w){
  if(typeof a==='number')return a+(b-a)*w
  if(Array.isArray(a)){assert.equal(a.length,b.length,'Pose topology changed');return a.map((v,i)=>mix(v,b[i],w))}
  if(a&&typeof a==='object')return Object.fromEntries(Object.entries(a).map(([k,v])=>[k,k in b?mix(v,b[k],w):structuredClone(v)]))
  return structuredClone(a)
}
function character(frame){
  const a=freeze(structuredClone(source),frame)
  a.ip=0;a.op=1
  for(const l of a.layers){l.ip=0;l.op=1}
  return a
}
const open=character(0),closed=character(90)
const openLaptop=structuredClone(by(open,'Laptop').shapes),closedLaptop=structuredClone(by(closed,'Laptop').shapes)
function typing(t){
  const index=Math.round(((t/2)%1)*120)%120,a=character(typingFrame(index/120))
  by(a,'Laptop').shapes=structuredClone(openLaptop)
  for(const name of ['Wrist Front','Wrist Front 2','Wrist Far'])by(a,name).shapes=[]
  return a
}
const neutral=typing(0)
async function render(a,file){
  const p=eng.create(JSON.stringify(a));assert.ok(p)
  await writeFile(file,encodePng(p.render(0,SIZE,SIZE).slice(),SIZE,SIZE));p.drop()
}
async function passes(a,type,frame){
  const body=structuredClone(a),laptop=structuredClone(a)
  by(body,'Laptop').shapes=[]
  for(const l of laptop.layers)if(l.nm!=='Laptop'){delete l.refId;l.ty=3;delete l.shapes}
  const name=String(frame).padStart(type==='typing'?3:4,'0')+'.png'
  await render(body,join(out,type,'body',name))
  await render(laptop,join(out,type,'laptop',name))
}
for(let f=0;f<120;f++)await passes(typing(f/60),'typing',f)
console.log('120 typing phases, separate bodies and laptops rendered')

// Use the calm pose only, without the source thrust or fist shake. Its mirrored
// outline has the same world width as the laptop-gripping hand: 8 × .93 = 7.44.
const handPose=freeze(structuredClone(finger),0)
for(const l of handPose.layers){l.ip=0;l.op=1}
for(const l of handPose.layers)for(const p of walk(l.shapes??[]))if(p.ty==='st')p.w.k*=H.handOutlineGain
assert.ok(Math.abs(8*H.handOutlineGain*H.handScale-7.44)<1e-8)

// The original relaxed grip follows the top-left lid corner rigidly. The lid
// pass hides its lower part, so no wrist can float across the laptop panel.
const grip=structuredClone(closed)
for(const l of grip.layers)if(!['Wrist Front','Wrist Far'].includes(l.nm))l.shapes=[]
function corner(a){
  const laptop=by(a,'Laptop'),edge=walk(laptop.shapes).find(p=>p.ty==='sh')
  return point(world(a.layers,laptop,0),edge.ks.k.v[3])
}
const closedCorner=corner(closed)
// Preserve the reference's authored Bezier timing, tooth shapes and head bob.
function laughPose(frame){
  const pose=freeze(structuredClone(laugh),frame)
  for(const l of pose.layers){l.ip=0;l.op=1}
  const h=by(pose,'Head'),m=world(pose.layers,h,0),center=point(m,[256.332,250.448])
  const mouth=by(pose,'mouth-2'),mm=world(pose.layers,mouth,0)
  for(const l of pose.layers)if(l.nm!=='mouth-2'){delete l.shapes;delete l.refId;l.ty=3}
  mouth.ks.o={a:0,k:100}
  return {pose,center,m,angle:Math.atan2(mm[1],mm[0])*180/Math.PI}
}
const comp=(ind,nm,id,p,anchor=[0,0],s=[100,100],r=0)=>({ty:0,ind,nm,refId:id,ip:0,op:1,st:0,sr:1,w:512,h:512,
  ks:{o:{a:0,k:100},p:{a:0,k:[...p,0]},a:{a:0,k:[...anchor,0]},s:{a:0,k:[...s,100]},r:{a:0,k:r}}})
const start=Math.floor(H.settle[0]*cfg.fps),end=Math.ceil(cfg.seconds*cfg.fps),motion=[]
for(let f=start;f<=end;f++){
  const t=f/cfg.fps,settle=phase(t,...H.settle)
  // Preserve the exact incoming typing pose, then ease into a still neutral
  // pose. After opening the laptop he stays still, recalling his work.
  const a=mix(typing(t),neutral,settle)
  const lower=phase(t,...H.lowerLaptop)*(1-phase(t,...H.openLaptop))
  by(a,'Laptop').shapes=mix(openLaptop,closedLaptop,lower)
  const head=by(a,'HEAD'),peek=phase(t,...H.peek),tilt=phase(t,...H.tiltHead),recover=phase(t,...H.recoverHead)
  const laughing=phase(t,5.05,5.7)*(1-phase(t,7.8,8.7))
  const laughFrame=20+95*phase(t,5.15,8.1),ref=laughPose(laughFrame)
  const headAngle=(-4.5*tilt*(1-recover)+1.6*recover+ref.angle*.5*laughing)*settle
  head.ks.r.k+=headAngle
  head.ks.p.k[0]+=(-3*tilt*(1-recover)+1.5*recover+(ref.center[0]-256)*.25*laughing)*settle
  head.ks.p.k[1]+=(-9*peek*(1-recover)+7*recover+(ref.center[1]-256)*.3*laughing)*settle
  head.ks.s??={a:0,k:[100,100,100]}
  head.ks.s.k[0]*=1+(ref.m[0]-1.02)*.4*laughing
  head.ks.s.k[1]*=1+(ref.m[3]-1.02)*.4*laughing
  a.assets??=[]
  const smile=phase(t,4.55,5.55)*(1-phase(t,7.9,8.8))
  a.assets.push({id:'reference-laugh-mouth',layers:ref.pose.layers})
  const mouth=comp(101,'070 mouth · original curves and teeth','reference-laugh-mouth',[-153.6,-89],
    [0,0],[60,60*(.65+.35*smile)])
  // Keep the mouth centre fixed as it opens; never fade between expressions.
  mouth.ks.p.k[1]=47-340*.6*(.65+.35*smile)
  mouth.parent=head.ind;a.layers.unshift(mouth)
  const reach=phase(t,...H.reachGrip)*(1-phase(t,...H.releaseGrip))
  if(reach>1e-5){
    const edge=corner(a),delta=edge.map((v,d)=>v-closedCorner[d])
    // Start fully inside the occluding lid, travel on an arc to the grip point.
    // Moving up at the outside edge previously exposed a spawning wrist.
    delta[0]+=12+30*(1-reach)-10*Math.sin(Math.PI*reach)
    delta[1]+=78*(1-reach)
    a.assets.push({id:'stable-right-grip',layers:structuredClone(grip.layers)})
    a.layers.splice(1,0,comp(102,'Right hand attached to lid','stable-right-grip',delta))
  }
  const lift=phase(t,...H.raiseHand)*(1-phase(t,...H.lowerHand))
  let handAngle=0
  if(lift>1e-5){
    const wave=phase(t,6.65,7.1)*(1-phase(t,7.65,8.1))
    handAngle=-6*(1-lift)+(H.handSwayDegrees*Math.sin((t-H.hold[0])*2*Math.PI/2.8)+
      H.handWaveDegrees*wave*Math.sin((t-6.65)*2*Math.PI/0.72))*phase(t,...H.raiseHand)
    a.assets.push({id:'relaxed-left-hand',layers:structuredClone(handPose.layers)})
    const p=[H.handPivot[0]+7*(1-lift),H.handPivot[1]+125*(1-lift)]
    a.layers.splice(1,0,comp(103,'Left hand · gentle wrist sway','relaxed-left-hand',p,H.handAnchor,
      [-H.handScale*100,H.handScale*100],handAngle))
  }
  await passes(a,'hero',f)
  motion.push({frame:f,typingWeight:1-settle,laptopLower:lower,headAngle,handLift:lift,handAngle,
    laughFrame,mouthOpen:smile,mouthOpacity:100})
  if(f%60===0)console.log(`Hero ${f}/${end}`)
}
await writeFile(join(out,'motion.json'),JSON.stringify(motion))
await writeFile(join(out,'assets.json'),JSON.stringify({size:SIZE,typing:120,hero:[start,end],
  passes:['body','laptop'],mirroredLeftHand:true,outlineWidthPx:7.44,smile:'opaque shape morph',
  noTypingAfterGesture:true,scene:cfg},null,2))
console.log('Sprite passes ready: '+out)
