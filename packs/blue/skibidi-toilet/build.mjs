import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {gunzipSync,gzipSync} from 'node:zlib'
import {ROOT,engine,encodePng,Canvas} from '../../../scripts/lib/sheets.mjs'
import {head,path,walk,gradient,stroke,tr,at,first} from '../lib/silhouette.mjs'
import {freeze} from '../lib/freeze.mjs'
import {clipHead} from './clip.mjs'
const source=JSON.parse(gunzipSync(await readFile(join(import.meta.dirname,'source.tgs')))),anim=structuredClone(source)
const layer=(a,n)=>a.layers.find(l=>l.nm===n)
const gray=c=>{const v=.2126*c[0]+.7152*c[1]+.0722*c[2];return [v,v,v,c[3]??1]}
const mapProp=(p,fn)=>{if(!p.a)p.k=fn(p.k);else for(const k of p.k)for(const x of ['s','e'])if(k[x])k[x]=fn(k[x]);return p}
for(const l of anim.layers){
 if(['hair','nose','eye 1','eye 2','brow','ear 1','ear 2'].includes(l.nm))l.shapes=[]
 if(['paper','paper 2'].includes(l.nm))for(const s of walk(l.shapes)){
  if(s.c)mapProp(s.c,gray)
  if(s.g)mapProp(s.g.k,k=>{const r=[...k];for(let n=0;n<s.g.p;n++)r.splice(n*4+1,3,...gray(k.slice(n*4+1,n*4+4)).slice(0,3));return r})
 }
}
const face=layer(anim,'Face'),neck=layer(anim,'Neck')
face.shapes=head(path(layer(source,'Face')),{width:164,height:210,center:[310,208],bottom:[310,313],top:[310,103],outline:6.5})
const nativeHead=layer(source,'Face').shapes.find(g=>g.nm==='Group 5').it.find(s=>s.ty==='sh').ks
const nativeBottom=f=>{const raw=at(nativeHead,f),p=Array.isArray(raw)?raw[0]:raw;return 210.748+Math.max(...p.v.map(v=>v[1]))-8}
// The source shortens the part of its head below the rim while plunging.
// Preserve our skull outline and clip only its hidden lower portion instead.
const cutFrames=[0,16,17,18,19,20,21,97,98,99,100,101,102,179]
for(const s of walk(face.shapes))if(s.ty==='sh'){
 const rest=first(s.ks)
 s.ks={a:1,k:cutFrames.map(t=>({t,s:[clipHead(rest,nativeBottom(t))],h:1}))}
}
const neckGroup=neck.shapes[0],neckShape=neckGroup.it.find(s=>s.ty==='sh')
neckGroup.it=[neckShape,stroke(5.5),gradient([0,48],[0,-44]),structuredClone(neckGroup.it.at(-1))]
// Reuse the exact friendly small smile from approved 070, including its curves.
const donor=freeze(JSON.parse(gunzipSync(await readFile(join(ROOT,'packs/blue/ready/face-with-hand-over-mouth.tgs')))),0)
const mouthSource=layer(donor,'mouth 3')
for(const l of donor.layers)if(l.ind!==mouthSource.ind&&l.shapes)l.shapes=[]
donor.ip=0;donor.op=1;for(const l of donor.layers){l.ip=0;l.op=1}
const eng=await engine(),sample=eng.create(JSON.stringify(donor)),px=sample.render(0,512,512)
let x0=512,y0=512,x1=0,y1=0
for(let y=0;y<512;y++)for(let x=0;x<512;x++)if(px[(y*512+x)*4+3]>10){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)}
sample.drop();assert(x1>x0)
let it=structuredClone(mouthSource.shapes),current=mouthSource
while(current){
 const t=current.ks
 it=[{ty:'gr',it:[...it,{ty:'tr',p:t.p??{a:0,k:[0,0]},a:t.a??{a:0,k:[0,0]},s:t.s??{a:0,k:[100,100]},r:t.r??{a:0,k:0},o:{a:0,k:100}}]}]
 current=current.parent==null?null:donor.layers.find(l=>l.ind===current.parent)
}
const scale=74/(x1-x0),mouth=layer(anim,'mouth')
mouth.shapes=[{ty:'gr',nm:'Approved 070 smile',it:[...it,{...tr(),p:{a:0,k:[310,257]},a:{a:0,k:[(x0+x1)/2,(y0+y1)/2]},s:{a:0,k:[scale*100,scale*220]}}]}]
mouth.ks={p:{a:0,k:[0,0]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:structuredClone(layer(source,'mouth').ks.o)}
// Public TGS validation rejects gradient strokes in this attached export.
function clean(x){
 if(!x||typeof x!=='object')return
 if(x.ty==='gs'){
  const mid=Math.floor(x.g.p/2)*4+1,c=mapProp(structuredClone(x.g.k),k=>[...k.slice(mid,mid+3),1])
  x.ty='st';x.c=c;delete x.g;delete x.s;delete x.e;delete x.t;delete x.h;delete x.a
 }
 if(x.ty==='tr'){delete x.sk;delete x.sa}
 for(const v of Object.values(x))if(v&&typeof v==='object')clean(v)
}
clean(anim);anim.nm='Синий Skibidi · дружелюбная улыбка'
const bytes=gzipSync(Buffer.from(JSON.stringify(anim)),{level:9});assert(bytes.length<=65536)
await mkdir(join(ROOT,'exports/blue'),{recursive:true});await mkdir(join(ROOT,'exports/sheets/skibidi-toilet'),{recursive:true})
await writeFile(join(ROOT,'exports/blue/skibidi-toilet.tgs'),bytes)
const r=eng.create(JSON.stringify(anim)),original=eng.create(JSON.stringify(source)),frames=[0,6,13,18,30,60,95,100,110,120,140,179]
const sheet=new Canvas(6*256,4*276)
for(const [i,f] of frames.entries())for(const [row,p]of [original,r].entries()){
 const x=i%6*256,y=(Math.floor(i/6)*2+row)*276;sheet.text(''+f,x+4,y+4,[0,0,0]);sheet.draw(p.render(f,256,256),256,x,y+20)
}
await writeFile(join(ROOT,'exports/sheets/skibidi-toilet/preview.png'),encodePng(sheet.px,sheet.width,sheet.height))
for(const f of frames)await writeFile(join(ROOT,`exports/sheets/skibidi-toilet/${f}.png`),encodePng(r.render(f,512,512),512,512))
r.drop();original.drop();console.log(`skibidi-toilet: ${bytes.length} bytes; blue head/neck, approved smile, grey paper`)

