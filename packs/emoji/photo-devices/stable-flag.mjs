import {mkdir,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {encodePng} from '../../../scripts/lib/sheets.mjs'
export function flagGrid(frame){
 const phase=2*Math.PI*frame/180
 return Array.from({length:13},(_,y)=>Array.from({length:25},(_,x)=>{
  const u=x/24,v=y/12,wave=2*Math.PI*1.2*u-phase
  return [60+392*u-5*u*Math.cos(wave),256+(v-.5)*228+(5+16*u)*Math.sin(wave)+4*Math.sin(v*Math.PI)*u*Math.cos(wave)]
 }))
}
export async function prepareStableFlag(folder,eng){
 await mkdir(join(folder,'parts'),{recursive:true})
 const meshes=Array.from({length:90},(_,n)=>flagGrid(n*2))
 function boundary(g){return [...g[0],...g.slice(1).map(r=>r.at(-1)),...g.at(-1).slice(0,-1).reverse(),...g.slice(1,-1).reverse().map(r=>r[0])]}
 const path={ty:'sh',ks:{a:1,k:meshes.map((g,n)=>{const v=boundary(g);return {t:n*2,s:[{c:true,v,i:v.map(()=>[0,0]),o:v.map(()=>[0,0])}],o:{x:.333,y:.333},i:{x:.667,y:.667}}})}}
 const tr={ty:'tr',p:{a:0,k:[0,0]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}}
 const common={v:'5.5.2',w:512,h:512,fr:60,ip:0,op:180,assets:[],layers:[{ty:4,ind:1,ip:0,op:180,ks:{p:{a:0,k:[0,0]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}},shapes:[]}]}
 const a=structuredClone(common),b=structuredClone(common)
 a.layers[0].shapes=[{ty:'gr',it:[structuredClone(path),{ty:'fl',c:{a:0,k:[1,1,1,1]},o:{a:0,k:100},r:1},tr]}]
 b.layers[0].shapes=[{ty:'gr',it:[structuredClone(path),{ty:'st',c:{a:0,k:[.22,.22,.22,1]},o:{a:0,k:100},w:{a:0,k:3},lc:2,lj:2},tr]}]
 const mask=eng.create(JSON.stringify(a)),front=eng.create(JSON.stringify(b)),blank=encodePng(new Uint8Array(512*512*4),512,512)
 for(let n=0;n<90;n++){
  await writeFile(join(folder,'parts',`base${String(n).padStart(3,'0')}.png`),blank)
  await writeFile(join(folder,'parts',`mask${String(n).padStart(3,'0')}.png`),encodePng(mask.render(n*2,512,512),512,512))
  await writeFile(join(folder,'parts',`front${String(n).padStart(3,'0')}.png`),encodePng(front.render(n*2,512,512),512,512))
 }
 mask.drop();front.drop()
 await writeFile(join(folder,'mesh.json'),JSON.stringify(meshes))
 await writeFile(join(folder,'projection.json'),JSON.stringify(Array(90).fill(null)))
 console.log('950: stable periodic flag mesh prepared')
}
