// Rigid torso/head and articulated arms; smoothly joined vector contours.
import {readFileSync} from 'node:fs'
export const cfg=JSON.parse(readFileSync(new URL('./scene.json',import.meta.url)))
const TAU=2*Math.PI,T=cfg.seconds,N=T*cfg.fps
const smooth=(a,b,x)=>{const u=Math.max(0,Math.min(1,(x-a)/(b-a)));return u*u*(3-2*u)}
const cyc=t=>((t%T)+T)%T
const wrap=t=>((t+T/2)%T+T)%T-T/2
// Retain the approved v2 posture response independently of the camera revision.
function postureDrive(t){
 t=cyc(t)
 const envelope=.85+.15*Math.sin(TAU*2*t/T)
 let x=1.5*Math.sin(TAU*4*t/T)+1.1*envelope*Math.sin(TAU*53*t/T)+.4*Math.sin(TAU*87*t/T)
 let y=2.1*envelope*Math.sin(TAU*67*t/T)+.8*Math.sin(TAU*91*t/T)+.7*Math.sin(TAU*7*t/T)
 for(const j of cfg.jolts){
  const d=wrap(t-j.time),env=Math.exp(-d*d/(2*.24*.24))
  x+=j.gain*4.2*env*Math.sin(TAU*2*d)
  y+=j.gain*3.1*env*Math.cos(TAU*2.4*d)
 }
 return {x,y,angle:.08*Math.sin(TAU*3*t/T)+x*.012}
}
export function cabin(t){
 t=cyc(t)
 let x=2.2*Math.sin(TAU*2*t/T)+.55*Math.sin(TAU*3*t/T+.4)
 let y=.95*Math.sin(TAU*3*t/T+.2)+.16*Math.sin(TAU*17*t/T)
 for(const j of cfg.jolts){
  const d=wrap(t-j.time),env=Math.exp(-d*d/(2*.21*.21))
  x+=j.gain*1.35*env*Math.sin(TAU*1.6*d)
  y+=j.gain*1.05*env*Math.cos(TAU*2*d)
 }
 return {x,y,angle:.045*Math.sin(TAU*2*t/T)+x*.009}
}
// Exact periodic frequency response of damped springs, driven by cabin acceleration.
// Frequency-domain solution avoids a settling transient at the loop seam.
function acceleration(values){const h=1/cfg.fps;return values.map((v,n)=>(values[(n+1)%N]-2*v+values[(n+N-1)%N])/(h*h))}
function spring(force,hz,damping,gain=1){
 const out=Array(N).fill(0),w0=TAU*hz
 for(let k=1;k<=100;k++){
  const w=TAU*k/T;let re=0,im=0
  for(let n=0;n<N;n++){const p=TAU*k*n/N;re+=force[n]*Math.cos(p)*2/N;im-=force[n]*Math.sin(p)*2/N}
  const a=w0*w0-w*w,b=2*damping*w0*w,den=a*a+b*b
  // Tissue does not follow high-frequency rail chatter. Feed it only the
  // low-frequency cabin acceleration, avoiding resonant rubbery wobble.
  const lowpass=1/(1+Math.pow(k/T/1.15,8))
  const rr=(re*a+im*b)/den*gain*lowpass,ii=(im*a-re*b)/den*gain*lowpass
  for(let n=0;n<N;n++){const p=TAU*k*n/N;out[n]+=rr*Math.cos(p)-ii*Math.sin(p)}
 }
 return out
}
const xs=Array.from({length:N},(_,n)=>postureDrive(n/cfg.fps).x),ys=Array.from({length:N},(_,n)=>postureDrive(n/cfg.fps).y)
const ax=acceleration(xs),ay=acceleration(ys)
export const motions=cfg.actors.map((actor,index)=>{
 const trunk=spring(ax,2.0*actor.stiffness,1.05,-.8)
 const head=spring(ax,2.8*actor.stiffness,1.0,-.4)
 const armL=spring(ax,1.3*actor.stiffness,.85,-.9)
 const armR=spring(ax,1.55*actor.stiffness,.85,-.8)
 const vertical=spring(ay,3.3*actor.stiffness,1.1,-.35)
 return Array.from({length:N},(_,n)=>{
  const t=n/cfg.fps,phase=index*1.93,breath=.3*Math.sin(TAU*(index%2?3:2)*t/T+phase)
  return {
   trunk:trunk[n]*.11+.23*Math.sin(TAU*(index%2?2:1)*t/T+phase),
   head:head[n]*.12+.20*Math.sin(TAU*(index%2?1:2)*t/T+phase+.8),
   armL:armL[n]*.10+.40*Math.sin(TAU*(index%2?3:2)*t/T+phase)+.08*Math.sin(TAU*4*t/T+phase+.4),
   armR:armR[n]*.10+.43*Math.sin(TAU*(index%2?2:3)*t/T+phase+1.7)+.07*Math.sin(TAU*3*t/T+phase),
   foreL:.14*Math.sin(TAU*2*t/T+phase+.9),foreR:.14*Math.sin(TAU*3*t/T+phase+2.2),
   vertical:vertical[n]+.35*Math.sin(TAU*3*t/T+phase),breath,
  }
 })
})
export function pose(actorIndex,frame){
 const m=motions[actorIndex][((frame%N)+N)%N]
 // Mirroring changes the pose, not the direction of physical cabin acceleration.
 const result=cfg.actors[actorIndex].mirror?{...m,trunk:-m.trunk,head:-m.head,armL:-m.armR,armR:-m.armL,foreL:-m.foreR,foreR:-m.foreL}:{...m}
 const scratch=fingerGesture(frame)
 result.fingers=actorIndex===3?scratch.angle:0
 // Just enough elbow rotation to bring the curling fingertips onto the thigh.
 if(actorIndex===3)result.foreL-=2.3*scratch.reach
 // Front-left is mirrored: negative local tilt points screen-right, to center.
 if(actorIndex===2)result.head-=2.2*headBeat(frame)
 return result
}
export function headBeat(frame){
 const t=((frame%N)+N)%N/cfg.fps
 return smooth(7.9,8.12,t)*(1-smooth(8.55,8.85,t))
}
export function fingerGesture(frame){
 const t=((frame%N)+N)%N/cfg.fps
 const ease=(a,b,x)=>{const u=Math.max(0,Math.min(1,(x-a)/(b-a)));return u*u*u*(u*(u*6-15)+10)}
 const reach=ease(.35,.9,t)*(1-ease(2,2.55,t))
 const strokes=ease(.93,1.03,t)*(1-ease(1.87,1.97,t))
 return {reach,angle:-40*reach+9*strokes*Math.sin(TAU*3*(t-.95))}
}
export function skin(p,m){
 const [x,y]=p
 const rotate=(pt,center,degrees)=>{const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a),dx=pt[0]-center[0],dy=pt[1]-center[1];return [center[0]+c*dx-s*dy,center[1]+s*dx+c*dy]}
 let q=[x,y]
 // Four long fingers below the thumb curl from the knuckles. Palm, thumb,
 // wrist and forearm remain in the original pose; no sliced arm overlay.
 const fingers=smooth(803,816,y)*(1-smooth(112,120,x))
 if(m.fingers&&fingers){const f=rotate(q,[85,808],m.fingers);q=q.map((v,i)=>v+(f[i]-v)*fingers)}
 // Whole skull is rigid. Only a short neck transition blends into the chest.
 const neck=1-smooth(225,280,y),head=rotate(q,[246,260],m.head)
 q=q.map((v,i)=>v+(head[i]-v)*neck)
 const shoulder=smooth(290,365,y),elbow=smooth(500,565,y)
 const lower=smooth(450,670,y)
 const left=(1-smooth(128-24*lower,151-26*lower,x))*shoulder
 const right=smooth(341+32*lower,370+18*lower,x)*shoulder
 for(const [weight,pivot,angle,ep,fore] of [[left,[111,355],m.armL,[85,548],m.foreL],[right,[375,355],m.armR,[402,548],m.foreR]]){
  if(weight){
   let a=rotate(q,ep,fore*elbow);a=rotate(a,pivot,angle)
   q=q.map((v,i)=>v+(a[i]-v)*weight)
  }
 }
 // A firm torso pivots from the pelvis; no squash or travelling body wave.
 q=rotate(q,[246,815],m.trunk)
 let dx=q[0]-x,dy=q[1]-y+m.vertical
 dy-=m.breath*Math.exp(-(((y-340)/145)**2))
 // The supplied cutout stops mid-thigh. Continue its lower edge below frame
 // for the smaller back row instead of exposing a rectangular crop in view.
 const legs=smooth(119,124,x)*(1-smooth(375,383,x))
 dy+=100*smooth(790,863,y)*legs
 return [x+dx,y+dy]
}
export function parsePath(d){
 const tok=d.match(/[MLHCZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)
 const paths=[];let i=0,cmd='',path=null,at=[0,0]
 const start=p=>{path={c:false,v:[p],i:[[0,0]],o:[[0,0]]};at=p;paths.push(path)}
 const line=p=>{path.v.push(p);path.i.push([0,0]);path.o.push([0,0]);at=p}
 while(i<tok.length){
  if(/^[MLHCZ]$/.test(tok[i]))cmd=tok[i++]
  if(cmd==='M'){start([+tok[i++],+tok[i++]]);cmd='L'}
  else if(cmd==='L')line([+tok[i++],+tok[i++]])
  else if(cmd==='H')line([+tok[i++],at[1]])
  else if(cmd==='C'){
   const a=[+tok[i++],+tok[i++]],b=[+tok[i++],+tok[i++]],end=[+tok[i++],+tok[i++]]
   path.o.at(-1)[0]=a[0]-at[0];path.o.at(-1)[1]=a[1]-at[1]
   path.v.push(end);path.i.push([b[0]-end[0],b[1]-end[1]]);path.o.push([0,0]);at=end
  }else if(cmd==='Z'){
   path.c=true
   const last=path.v.length-1
   if(last>0&&Math.hypot(path.v[last][0]-path.v[0][0],path.v[last][1]-path.v[0][1])<.01){path.i[0]=path.i.pop();path.v.pop();path.o.pop()}
   at=path.v[0];cmd=''
  }else throw Error('Unsupported SVG path command: '+cmd)
 }
 return paths
}
export function deform(path,m){
 const v=path.v.map(p=>skin(p,m))
 const handle=(arr,n)=>{const p=path.v[n],q=skin([p[0]+arr[0],p[1]+arr[1]],m);return [q[0]-v[n][0],q[1]-v[n][1]]}
 return {c:path.c,v,i:path.i.map(handle),o:path.o.map(handle)}
}
