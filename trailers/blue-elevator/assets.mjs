import assert from 'node:assert/strict'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {ROOT,engine,encodePng} from '../../scripts/lib/sheets.mjs'
import {cfg,pose,deform,parsePath,skin,motions,cabin,fingerGesture} from './rig.mjs'
const out=join(ROOT,'exports/blue-elevator'),svg=await readFile(new URL('./source.svg',import.meta.url),'utf8')
const source=[...svg.matchAll(/<path\b([^>]*)\/>/g)].map(m=>{
 const attrs=Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]))
 return {paths:parsePath(attrs.d),fill:attrs.fill}
})
assert.equal(source.length,24)
const rgb=hex=>hex.match(/[0-9a-f]{2}/gi).map(n=>parseInt(n,16)/255)
const mix=(a,b,w)=>a.map((v,i)=>v+(b[i]-v)*w)
const p=k=>({a:0,k}),tr={ty:'tr',p:p([0,0]),a:p([0,0]),s:p([100,100]),r:p(0),o:p(100)}
function paint(color,actor){
 if(color.startsWith('url')){
  const stops=cfg.palette.body.map(rgb)
  return {ty:'gf',o:p(100),r:1,t:2,s:p([246,863]),e:p([246,29]),h:p(0),a:p(0),g:{p:3,k:p([0,...stops[0],.59,...stops[1],1,...stops[2]])}}
 }
 if(['#94DAF9','#B8F0FB'].includes(color)){
  const rim=rgb(cfg.palette.rim),body=rgb(cfg.palette.body[1])
  const dim=mix(body,rim,.24*actor.light),bright=mix(body,rim,actor.light)
  const toRight=(actor.x<cfg.width/2)!==actor.mirror
  return {ty:'gf',o:p(100),r:1,t:1,s:p([toRight?0:481,400]),e:p([toRight?481:0,400]),g:{p:2,k:p([0,...dim,1,...bright])}}
 }
 const c={'#1D4075':cfg.palette.outline,'#559DD5':cfg.palette.body[1],'#316AA4':cfg.palette.body[0]}[color]
 assert(c,'Unknown fill '+color)
 return {ty:'fl',c:p([...rgb(c),1]),o:p(100),r:1}
}
const eng=await engine(),N=cfg.fps*cfg.seconds,preview=process.argv.includes('--preview')
const picked=[0,30,54,70,90,106,145,380,474,498,531,599]
const motion=[]
await mkdir(out,{recursive:true})
for(let ai=0;ai<cfg.actors.length;ai++){
 const actor=cfg.actors[ai],folder=join(out,actor.id);await mkdir(folder,{recursive:true})
 const a={v:'5.5.2',w:481,h:963,fr:60,ip:0,op:1,assets:[],layers:source.map((s,i)=>({ty:4,ind:i+1,ip:0,op:1,ks:{p:p([0,0]),a:p([0,0]),s:p([100,100]),r:p(0),o:p(100)},shapes:[{ty:'gr',it:[...s.paths.map(path=>({ty:'sh',ks:p(structuredClone(path))})),paint(s.fill,actor),structuredClone(tr)]}]})).reverse()}
 const frames=preview?picked:Array.from({length:N},(_,i)=>i)
 for(const f of frames){
  const m=pose(ai,f)
  for(let i=0;i<source.length;i++){
   const it=a.layers[source.length-1-i].shapes[0].it
   source[i].paths.forEach((path,j)=>{it[j].ks.k=deform(path,m)})
  }
  const instance=eng.create(JSON.stringify(a));assert(instance)
  await writeFile(join(folder,`${String(f).padStart(4,'0')}.png`),encodePng(instance.render(0,481,963),481,963));instance.drop()
 }
 const targets={hip:[246,800],chest:[246,390],neck:[246,255],head:[246,125],leftWrist:[80,730],rightWrist:[412,730]}
 motion.push({id:actor.id,frames:motions[ai].map((_,f)=>{const m=pose(ai,f);return {frame:f,...m,points:Object.fromEntries(Object.entries(targets).map(([n,pt])=>[n,skin(pt,m)]))}})})
 console.log(`${actor.id}: ${frames.length} skinned SVG frames; ${actor.mirror?'mirrored':'original'}, inward-facing rim light`)
}
await writeFile(join(out,'motion.json'),JSON.stringify({fps:cfg.fps,seconds:cfg.seconds,cabin:Array.from({length:N},(_,n)=>cabin(n/cfg.fps)),actors:motion}))
await writeFile(join(out,'scratch.json'),JSON.stringify({actor:'front-right',arm:'screen-left, towards center',joint:'four fingers only; fixed palm/thumb/wrist',start:.35,end:2.55,strokes:3,frames:Array.from({length:N},(_,frame)=>({frame,...fingerGesture(frame)}))}))
