// 😝 + ✌️: 026 (squinting face with tongue) in the manner of the big faces (the 069 head, no eyes,
// white mouth, the tongue in the pack's light blues), and a small V hand, back to the camera
// (hand.mjs: made from 154). Hand on the left and head on the right meet in the middle as the
// tongue comes out, the tongue wags between the two fingers (which jiggle a little), and they part
// again as the wagging ends. Looped like 026.
// node packs/blue/tongue-victory/build.mjs   (parameters: motion.json)
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {read,by,whiteMouth,walk,rgb} from '../lib/large-face.mjs'
import {head,path,finish,world} from '../lib/silhouette.mjs'
import {victoryHand} from './hand.mjs'

const name='tongue-victory'
const cfg=JSON.parse(await readFile(join(import.meta.dirname,'motion.json'),'utf8'))
const source=await read(`packs/blue/${name}/source.tgs`),anim=structuredClone(source)
anim.nm='026 + ✌️ · Язык между пальцами'
const FRAMES=anim.op-anim.ip

// ---------- the face ----------
for(const nm of ['Eyes Open','EYES MAIN'])anim.layers.splice(anim.layers.indexOf(by(anim.layers,nm)),1)
// the 069 head where the circle is: its centre is the circle group's own offset, 12 px lower as in kissing-face
const body=by(anim.layers,'BODY'),outer=body.shapes[0]
const H=378.29418/.97,[cx,cy]=outer.it.find(g=>g.nm==='Group 5').it.find(x=>x.ty==='tr').p.k
body.shapes=[{...structuredClone(outer),it:[...head(path(body),{width:300/.97,height:H,center:[cx,cy+12],
  bottom:[cx,cy+12+H/2],top:[cx,cy+12-H/2],outline:8/.97}),structuredClone(outer.it.find(x=>x.ty==='tr'))]}]
whiteMouth(by(anim.layers,'Mouth'),['Group 1','Group 2'])

// the tongue: outline dark blue, its root in the mouth the body's shade, the tongue a light-blue gradient
const T=cfg.tongue,hex=c=>'#'+c.slice(0,3).map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('')
const TONGUE={'#9f1646':T.outline,'#df335d':T.outline,'#b70040':T.dark,'#ed8901':T.dark}
for(const nm of ['Tongue','Shadow Tongue'])for(const x of walk(by(anim.layers,nm).shapes)){
  if((x.ty==='fl'||x.ty==='st')&&!x.c.a){const to=TONGUE[hex(x.c.k)];if(!to)throw new Error(nm+': '+hex(x.c.k));x.c={a:0,k:[...rgb(to),1]}}
  if(x.ty==='gf')x.g={p:T.stops.length,k:{a:0,k:T.stops.flatMap(([at,c])=>[at,...rgb(c)])}}
}

// the whole face smaller and higher, so the hand fits under it; the tongue a little smaller to pass
// between the fingers
const F=cfg.face,resize=by(anim.layers,'Resize')
resize.ks.s={a:0,k:[F.scale,F.scale,100]}
resize.ks.p={a:0,k:[256,F.y,0]}
by(anim.layers,'Tongue').ks.s={a:0,k:[T.scale,T.scale,100]}

// ---------- the hand ----------
const C=cfg.hand
const {hand,bend}=await victoryHand(C)
const shift=Math.max(...anim.layers.map(l=>l.ind))+1
const handLayers=hand.layers.map(l=>({...l,ind:l.ind+shift,parent:l.parent==null?undefined:l.parent+shift,ip:0,op:FRAMES}))
const holder={ty:3,nm:'Hand',ind:shift+500,parent:by(anim.layers,'Mouth').ind,ip:0,op:FRAMES,st:0,sr:1,ao:0,ks:{
  o:{a:0,k:100},r:{a:0,k:C.tilt},a:{a:0,k:[...C.gap,0]},s:{a:0,k:[C.scale,C.scale,100]},p:null}}
for(const l of handLayers)if(l.parent==null)l.parent=holder.ind
// The loop: at rest the hand waits on the left and the head stands a little to the right; as the
// tongue comes out both slide to the middle (the hand onto the tongue), the tongue wags between
// the fingers, and as it calms down they go back to their places.
const M=cfg.meet,ease=(o,i)=>({o:{x:[o[0]],y:[o[1]]},i:{x:[i[0]],y:[i[1]]}})
const travel=(rest,meet)=>{
  const k=[
    {t:0,s:rest,...ease([.5,0],[.5,1])},
    {t:M.in[0],s:rest,...ease([.45,0],[.25,1])},
    {t:M.in[1],s:meet,...ease([.5,0],[.5,1])},
    {t:M.out[0],s:meet,...ease([.5,0],[.4,1])},
    {t:M.out[1],s:rest,...ease([.5,0],[.5,1])},
    {t:FRAMES,s:rest},
  ]
  k.forEach(x=>{if(x.s.length===3){x.to=[0,0,0];x.ti=[0,0,0]}})
  return {a:1,k}
}
resize.ks.p=travel([256+M.head_x,F.y,0],[256,F.y,0])
const [x,y]=C.at
holder.ks.p=travel([x+M.hand_x,y+M.hand_y,0],[x,y,0])
holder.ks.r=travel([C.tilt+M.hand_tilt],[C.tilt])

// in front of the face and the mouth, behind the tongue
anim.layers.splice(anim.layers.indexOf(by(anim.layers,'Tongue'))+1,0,...handLayers,holder)

// The two fingers are alive: they lag behind the hand's sharp moves and settle, a damped spring
// pushed by the hand's sideways acceleration on the canvas (run until it settles into the loop)
const J=cfg.jiggle
const handX=t=>world(anim.layers,holder,((t%FRAMES)+FRAMES)%FRAMES)[4]
const w=2*Math.PI/J.period
let th=0,v=0
const swing=[]
for(let t=0;t<FRAMES*4;t++){
  const acc=handX(t+1)-2*handX(t)+handX(t-1)
  v+=-w*w*th-2*J.damping*w*v-acc
  th+=v
  if(t>=FRAMES*3)swing.push(th)
}
swing.push(swing[0])
const peak=Math.max(...swing.map(Math.abs))
const angle=t=>({t,index:-C.index_tilt+swing[t]/peak*J.degrees*J.index,middle:C.middle_tilt+swing[t]/peak*J.degrees*J.middle})
// keys only where the swing bends (the fills' outlines are keyed too, each key costs): a key is
// dropped while the straight line between its neighbours stays within J.tolerance degrees of it
const keep=(a,b)=>{
  let worst=0,at=-1
  for(let t=a+1;t<b;t++){
    const u=(t-a)/(b-a),d=Math.abs(swing[t]-(swing[a]+(swing[b]-swing[a])*u))/peak*J.degrees*J.middle
    if(d>worst){worst=d;at=t}
  }
  return worst>J.tolerance?[...keep(a,at),at,...keep(at,b)]:[]
}
bend([0,...keep(0,FRAMES),FRAMES].map(angle))

// All of it a little bigger, grown from the top right corner of its bounds, into the room left
// on the left and at the bottom
const G=cfg.grow,top=Math.max(...anim.layers.map(l=>l.ind))+1
for(const l of anim.layers)if(l.parent==null)l.parent=top
anim.layers.push({ty:3,nm:'Grow',ind:top,ip:0,op:FRAMES,st:0,sr:1,ao:0,ks:{o:{a:0,k:100},r:{a:0,k:0},
  a:{a:0,k:[...G.from,0]},p:{a:0,k:[...G.from,0]},s:{a:0,k:[G.scale,G.scale,100]}}})

await finish(name,source,anim,[0,30,46,54,70,90,110,130,150,160,170,179])
