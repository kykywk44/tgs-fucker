// Visual regressions the user reported: detached neck/shoulders, invented pale
// shoulder bands, static mouth, and a different clip appearing after the turn.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {read,walk,at} from '../lib/silhouette.mjs'
import {engine,load,ROOT} from '../../../scripts/lib/sheets.mjs'
import {join} from 'node:path'
const {fitHomography,applyHomography}=await load('src/core/homography.ts')
const shape=(p,f=0)=>{const v=at(p,f);return v.v?v:v[0]}
const donor=await read('packs/blue/ready/facepalm.tgs')
const donorBody=walk(donor.assets[0].layers.find(l=>l.nm==='BODY').shapes)
const donorPaths=donorBody.filter(s=>s.ty==='sh').map(s=>shape(s.ks))
const card=await read('packs/blue/ready/identification-card.tgs')
const cardMouth=[...card.layers,...card.assets.flatMap(a=>a.layers??[])].find(l=>l.nm==='Mouth')
const cardPath=shape(walk(cardMouth.shapes).find(s=>s.ty==='sh').ks,110)
const original=await read('packs/blue/clipboard/source-193.tgs')
const originalClip=original.assets[0].layers.find(l=>l.nm==='Tablet').shapes[0].it.find(g=>g.nm==='Group 3')
const originalClipPaths=walk(originalClip.it).filter(p=>p.ty==='sh').length
const eng=await engine(),reports=[]
for(const file of ['exports/blue/clipboard.tgs','exports/blue/clipboard-6s-preview.tgs']){
 const anim=await read(file),body=anim.layers.find(l=>l.nm==='BODY'),mouth=anim.layers.find(l=>l.nm==='Mouth')
 const paints=walk(body.shapes),paths=paints.filter(s=>s.ty==='sh').map(s=>shape(s.ks))
 assert.equal(paths.length,donorPaths.length)
 // One common affine fit must reproduce ALL vertices and Bézier handles of the
 // approved torso, rather than merely matching its bounding box.
 const from=donorPaths[1].v.slice(0,4),to=paths[1].v.slice(0,4),m=fitHomography(from,to)
 let bodyError=0
 for(let i=0;i<paths.length;i++)for(let j=0;j<paths[i].v.length;j++){
  const old=donorPaths[i],now=paths[i]
  for(const key of ['v','i','o']){
   const src=key==='v'?old.v[j]:old.v[j].map((v,d)=>v+old[key][j][d])
   const expected=applyHomography(m,src),actual=key==='v'?now.v[j]:now.v[j].map((v,d)=>v+now[key][j][d])
   bodyError=Math.max(bodyError,Math.hypot(...actual.map((v,d)=>v-expected[d])))
  }
 }
 assert.ok(bodyError<.05,'Torso is no longer an affine copy of approved facepalm')
 const actualGradient=paints.find(p=>p.ty==='gf').g,donorGradient=donorBody.find(p=>p.ty==='gf').g
 assert.equal(actualGradient.p,donorGradient.p)
 actualGradient.k.k.forEach((v,i)=>assert.ok(Math.abs(v-donorGradient.k.k[i])<.0051,'Approved torso material (2-decimal export precision)'))
 assert.ok(!paints.some(p=>p.c?.k?.[0]>.6),'Invented bright shoulder highlights')
 const mouthPath=walk(mouth.shapes).find(p=>p.ty==='sh')
 assert.ok(mouthPath.ks.a)
 const widths=[]
 for(let f=0;f<anim.op;f++){
  const p=shape(mouthPath.ks,f);assert.equal(p.v.length,cardPath.v.length)
  widths.push(Math.max(...p.v.map(v=>v[0]))-Math.min(...p.v.map(v=>v[0])))
 }
 assert.ok(Math.max(...widths)/Math.min(...widths)>1.15,'Mouth must visibly change shape')
 const clip=anim.assets[0].layers.find(l=>l.nm==='Исходный металлический зажим')
 assert.equal(walk(clip.shapes).filter(p=>p.ty==='sh').length,originalClipPaths,'All original clip paths')
 assert.equal(clip.shapes[0].it.at(-1).o.k,100,'Source clip stays visible across the turn')
 const isolated=structuredClone(anim)
 for(const l of [...isolated.layers,...isolated.assets.flatMap(a=>a.layers??[])])
  if(l.ty===4&&!['BODY','HEAD'].includes(l.nm))l.shapes=[]
 const player=eng.create(JSON.stringify(isolated)),S=256,visited=new Uint8Array(S*S),queue=new Int32Array(S*S)
 let minJoinedPixels=Infinity
 for(let f=0;f<anim.op;f++){
  const px=player.render(f,S,S),opaque=i=>px[i*4+3]>192
  visited.fill(0);const components=[]
  for(let i=0;i<S*S;i++)if(!visited[i]&&opaque(i)){
   let head=0,tail=1;queue[0]=i;visited[i]=1
   while(head<tail){const q=queue[head++],x=q%S
    for(const n of [x?q-1:-1,x<S-1?q+1:-1,q-S,q+S])
     if(n>=0&&n<S*S&&!visited[n]&&opaque(n)){visited[n]=1;queue[tail++]=n}
   }
   if(tail>32)components.push(tail)
  }
  assert.equal(components.length,1,`Head/body disconnect in ${file}, frame ${f}`)
  minJoinedPixels=Math.min(minJoinedPixels,components[0])
 }
 player.drop()
 reports.push({file,frames:anim.op,bodyFrom:'ready/facepalm.tgs',bodyError,smileFrom:'ready/identification-card.tgs',mouthWidthRange:[Math.min(...widths),Math.max(...widths)],headBodyConnectedEveryFrame:true,minJoinedPixels,originalClipPaths})
}
await writeFile(join(ROOT,'exports/clipboard-6s/appearance-verification.json'),JSON.stringify(reports,null,2)+'\n')
console.log(JSON.stringify(reports,null,2))
