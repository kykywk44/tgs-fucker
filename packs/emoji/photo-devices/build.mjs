import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {gunzipSync} from 'node:zlib'
import {execFileSync} from 'node:child_process'
import {ROOT,engine,encodePng} from '../../../scripts/lib/sheets.mjs'
import {prepareExtra} from './extra.mjs'
import {preparePopup} from './popups.mjs'
const dir=import.meta.dirname,out=join(ROOT,'exports/photo-devices'),eng=await engine()
const chosen=process.argv.find(x=>x.startsWith('--id='))?.slice(5)
const identity={p:{a:0,k:[0,0,0]},a:{a:0,k:[0,0,0]},s:{a:0,k:[100,100,100]},r:{a:0,k:0},o:{a:0,k:100}}
const tr={ty:'tr',p:{a:0,k:[0,0]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}}
const colors=[[1,0,0,1],[0,1,0,1],[0,0,1,1],[1,0,1,1]]
const fill=c=>({ty:'fl',c:{a:0,k:c},o:{a:0,k:100},r:1})
const blank=a=>{for(const l of a.layers)l.shapes=[];for(const c of a.assets??[])for(const l of c.layers??[])l.shapes=[];return a}
function marker(ind,parent,p,color){return {ddd:0,ty:4,ind,parent,nm:'projection probe',ip:0,op:180,st:0,sr:1,ks:structuredClone(identity),shapes:[{ty:'gr',it:[{ty:'el',p,s:{a:0,k:[7,7]}},fill(color),structuredClone(tr)]}]}}
function centers(px){
 const sums=colors.map(()=>[0,0,0])
 for(let y=0;y<512;y++)for(let x=0;x<512;x++){
  const i=(y*512+x)*4,a=px[i+3]/255;if(!a)continue
  const r=px[i],g=px[i+1],b=px[i+2]
  const n=r>200&&b>200?3:r>200&&g<20&&b<20?0:g>200&&r<20&&b<20?1:b>200&&r<20&&g<20?2:-1
  if(n>=0){sums[n][0]+=(x+.5)*a;sums[n][1]+=(y+.5)*a;sums[n][2]+=a}
 }
 return sums.map(s=>s[2]?[s[0]/s[2],s[1]/s[2]]:null)
}
for(const id of (chosen?[Number(chosen)]:[554,556,558,573,606,621,632,950,255,222])){
 const source=JSON.parse(gunzipSync(await readFile(join(dir,`source-${id}.tgs`))))
 if([255,222].includes(id)){await preparePopup(id,source,out,eng);continue}
 if([573,621,632,950].includes(id)){await prepareExtra(id,source,out,eng);continue}
 const base=structuredClone(source),front=blank(structuredClone(source)),mask=blank(structuredClone(source)),probes=blank(structuredClone(source))
 const folder=join(out,String(id));await mkdir(join(folder,'parts'),{recursive:true})
 if(id===556){
  base.assets[0].layers=[];base.layers.find(l=>l.ind===2).shapes=[]
  front.layers.find(l=>l.ind===2).shapes=structuredClone(source.layers.find(l=>l.ind===2).shapes)
  const quad=[[79,0],[434,0],[423,190],[91,190]]
  mask.assets[0].layers=[{ddd:0,ind:1,ty:4,ip:0,op:240,st:0,ks:structuredClone(identity),shapes:[{ty:'gr',it:[{ty:'sh',ks:{a:0,k:{c:true,v:quad,i:quad.map(()=>[0,0]),o:quad.map(()=>[0,0])}}},fill([1,1,1,1]),structuredClone(tr)]}]}]
  probes.layers.unshift(...quad.map((p,i)=>marker(100+i,3,{a:0,k:p},colors[i])))
 }else if(id===558){
  base.layers.find(l=>l.ind===6).shapes=[]
  for(const l of front.layers)if(l.ind<=5)l.shapes=structuredClone(source.layers.find(s=>s.ind===l.ind).shapes)
  const paper=source.layers.find(l=>l.ind===7),shape=paper.shapes.find(g=>g.nm==='base')
  mask.layers.find(l=>l.ind===7).shapes=[{...structuredClone(shape),it:[structuredClone(shape.it[0]),fill([1,1,1,1]),structuredClone(shape.it.at(-1))]}]
  const keys=shape.it[0].ks.k
  for(const [i,vertex]of [4,5,0,2].entries()){
   const p={a:1,k:keys.map(k=>{
    const v=k.s[0].v[vertex],center=[0,10]
    return {...structuredClone(k),s:[106.75+center[0]+(v[0]-center[0])*.9,93.75+center[1]+(v[1]-center[1])*.9]}
   })}
   probes.layers.unshift(marker(100+i,7,p,colors[i]))
  }
 }else if(id===554){
  // Keep the native screen clip, front camera and phone turn; replace icon UI.
  for(const l of base.layers)if([6,7,9,10].includes(l.ind))l.shapes=[]
  base.assets[0].layers=[]
  const screen=source.layers.find(l=>l.ind===11).shapes[0]
  mask.layers.find(l=>l.ind===11).shapes=[{...structuredClone(screen),it:[structuredClone(screen.it[0]),fill([1,1,1,1]),structuredClone(screen.it.at(-1))]}]
  front.layers.find(l=>l.ind===4).shapes=structuredClone(source.layers.find(l=>l.ind===4).shapes)
  base.layers.find(l=>l.ind===4).shapes=[]
  const quad=[[159.849,52.677],[352.373,52.677],[352.373,461.791],[159.849,461.791]]
  probes.layers.unshift(...quad.map((p,i)=>marker(100+i,11,{a:0,k:p},colors[i])))
 }else if(id===606){
  for(const l of base.layers)if(l.ind>=2&&l.ind<=12)l.shapes=[]
  for(const l of front.layers)if(l.ind>=2&&l.ind<=5)l.shapes=structuredClone(source.layers.find(s=>s.ind===l.ind).shapes)
  const sky=source.layers.find(l=>l.ind===13).shapes[0]
  mask.layers.find(l=>l.ind===13).shapes=[{...structuredClone(sky),it:[structuredClone(sky.it[0]),fill([1,1,1,1]),structuredClone(sky.it.at(-1))]}]
  base.layers.find(l=>l.ind===13).shapes=[{...structuredClone(sky),it:[structuredClone(sky.it[0]),fill([1,.98,.95,1]),structuredClone(sky.it.at(-1))]}]
  const quad=[[-160.412,-160.412],[160.412,-160.412],[160.412,160.412],[-160.412,160.412]]
  // The sky path has static vertices, its layer follows all frame perspective keys.
  probes.layers.unshift(...quad.map((p,i)=>marker(100+i,13,{a:0,k:p},colors[i])))
 }
 const brush=id===606?blank(structuredClone(source)):null
 if(brush)brush.layers.unshift(marker(200,4,{a:0,k:[-155,-165]},[1,0,0,1]))
 const brushRender=brush?eng.create(JSON.stringify(brush)):null,brushPoints=[]
 const renders=[base,front,mask,probes].map(a=>eng.create(JSON.stringify(a)))
 const frames=[]
 for(let n=0;n<90;n++){
  const f=Math.min(n*2,source.op-1),active=id===556?f>=52&&f<=168:id===558?f>=78&&f<154:id===554?(f<16||f>=78):true
  let quad=null
  for(let r=0;r<3;r++)await writeFile(join(folder,'parts',`${['base','front','mask'][r]}${String(n).padStart(3,'0')}.png`),encodePng(renders[r].render(f,512,512),512,512))
  if(active)quad=centers(renders[3].render(f,512,512))
  frames.push(quad?.every(Boolean)?quad:null)
  if(brushRender)brushPoints.push(centers(brushRender.render(f,512,512))[0])
 }
 for(const r of renders)r.drop()
 await writeFile(join(folder,'projection.json'),JSON.stringify(frames))
 if(brushRender){brushRender.drop();await writeFile(join(folder,'brush.json'),JSON.stringify(brushPoints))}
 console.log(`${id}: 90 base/foreground/matte frames rendered`)
}
if(!process.argv.includes('--prepare'))execFileSync('python',[join(dir,'compose.py'),dir,out,...(chosen?['--id',chosen]:[])],{stdio:'inherit'})
