import {writeFile,mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {encodePng,load} from '../../../scripts/lib/sheets.mjs'
import {ballotMesh} from './ballot-mesh.mjs'
import {prepareStableFlag} from './stable-flag.mjs'
const tr={ty:'tr',p:{a:0,k:[0,0]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}}
const identity={p:{a:0,k:[0,0]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}}
const fill=c=>({ty:'fl',c:{a:0,k:c},o:{a:0,k:100},r:1})
const white=g=>({...structuredClone(g),it:[structuredClone(g.it.find(s=>s.ty==='sh')),fill([1,1,1,1]),structuredClone(g.it.at(-1))]})
function black(items){return items.map(s=>s.it?{...s,it:black(s.it)}:s.ty==='gf'?fill([0,0,0,1]):s.c?{...s,c:{a:0,k:[0,0,0,1]}}:s)}
function layers(a,comp){return comp?a.assets.find(c=>c.id===comp).layers:a.layers}
function empty(a){for(const l of a.layers)l.shapes=[];for(const c of a.assets??[])for(const l of c.layers??[])l.shapes=[];return a}
function pad(a){for(const l of a.layers)if(l.parent===undefined)l.parent=9999;a.layers.push({ty:3,ind:9999,ip:0,op:500,ks:{...structuredClone(identity),s:{a:0,k:[50,50]},p:{a:0,k:[128,128]}}});return a}
const colors=[[1,0,0,1],[0,1,0,1],[0,0,1,1],[1,0,1,1]]
function centers(px){const sums=colors.map(()=>[0,0,0]);for(let y=0;y<512;y++)for(let x=0;x<512;x++){
 const i=(y*512+x)*4,a=px[i+3]/255;if(!a)continue;const [r,g,b]=px.subarray(i,i+3)
 const n=r>200&&b>200?3:r>200&&g<20&&b<20?0:g>200&&r<20&&b<20?1:b>200&&r<20&&g<20?2:-1
 if(n>=0){sums[n][0]+=(x+.5)*a;sums[n][1]+=(y+.5)*a;sums[n][2]+=a}}
 return sums.map(s=>s[2]?[(s[0]/s[2]-128)*2,(s[1]/s[2]-128)*2]:null)
}
function pointProp(g,index,inset){
 const prop=g.it.find(s=>s.ty==='sh').ks,t=g.it.at(-1)
 const point=path=>{const center=path.v.reduce((a,p)=>a.map((v,d)=>v+p[d]/path.v.length),[0,0]);return path.v[index].map((v,d)=>t.p.k[d]+(center[d]+(v-center[d])*inset-(t.a?.k[d]??0))*(t.s?.k[d]??100)/100)}
 return prop.a?{a:1,k:prop.k.map(k=>({...structuredClone(k),s:point(k.s[0])}))}:{a:0,k:point(prop.k)}
}
export async function prepareExtra(id,source,out,eng){
 const {easeAt}=await load('src/core/motion/easing.ts')
 const folder=join(out,String(id));await mkdir(join(folder,'parts'),{recursive:true})
 const base=structuredClone(source),surfaces=[]
 if(id===573){
  for(const l of layers(base,'comp_0'))if(l.ind>=6&&l.ind<=16)l.shapes=[]
  surfaces.push({comp:'comp_0',ind:17,group:0,corners:[3,2,1,0],inset:.97})
 }else if(id===621){
  for(const l of layers(base,'comp_0'))if([10,11].includes(l.ind))l.shapes=l.shapes.filter(g=>g.nm.startsWith('Rectangle'))
  for(const ind of [10,11])surfaces.push({comp:'comp_0',ind,group:0,corners:[3,0,1,2],inset:.97})
 }else if(id===632){
  for(const ind of [6,7,8,9,11])surfaces.push({ind,group:2,corners:[2,1,0,3],inset:.88})
 }else if(id===950)return prepareStableFlag(folder,eng)
 const renders=surfaces.map((s,si)=>{
  const g=layers(base,s.comp).find(l=>l.ind===s.ind).shapes[s.group]
  const mask=structuredClone(base)
  for(const l of mask.layers)if(l.shapes)l.shapes=black(l.shapes)
  for(const c of mask.assets??[])for(const l of c.layers??[])if(l.shapes)l.shapes=black(l.shapes)
  layers(mask,s.comp).find(l=>l.ind===s.ind).shapes=id===632?[...black([layers(base,s.comp).find(l=>l.ind===s.ind).shapes[0]]),white(g)]:[white(g)]
  const probe=empty(structuredClone(base)),ls=layers(probe,s.comp)
  ls.unshift(...s.corners.map((v,i)=>({ty:4,ddd:0,ind:800+i,parent:s.ind,ip:0,op:500,ks:structuredClone(identity),shapes:[{ty:'gr',it:[{ty:'el',p:pointProp(g,v,s.inset),s:{a:0,k:[9,9]}},fill(colors[i]),structuredClone(tr)]}]})))
  return {mask:eng.create(JSON.stringify(mask)),probe:eng.create(JSON.stringify(pad(probe))),si,geometry:g.it.find(s=>s.ty==='sh').ks}
 })
 const b=eng.create(JSON.stringify(base)),blank=encodePng(new Uint8Array(512*512*4),512,512),frames=[]
 for(let n=0;n<90;n++){
  const f=n*2,items=[]
  await writeFile(join(folder,'parts',`base${String(n).padStart(3,'0')}.png`),encodePng(b.render(f,512,512),512,512))
  await writeFile(join(folder,'parts',`front${String(n).padStart(3,'0')}.png`),blank)
  for(const r of renders){
   const quad=centers(r.probe.render(f,512,512));if(!quad.every(Boolean))continue
   const area=Math.abs(quad.reduce((s,p,i)=>{const q=quad[(i+1)%4];return s+p[0]*q[1]-q[0]*p[1]},0))/2
   if(area<3)continue
   const pixels=new Uint8Array(r.mask.render(f,512,512))
   let visible=false;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>8){visible=true;break}
   if(!visible)continue
   const name=`surface${r.si}-${n}.png`;await writeFile(join(folder,'parts',name),encodePng(pixels,512,512))
   items.push({quad,mask:name,...(id===632?{mesh:ballotMesh(r.geometry,f,easeAt)}:{})})
  }frames.push(items)
 }
 b.drop();for(const r of renders){r.mask.drop();r.probe.drop()}
 await writeFile(join(folder,'surfaces.json'),JSON.stringify(frames));await writeFile(join(folder,'projection.json'),JSON.stringify(Array(90).fill(null)))
 console.log(`${id}: photo surfaces prepared`)
}

