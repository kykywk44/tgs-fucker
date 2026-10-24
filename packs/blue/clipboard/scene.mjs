// Motion reuses the original policewoman's writing segment. No independent arm rig.
import {at,baked,walk,transform,mul,I,point,world} from '../lib/silhouette.mjs'
import {load} from '../../../scripts/lib/sheets.mjs'
const {fitHomography,applyHomography}=await load('src/core/homography.ts')
const {easeAt}=await load('src/core/motion/easing.ts')
const clamp=x=>Math.max(0,Math.min(1,x))
export const smooth=x=>{x=clamp(x);return x*x*(3-2*x)}
const bezier=(f,a,b,controls)=>easeAt({x1:controls[0],y1:controls[1],x2:controls[2],y2:controls[3]},clamp((f-a)/(b-a)))
export const LONG=process.argv.includes('--six')
export const FRAMES=LONG?360:180
export const STEP=LONG?4:3
// Rotate first, then finish the approach. On return, retreat before turning back.
// Each channel has its own cubic easing and stops with zero velocity.
export const turn=f=>LONG
 ?f<291?bezier(f,189,234,[.42,0,.25,1]):1-bezier(f,306,349,[.42,0,.32,1])
 :f<126?bezier(f,44,80,[.42,0,.25,1]):1-bezier(f,140,174,[.42,0,.32,1])
export const approach=f=>LONG
 ?f<291?bezier(f,192,249,[.42,0,.22,1]):1-bezier(f,291,351,[.42,0,.35,1])
 :f<126?bezier(f,48,96,[.42,0,.22,1]):1-bezier(f,126,176,[.42,0,.35,1])
// A continuously running, slowly reversing source writing segment. No hidden pause
// and no fast-forward through the old "put away" animation at the end.
export const characterTime=f=>LONG
 ?f<174?38+58*bezier(f,90,174,[.35,0,.65,1]):96-58*bezier(f,291,351,[.42,0,.35,1])
 :38+29*(1-Math.cos(2*Math.PI*f/179))
const mix=(a,b,u)=>typeof a==='number'?a+(b-a)*u:Array.isArray(a)?a.map((v,i)=>mix(v,b[i],u)):
 {...a,...Object.fromEntries(['v','i','o'].map(k=>[k,mix(a[k],b[k],u)]))}
// Blend the source's frontal resting pose into its writing pose directly. Walking
// backwards through source time would replay the old stowing action in between.
export const writingGaze=f=>bezier(f,63,90,[.42,0,.35,1])*(1-bezier(f,174,198,[.42,0,.35,1]))
export const poseValue=(p,f)=>LONG?mix(at(p,174),at(p,characterTime(f)),writingGaze(f)):at(p,characterTime(f))
export const nod=f=>LONG&&f>27&&f<63?Math.sin(Math.PI*(f-27)/36)**2:0
export const smileAmount=f=>LONG
 ?.4-.2*writingGaze(f)+.55*bezier(f,174,198,[.42,0,.35,1])*(1-bezier(f,291,351,[.42,0,.35,1]))+.15*nod(f)
 :.2+.8*Math.sin(Math.PI*f/179)**2
export const tabletTime=f=>characterTime(f)*(1-approach(f))+96*approach(f)
export const presentationDrop=LONG?74:50
export const camera=(p,f=0)=>[234+(p[0]-256)*1.42,512+(p[1]-462.5)*1.42+presentationDrop*approach(f)]
export const cameraMatrix=f=>[1.42,0,0,1.42,234-256*1.42,512-462.5*1.42+presentationDrop*approach(f)]
export const penRetract=f=>LONG
 ?1-bezier(f,66,90,[.42,0,.3,1])+bezier(f,174,195,[.42,0,.3,1])
 :f<126?bezier(f,38,58,[.42,0,.3,1]):1-bezier(f,164,179,[.42,0,.3,1])
export const penScreen=(q,f)=>{const p=camera(q,f);return [p[0],p[1]+220*penRetract(f)]}
export function retime(x,clock=characterTime,sample=(p,f)=>at(p,clock(f))){
 if(!x||typeof x!=='object')return x
 if(Array.isArray(x))return x.map(v=>retime(v,clock,sample))
 if(x.a===1&&Array.isArray(x.k)&&x.k[0]?.t!=null)return baked(f=>sample(x,f),FRAMES,false,STEP)
 return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,retime(v,clock,sample)]))
}
export const getShape=(p,t)=>{const s=at(p,t);return s.v?s:s[0]}
const round=p=>p.map(v=>Math.round(v*1000)/1000)
export function roundRect(x,y,w,h,r=8){const K=.55228475;return {c:true,v:[[x+r,y],[x+w-r,y],[x+w,y+r],[x+w,y+h-r],[x+w-r,y+h],[x+r,y+h],[x,y+h-r],[x,y+r]],i:[[-r*K,0],[0,0],[0,-r*K],[0,0],[r*K,0],[0,0],[0,r*K],[0,0]],o:[[0,0],[r*K,0],[0,0],[0,r*K],[0,0],[-r*K,0],[0,0],[0,-r*K]]}}
export function warpShape(p,fn){
 const v=p.v.map(fn),handle=hs=>p.v.map((q,i)=>{const e=.001,a=fn(q),b=fn(q.map((x,d)=>x+hs[i][d]*e));return round(b.map((x,d)=>(x-a[d])/e))})
 return {c:p.c,v:v.map(round),i:handle(p.i),o:handle(p.o)}
}
export function boardProjection(source){
 const ls=source.assets[0].layers,tablet=ls.find(l=>l.nm==='Tablet')
 const outer=walk(tablet.shapes).filter(p=>p.ty==='sh')[1]
 const p=getShape(outer.ks,96),m=world(ls,tablet,96)
 const pairs=[[3,4],[5,6],[7,0],[1,2]],corners=pairs.map(([a,b])=>point(m,p.v[a].map((x,d)=>(x+p.v[b][d])/2)))
 const unit=[[-1,-1],[1,-1],[1,1],[-1,1]],toUnit=fitHomography(corners,unit),fromUnit=fitHomography(unit,corners)
 // The source clip is much taller than the former replacement rectangle. Fit
 // the real metal outline, including its stroke, to the same 1/6 top margin.
 const clip=tablet.shapes[0].it.find(g=>g.nm==='Group 3')
 const clipPoints=walk(clip.it).filter(s=>s.ty==='sh').flatMap(s=>{
  const p=getShape(s.ks,96),out=[]
  for(let i=0;i<p.v.length-(p.c?0:1);i++){
   const j=(i+1)%p.v.length,a=p.v[i],b=a.map((v,d)=>v+p.o[i][d]),z=p.v[j],c=z.map((v,d)=>v+p.i[j][d])
   for(let t=0;t<=1;t+=.025){const q=a.map((v,d)=>(1-t)**3*v+3*(1-t)**2*t*b[d]+3*(1-t)*t*t*c[d]+t**3*z[d]);out.push(applyHomography(toUnit,point(m,q)))}
  }
  return out
 })
 const frontCenterY=88-215*Math.min(...clipPoints.map(p=>p[1]))
 const plane=(n,f)=>{
  const u=approach(f),a=Math.PI*turn(f),k=1/(1+.12*n[0]*Math.sin(a)),x=n[0]*Math.cos(a)*k,y=n[1]*k
  const old=camera(applyHomography(fromUnit,[x,y]),f),front=[256+x*215,frontCenterY+y*215]
  return old.map((v,d)=>v+(front[d]-v)*u)
 }
 return {tablet,ls,corners,toUnit,plane,frontCenterY,
  screen:(q,f)=>turn(f)===0&&approach(f)===0?camera(q,f):plane(applyHomography(toUnit,q),f),
  front:(q,f)=>plane([-q[0],q[1]],f)}
}
// Bake existing shapes in screen coordinates. Every original layer/group transform is
// evaluated before projecting, so the writing tablet and pen exactly retain their source pose.
export function bakeSourceLayer(ls,l,projection,clock=tabletTime){
 const dst=structuredClone(l)
 function go(dstItems,srcItems,parents=[]){
  const srcTr=srcItems.find(x=>x.ty==='tr'),chain=srcTr?[...parents,srcTr]:parents
  const matrix=f=>chain.reduce((m,t)=>mul(m,transform(t,clock(f))),world(ls,l,clock(f)))
  for(let k=0;k<srcItems.length;k++){
   const s=srcItems[k],d=dstItems[k]
   if(s.ty==='gr')go(d.it,s.it,chain)
   else if(s.ty==='sh')d.ks=baked(f=>warpShape(getShape(s.ks,clock(f)),q=>projection(point(matrix(f),q),f)),FRAMES,true,STEP)
   else if(s.ty==='tr')Object.assign(d,{p:{a:0,k:[0,0]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:retime(s.o,clock)})
   else{
    Object.assign(d,retime(s,clock))
    if(s.ty==='gf')for(const endpoint of ['s','e'])d[endpoint]=baked(f=>projection(point(matrix(f),at(s[endpoint],clock(f))),f),FRAMES,false,STEP)
   }
  }
 }
 go(dst.shapes,l.shapes)
 delete dst.parent
 dst.ks={o:{a:0,k:100},r:{a:0,k:0},p:{a:0,k:[0,0,0]},a:{a:0,k:[0,0,0]},s:{a:0,k:[100,100,100]}}
 return dst
}
