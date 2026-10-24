import {mkdir,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {encodePng} from '../../../scripts/lib/sheets.mjs'
const identity={p:{a:0,k:[0,0]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}}
const tr={ty:'tr',...identity}
const colors=[[1,0,0,1],[0,1,0,1],[0,0,1,1],[1,0,1,1]]
const empty=a=>{for(const c of [a,...a.assets??[]])for(const l of c.layers??[])if(l.shapes)l.shapes=[];return a}
function centers(px){
 const sums=colors.map(()=>[0,0,0])
 for(let y=0;y<512;y++)for(let x=0;x<512;x++){
  const i=(y*512+x)*4,a=px[i+3]/255,[r,g,b]=px.subarray(i,i+3)
  const n=r>200&&b>200?3:r>200&&g<20&&b<20?0:g>200&&r<20&&b<20?1:b>200&&r<20&&g<20?2:-1
  if(a&&n>=0){sums[n][0]+=(x+.5)*a;sums[n][1]+=(y+.5)*a;sums[n][2]+=a}
 }
 return sums.map(s=>s[2]?[(s[0]/s[2]-128)*2,(s[1]/s[2]-128)*2]:null)
}
export async function preparePopup(id,source,out,eng){
 const folder=join(out,''+id);await mkdir(join(folder,'parts'),{recursive:true})
 const base=structuredClone(source),front=structuredClone(source),probes=empty(structuredClone(source))
 const ls=a=>id===255?a.assets[0].layers:a.layers
 if(id===255){
  for(const l of ls(base))if(l.ind<160&&l.shapes)l.shapes=[]
  for(const l of ls(front))if(l.ind>=130&&l.shapes)l.shapes=[]
 }else{
  for(const l of ls(base))if(l.ind>=5&&l.ind<=13&&l.shapes)l.shapes=[]
  for(const l of ls(front))if(l.ind>=5&&l.ind<=13&&l.shapes)l.shapes=[]
 }
 const quad=id===255?[[-5,15],[205,15],[205,258],[-5,258]]:[[-40,-100],[170,-100],[170,143],[-40,143]]
 const parent=id===255?144:18
 for(let i=0;i<4;i++){
  const p=quad[i]
  // The hat's vertical reveal follows the ear appearance/retreat interval.
  const position=id===222?{a:1,k:[[82,255],[100,15],[108,-8],[116,0],[132,0],[144,255]].map(([t,y])=>({t,s:[p[0],p[1]+y],i:{x:.667,y:1},o:{x:.333,y:0}}))}:{a:0,k:p}
  ls(probes).unshift({ty:4,ind:800+i,parent,ip:0,op:220,ks:structuredClone(identity),shapes:[{ty:'gr',it:[{ty:'el',p:position,s:{a:0,k:[8,8]}},{ty:'fl',c:{a:0,k:colors[i]},o:{a:0,k:100}},structuredClone(tr)]}]})
 }
 // Pad the native scene so probes below the canvas survive during retreat.
 for(const l of probes.layers)if(l.parent===undefined)l.parent=9999
 probes.layers.push({ty:3,ind:9999,ip:-20,op:300,ks:{...structuredClone(identity),s:{a:0,k:[50,50]},p:{a:0,k:[128,128]}}})
 let lipRender=null
 if(id===222){
  const lip=empty(structuredClone(source)),edge=structuredClone(source.layers.find(l=>l.ind===3).shapes[0].it.find(s=>s.ty==='sh').ks)
  const extend=p=>{
   const v=p.v.map(p=>[...p]),i=p.i.map(p=>[...p]),o=p.o.map(p=>[...p])
   const left=[-1000,v[0][1]],right=[1000,v.at(-1)[1]]
   return {c:true,v:[left,...v,right,[1000,-1000],[-1000,-1000]],i:[[0,0],...i,[0,0],[0,0],[0,0]],o:[[0,0],...o,[0,0],[0,0],[0,0]]}
  }
  if(edge.a)for(const k of edge.k){k.s=[extend(k.s[0])];if(k.e)k.e=[extend(k.e[0])]}
  else edge.k=extend(edge.k)
  lip.layers.unshift({ty:4,ind:900,parent:3,ip:0,op:180,ks:structuredClone(identity),shapes:[{ty:'gr',it:[{ty:'sh',ks:edge},{ty:'fl',c:{a:0,k:[1,1,1,1]},o:{a:0,k:100}},structuredClone(tr)]}]})
  lipRender=eng.create(JSON.stringify(lip))
 }
 const renders=[base,front,probes].map(a=>eng.create(JSON.stringify(a))),frames=[]
 for(let n=0;n<90;n++){
  const f=Math.min(n*2,source.op-1)
  for(let r=0;r<2;r++)await writeFile(join(folder,'parts',`${r?'front':'base'}${String(n).padStart(3,'0')}.png`),encodePng(renders[r].render(f,512,512),512,512))
  if(lipRender)await writeFile(join(folder,'parts',`mask${String(n).padStart(3,'0')}.png`),encodePng(lipRender.render(f,512,512),512,512))
  const active=id===222?f>=82&&f<146:true
  const q=active?centers(renders[2].render(f,512,512)):null
  frames.push(q?.every(Boolean)?q:null)
 }
 for(const r of renders)r.drop()
 lipRender?.drop()
 await writeFile(join(folder,'projection.json'),JSON.stringify(frames))
 console.log(`${id}: native shell/hat foreground and cutout motion prepared`)
}
