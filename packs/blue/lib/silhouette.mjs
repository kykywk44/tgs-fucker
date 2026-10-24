// Helpers for the neckless silhouette variants; approved assets stay untouched.
import assert from 'node:assert/strict'
import { readFile,writeFile,mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Canvas,ROOT,load,engine,encodePng } from '../../../scripts/lib/sheets.mjs'
export const {readTgs,writeTgs,sizeKb}=await load('src/core/tgs.ts')
const {telegramChecks}=await load('src/core/checks.ts')
const {easeAt}=await load('src/core/motion/easing.ts')
export const read=async p=>readTgs(new Uint8Array(await readFile(join(ROOT,p))))
export const style=JSON.parse(await readFile(join(ROOT,'packs/blue/style.json'),'utf8'))
const cfg=JSON.parse(await readFile(join(ROOT,'packs/blue/family/heads.json'),'utf8')).bust
const bust=await read('packs/blue/base/bust.tgs')
export const walk=xs=>xs.flatMap(x=>x.ty==='gr'?walk(x.it):[x])
export const path=l=>walk(l.shapes).find(x=>x.ty==='sh').ks
export const first=p=>p.a?p.k[0].s[0]:p.k
export const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255)
export const tr=()=>({ty:'tr',p:{a:0,k:[0,0]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}})
export const group=(nm,it)=>({ty:'gr',nm,it:[...it,tr()]})
export const stroke=(width=8,color=style.outline)=>({ty:'st',c:{a:0,k:[...rgb(color),1]},o:{a:0,k:100},w:{a:0,k:width},lc:2,lj:2})
export const gradient=(bottom,top)=>({ty:'gf',o:{a:0,k:100},r:1,t:1,bm:0,s:{a:0,k:bottom},e:{a:0,k:top},
  g:{p:style.body.stops.length,k:{a:0,k:style.body.stops.flatMap(([s,c])=>[s,...rgb(c)])}}})
export function mapProperty(p,fn){return !p.a?{...p,k:fn(p.k)}:{...p,k:p.k.map(k=>({...k,
  ...(k.s&&{s:k.s.map(fn)}),...(k.e&&{e:k.e.map(fn)})}))}}
const model=structuredClone(first(path(bust.layers.find(l=>l.nm==='silhouette'))))
const crown=first(path(bust.layers.find(l=>l.nm==='top')))
model.i[cfg.keep[0]]=[-cfg.jawHandle[0],cfg.jawHandle[1]];model.o[cfg.keep.at(-1)]=cfg.jawHandle
const chin=model.v.length
model.v.push(cfg.chin);model.i.push([-cfg.chinHandle,0]);model.o.push([cfg.chinHandle,0])
export function head(old,{width,height,center,bottom=[0,126],top=[0,-172],outline=8}={}){
  function fit(m,p,closed,indices=m.v.map((_,i)=>i)){
    const xs=p.v.map(v=>v[0]),ys=p.v.map(v=>v[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys)
    const w=width??x1-x0,h=height??y1-y0,c=center??[(x0+x1)/2,(y0+y1)/2]
    const sx=w/cfg.skullWidth,sy=h/(cfg.chin[1]-cfg.crown)
    return {c:closed,v:indices.map(i=>[(m.v[i][0]-cfg.axis)*sx+c[0],(m.v[i][1]-cfg.crown)*sy+c[1]-h/2]),
      i:indices.map(i=>[m.i[i][0]*sx,m.i[i][1]*sy]),o:indices.map(i=>[m.o[i][0]*sx,m.o[i][1]*sy])}
  }
  return [group('Блик макушки',[{ty:'sh',ks:mapProperty(old,p=>fit(crown,p,false))},stroke(outline,style.rim)]),
    group('Голова без шеи',[{ty:'sh',ks:mapProperty(old,p=>fit(model,p,true,[...cfg.keep,chin]))},stroke(outline),gradient(bottom,top)])]
}
const pick=(x,d)=>Array.isArray(x)?x[Math.min(d,x.length-1)]:x
const mix=(a,b,u)=>typeof a==='number'?a+(b-a)*u:Array.isArray(a)?a.map((v,i)=>mix(v,b[i],u)):
  {...a,...Object.fromEntries(['v','i','o'].map(k=>[k,mix(a[k],b[k],u)]))}
export function at(p,f,fallback){
  if(!p)return fallback
  if(!p.a)return p.k
  const ks=p.k
  if(f<=ks[0].t)return ks[0].s
  for(let n=0;n<ks.length-1;n++){
    const a=ks[n],b=ks[n+1],to=b.s??a.e
    if(f>=b.t)continue
    if(a.h||!to)return a.s
    const x=(f-a.t)/(b.t-a.t),ease=d=>a.o&&a.i?easeAt({x1:pick(a.o.x,d),y1:pick(a.o.y,d),x2:pick(a.i.x,d),y2:pick(a.i.y,d)},x):x
    if(a.to&&a.ti){
      const u=ease(0),cubic=t=>a.s.map((v,d)=>(1-t)**3*v+3*(1-t)**2*t*(v+a.to[d])+3*(1-t)*t*t*(to[d]+a.ti[d])+t**3*to[d])
      const points=Array.from({length:97},(_,i)=>cubic(i/96)),lengths=[0]
      for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+Math.hypot(...points[i].map((v,d)=>v-points[i-1][d])))
      const distance=u*lengths.at(-1),i=Math.max(1,lengths.findIndex(l=>l>=distance))
      return mix(points[i-1],points[i],lengths[i]===lengths[i-1]?0:(distance-lengths[i-1])/(lengths[i]-lengths[i-1]))
    }
    return typeof a.s[0]==='object'?mix(a.s,to,ease(0)):a.s.map((v,d)=>mix(v,to[d],ease(d)))
  }
  return ks.at(-1).s??ks.at(-2).e
}
export const I=[1,0,0,1,0,0]
export const mul=(m,n)=>[m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]]
export const point=(m,v)=>[m[0]*v[0]+m[2]*v[1]+m[4],m[1]*v[0]+m[3]*v[1]+m[5]]
export const inverse=m=>{const d=m[0]*m[3]-m[1]*m[2];return[m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d]}
export function transform(t,f){
  const a=at(t?.a,f,[0,0]),p=at(t?.p,f,[0,0]),s=at(t?.s,f,[100,100]),r=Number(at(t?.r,f,0))*Math.PI/180,c=Math.cos(r),sn=Math.sin(r)
  return mul([1,0,0,1,p[0],p[1]],mul([c*s[0]/100,sn*s[0]/100,-sn*s[1]/100,c*s[1]/100,0,0],[1,0,0,1,-a[0],-a[1]]))
}
export const world=(ls,l,f)=>mul(l.parent==null?I:world(ls,ls.find(p=>p.ind===l.parent),f),transform(l.ks,f))
export const baked=(fn,n=180,shape=false,step=1)=>({a:1,k:[...new Set([...Array.from({length:Math.ceil(n/step)},(_,i)=>i*step),n-1])].map(t=>({t,s:shape?[fn(t)]:fn(t),
  ...(t<n-1&&{o:{x:0.333,y:0.333},i:{x:0.667,y:0.667}})}))})
export function nullify(l){l.ty=3;delete l.shapes}
export async function finish(name,source,anim,frames,{allowEmpty=false}={}){
  const bytes=await writeTgs(anim),checks=telegramChecks(anim,bytes.length)
  assert.ok(checks.every(c=>c.ok),JSON.stringify(checks.filter(c=>!c.ok)))
  await mkdir(join(ROOT,`exports/sheets/${name}`),{recursive:true})
  await writeFile(join(ROOT,`exports/blue/${name}.tgs`),bytes)
  const eng=await engine(),players=[source,anim].map(a=>eng.create(JSON.stringify(a))),C=256,cols=6
  const sheet=new Canvas(C*cols,(C+20)*Math.ceil(frames.length/cols)*2)
  for(const[i,f]of frames.entries())for(const[r,p]of players.entries()){
    const x=i%cols*C,y=(Math.floor(i/cols)*2+r)*(C+20)
    sheet.text(`f ${f}`,x+4,y+4,[70,70,70]);sheet.draw(p.render(f,C,C).slice(),C,x,y+20)
  }
  await writeFile(join(ROOT,`exports/sheets/blue-${name}.png`),encodePng(sheet.px,sheet.width,sheet.height))
  for(const f of frames)await writeFile(join(ROOT,`exports/sheets/${name}/blue-${f}.png`),encodePng(players[1].render(f,1024,1024).slice(),1024,1024))
  const n=anim.op-anim.ip,all=new Canvas(128*15,144*Math.ceil(n/15))
  for(let f=0;f<n;f++){
    const px=players[1].render(f,128,128).slice(),x=f%15*128,y=Math.floor(f/15)*144
    assert.ok(allowEmpty||px.some((v,i)=>i%4===3&&v>0),`Empty frame ${f}`)
    all.text(`f ${f}`,x+2,y+2,[70,70,70]);all.draw(px,128,x,y+16)
  }
  const start=players[1].render(0,512,512).slice(),end=players[1].render(n-1,512,512).slice()
  const loopDifferentChannels=start.reduce((s,v,i)=>s+(v!==end[i]?1:0),0)
  await writeFile(join(ROOT,`exports/sheets/${name}/all.png`),encodePng(all.px,all.width,all.height))
  players.forEach(p=>p.drop())
  await writeFile(join(ROOT,`exports/sheets/${name}/verification.json`),JSON.stringify({bytes:bytes.length,frames:n,checks,loopDifferentChannels},null,2))
  console.log(`${name}: ${sizeKb(bytes)} KB; Telegram PASS; ${n} frames; loop delta ${loopDifferentChannels}`)
}
