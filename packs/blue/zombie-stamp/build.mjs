// 🧟 + stamp: a blue zombie (208 made one of the pack's silhouettes, zombie.mjs) comes up from below,
// shambling with its arms out; a grey rubber stamp (stamp.mjs: a 3D model projected frame by frame,
// docs/3d-objects.md) flies in from off the frame and slams onto its face, the head recoils, a
// bluish n is left above the sad mouth, the stamp flies off; the zombie shambles on a little and
// sinks out of the frame. Nothing is in the frame at the first and the last frame: it loops.
// node packs/blue/zombie-stamp/build.mjs   (parameters: motion.json)
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {read,finish,world,point,group,rgb} from '../lib/silhouette.mjs'
import {glyph} from '../lib/glyph.mjs'
import {stampLayers} from './stamp.mjs'
import {blueZombie} from './zombie.mjs'

const name='zombie-stamp'
const cfg=JSON.parse(await readFile(join(import.meta.dirname,'motion.json'),'utf8'))
const source=await read(`library/emoji/${cfg.zombie.n}.tgs`)
const FRAMES=180,T=cfg.timing,HIT=T.hit
const curves={in:(u)=>u**2.4,out:(u)=>1-(1-u)**3,inout:(u)=>u*u*(3-2*u),linear:(u)=>u}
const ease={linear:{o:{x:[0],y:[0]},i:{x:[1],y:[1]}},in:{o:{x:[0.6],y:[0]},i:{x:[0.9],y:[1]}},out:{o:{x:[0.1],y:[0]},i:{x:[0.3],y:[1]}},inout:{o:{x:[0.45],y:[0]},i:{x:[0.55],y:[1]}}}
const keys=(list,wrap=(v)=>v)=>({a:1,k:list.map(([t,v,e],n)=>({t,s:wrap(v),...(n<list.length-1&&ease[e??'inout'])}))})
const nul=(nm,ind,ks)=>({ty:3,nm,ind,ip:0,op:FRAMES,st:0,sr:1,ao:0,ks:{o:{a:0,k:100},r:{a:0,k:0},s:{a:0,k:[100,100,100]},
  p:{a:0,k:[0,0,0]},a:{a:0,k:[0,0,0]},...ks}})

// ---------- the zombie ----------
const anim=await blueZombie(cfg.zombie.n,cfg.zombie)
anim.nm='208 + штамп · Зомби со штампом'
const by=(nm)=>anim.layers.find((l)=>l.nm===nm)
let ind=Math.max(...anim.layers.map((l)=>l.ind))+1

// In and out (all of it hangs on 'Rise'): drawn in from behind — small and low, body first, it
// grows into its place with a little overshoot — and at the end out forwards and down, growing.
const R=T.rise,rise=nul('Rise',ind++,{a:{a:0,k:[...R.pivot,0]},
  p:keys(R.keys.map(([t,y,,e])=>[t,[R.pivot[0],R.pivot[1]+y,0],e])),s:keys(R.keys.map(([t,,s,e])=>[t,[s,s,100],e]))})
for(const l of anim.layers)if(l.parent==null)l.parent=rise.ind
anim.layers.push(rise)

// The head: upright for the hit (its own sway otherwise). Between HEAD and BODY two nulls, both
// turning about the chin: 'Recoil' — the blow (motion.json → head.recoil: the top tipped back, a
// shorter face, then forward past its place and back again, inertia on inertia), and 'Lag' — the
// head late behind the body's moves in and out, a damped spring pushed by the body's vertical
// acceleration on the canvas; late below it, it is tipped back (a shorter face).
const HEAD=by('HEAD')
HEAD.ks.r=keys(cfg.head.sway.map(([t,r])=>[t,r]),(v)=>[v])
const C=cfg.head.recoil,pivot={a:{a:0,k:[...C.pivot,0]},p:{a:0,k:[...C.pivot,0]}}
const recoil=nul('Recoil',ind++,pivot),lag=nul('Lag',ind++,structuredClone(pivot))
recoil.parent=HEAD.parent;lag.parent=recoil.ind;HEAD.parent=lag.ind
// tipped back is a shorter face about the chin, so the neck stays covered
recoil.ks.s=keys(C.keys.map(([t,sx,sy])=>[HIT+t,[sx,sy,100]]))
recoil.ks.p=keys(C.keys.map(([t,,,dy])=>[HIT+t,[C.pivot[0],C.pivot[1]+dy,0]]))
recoil.ks.r=keys(C.keys.map(([t,,,,r])=>[HIT+t,[r]]))
anim.layers.push(recoil,lag)
const L=cfg.head.lag,riseY=(t)=>world(anim.layers,rise,Math.max(0,Math.min(FRAMES-1,t)))[5]
const w=2*Math.PI/L.period
let x=0,v=0
const late=[]
for(let t=0;t<FRAMES;t++){
  v+=-w*w*x-2*L.damping*w*v-(riseY(t+1)-2*riseY(t)+riseY(t-1))*L.gain
  x+=v
  // late below the body it may be as much as the spring says; above, only a little (the head
  // would come off its neck)
  late.push(Math.max(x,-L.up))
}
const lagT=[...Array.from({length:Math.ceil(FRAMES/2)},(_,i)=>i*2),FRAMES-1]
lag.ks.p={a:1,k:lagT.map((t)=>({t,s:[C.pivot[0],C.pivot[1]+late[t],0],o:{x:[0],y:[0]},i:{x:[1],y:[1]}}))}
lag.ks.s={a:1,k:lagT.map((t)=>({t,s:[100,100-Math.max(0,late[t])*L.tip,100],o:{x:[0],y:[0]},i:{x:[1],y:[1]}}))}

// the mouth: sad, it shuts and opens a few times, gapes at the hit (motion.json → zombie.mouth)

// ---------- the print: a big bluish n above the mouth, from the hit on ----------
// It lies on the front of the face: it hangs on 208's 'Nose' null, which carries the face (the
// mouth too) as the head looks about, and on top of that ('Лицо') it goes further the way the face
// turns and is foreshortened that way — a mark on the front of a round head, not a picture on it.
const P=cfg.print,NOSE=by('Nose'),[ax,ay]=NOSE.ks.a.k
const faceNull=nul('Лицо',ind++,{})
faceNull.parent=NOSE.ind
const turn=(d,axis)=>Math.asin(Math.max(-0.95,Math.min(0.95,d*P.turn[axis]/P.radius)))
// the nose's keys give the timing; their spatial tangents (to/ti) belong to its own path only
const timing=NOSE.ks.p.k.map(({to,ti,...k})=>k)
faceNull.ks.p={a:1,k:timing.map((k)=>({...k,s:[(k.s[0]-ax)*P.slide[0],(k.s[1]-ay)*P.slide[1],0]}))}
faceNull.ks.s={a:1,k:timing.map((k)=>({...k,s:[100*Math.cos(turn(k.s[0]-ax,0)),100*Math.cos(turn(k.s[1]-ay,1)),100]}))}
anim.layers.push(faceNull)
const n=glyph('n',P.height).map((k)=>({...k,v:k.v.map(([x,y])=>[x,y+P.height/2])}))
const print={ty:4,nm:'Отпечаток n',ind:ind++,parent:faceNull.ind,ip:0,op:FRAMES,st:0,sr:1,ao:0,
  ks:{o:keys([[0,0,'linear'],[HIT+P.appear-1,0,'linear'],[HIT+P.appear,P.opacity]],(v)=>[v]),r:{a:0,k:0},
    p:{a:0,k:[...P.at,0]},a:{a:0,k:[0,0,0]},
    s:keys([[0,[P.pop,P.pop,100]],[HIT+P.appear,[P.pop,P.pop,100],'out'],[HIT+P.appear+P.settle,[100,100,100]]])},
  shapes:[group('n',[...n.map((k)=>({ty:'sh',ks:{a:0,k}})),{ty:'fl',c:{a:0,k:[...rgb(P.color),1]},o:{a:0,k:100},r:1}])]}
// drawn over the head, under the mouth's layer
anim.layers.splice(anim.layers.indexOf(HEAD),0,print)

// ---------- the stamp ----------
// The strike's keys marked "face" ride on the print's place: where it is on the canvas at that
// frame, the stamp as much smaller as the head is then (knocked back, it takes the stamp along).
// The others (off the frame) are absolute.
const S=cfg.strike,start=HIT-S.touch
const onFace=(t)=>{const m=world(anim.layers,faceNull,t);return {at:point(m,P.at),scale:Math.sqrt(Math.abs(m[0]*m[3]-m[1]*m[2]))}}
const ref=onFace(HIT).scale
const K=S.keys.map((k)=>{
  if(!k.face)return k
  const f=onFace(start+k.t)
  return {...k,x:f.at[0]+k.x,y:f.at[1]+k.y,scale:k.scale*f.scale/ref}
})
const pose=(t)=>{
  const i=K.findIndex((k,j)=>K[j+1]&&t>=k.t&&t<=K[j+1].t),a=K[i],b=K[i+1],u=curves[a.ease]((t-a.t)/(b.t-a.t))
  return Object.fromEntries(['x','y','scale','yaw','pitch','roll','squash'].map((k)=>[k,(a[k]??1)+((b[k]??1)-(a[k]??1))*u]))
}
const local=[...new Set([...Array.from({length:Math.ceil(S.length/S.step)},(_,i)=>i*S.step),...K.map((k)=>k.t)])].filter((t)=>t<=S.length).sort((a,b)=>a-b)
const stamp=stampLayers(cfg.stamp,local.map((t)=>({...pose(t),t:start+t})),{ind,ip:start,op:start+S.length})
anim.layers.unshift(...stamp)

await finish(name,source,anim,[0,10,20,30,60,70,73,76,80,86,92,100,140,155,170,179],{allowEmpty:true})
