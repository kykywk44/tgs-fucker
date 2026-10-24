import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {gzipSync} from 'node:zlib'
import {ROOT,engine,encodePng} from '../../../scripts/lib/sheets.mjs'
import {draw} from './draw.mjs'

const dir=import.meta.dirname,out=join(ROOT,'exports/stas'),sheets=join(ROOT,'exports/sheets/stas')
await mkdir(out,{recursive:true});await mkdir(sheets,{recursive:true})
await writeFile(join(dir,'portrait.svg'),draw())
const json=join(out,'svg-import.json')
execFileSync(join(ROOT,'.venv/Scripts/python.exe'),[
  join(ROOT,'.venv/Scripts/lottie_convert.py'),join(dir,'portrait.svg'),json,'--fps','60'
],{stdio:'pipe'})
const anim=JSON.parse(await readFile(json,'utf8'))
const imported=structuredClone(anim)
anim.tgs=1;anim.w=512;anim.h=512;anim.fr=60;anim.ip=0;anim.op=180
anim.nm='Стас · векторная основа'
const parts=anim.layers[0].shapes.flatMap(s=>s.nm==='brows'?s.it.filter(x=>x.ty==='gr'):[s])
const identity={a:{a:0,k:[0,0]},p:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}}
anim.layers=parts.map((part,i)=>({ddd:0,ind:10+i,ty:4,nm:part.nm,
  parent:['shirt','neck'].includes(part.nm)?901:900,sr:1,st:0,ip:0,op:180,
  ks:structuredClone(identity),shapes:[part]}))
for(const [ind,nm,pivot,parent]of [[900,'rig:head',[256,383],901],[901,'rig:root',[256,256],null]]){
  anim.layers.push({ddd:0,ind,ty:3,nm,...(parent?{parent}:{}),sr:1,st:0,ip:0,op:180,
    ks:{...structuredClone(identity),a:{a:0,k:pivot},p:{a:0,k:pivot}}})
}
function precision(value){
  if(typeof value==='number')return Math.round(value*1000)/1000
  if(Array.isArray(value))return value.map(precision)
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,precision(v)]))
  return value
}
for(const l of anim.layers){l.ip=0;l.op=180;l.st=0}
const optimized=precision(anim),bytes=gzipSync(Buffer.from(JSON.stringify(optimized)),{level:9})
assert(bytes.length<=65536,`TGS too large: ${bytes.length}`)
await writeFile(join(out,'stas-base.json'),JSON.stringify(optimized))
await writeFile(join(out,'stas-base.tgs'),bytes)
await writeFile(join(ROOT,'exports/emoji/stas-base.tgs'),bytes)
const e=await engine(),r=e.create(JSON.stringify(optimized))
assert(r)
const before=e.create(JSON.stringify(imported)),sourcePixels=new Uint8Array(before.render(0,512,512))
assert.deepEqual(new Uint8Array(r.render(0,512,512)),sourcePixels,'Separating animation layers changed the portrait')
before.drop()
for(const size of [512,128])await writeFile(join(sheets,`portrait-${size}.png`),encodePng(r.render(0,size,size),size,size))
r.drop()
const manifest={name:'Стас',version:1,source:'portrait.svg',reference:'reference.png',
  output:'exports/stas/stas-base.tgs',width:512,height:512,fps:60,frames:180,
  state:'neutral',bytes:bytes.length,
  parts:Object.fromEntries(optimized.layers.map(l=>[l.nm,{layer:l.ind,parent:l.parent??null}])),
  pivots:{head:[256,383],root:[256,256],eye_L:[196,221],eye_R:[304,218],mouth:[257,331]}}
await writeFile(join(dir,'rig.json'),JSON.stringify(manifest,null,2)+'\n')
console.log(JSON.stringify({sizeKB:bytes.length/1024,parts:parts.map(s=>s.nm),rigLayers:2,sourcePixelsMatch:true}))
