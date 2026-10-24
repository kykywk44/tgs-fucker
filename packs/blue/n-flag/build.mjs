// 756: use the original central insignia's deformation instead of cloth edges.
import {readFile} from 'node:fs/promises'
import {read,walk,at,baked,group,gradient,rgb,finish} from '../lib/silhouette.mjs'
import {warpShape} from '../clipboard/scene.mjs'
const source=await read('packs/blue/n-flag/source.tgs'),anim=structuredClone(source)
anim.nm='756 · Синий флаг n'
const insignia=source.layers.find(l=>l.nm==='круг')
const property=walk(insignia.shapes).find(p=>p.ty==='sh').ks
anim.layers=anim.layers.filter(l=>l.ind!==insignia.ind)
const cloth=anim.layers.find(l=>l.nm==='заливка')
for(const l of anim.layers)for(const p of walk(l.shapes??[])){
 if(p.ty==='st')p.c={a:0,k:[...rgb('#335375'),1]}
 if(p.ty==='fl'&&l.nm==='заливка')Object.assign(p,gradient([0,170],[0,-170]))
 if(p.ty==='fl'&&l.nm==='загибок')p.c={a:0,k:[...rgb('#6086a7'),1]}
}
const logo=JSON.parse(await readFile(new URL('../technologist-bust/logo.json',import.meta.url),'utf8')).shape
const bounds=p=>[0,1].map(d=>[Math.min(...p.v.map(v=>v[d])),Math.max(...p.v.map(v=>v[d]))])
const box=bounds(logo),center=box.map(([a,b])=>(a+b)/2),scale=150/(box[1][1]-box[1][0])
const rest=at(property,0)[0],restBox=bounds(rest),restCenter=restBox.map(([a,b])=>(a+b)/2)
// The source circle sits left/below the visual cloth centre. Move the print
// in material coordinates so its correction follows each wave as well.
const printOffset=[28,-10]
const anchors=rest.v.map(p=>p.map(x=>x/100)),n=anchors.length
const kernel=(a,b)=>{const r=a.reduce((s,v,d)=>s+(v-b[d])**2,0);return r?r*Math.log(r):0}
// Thin-plate interpolation follows the source emblem's eight persistent points.
// Edge contour vertices are unsuitable: they slide along folds during this rig.
function deformation(target){
 const rows=anchors.map((p,i)=>[...anchors.map(q=>kernel(p,q)),1,...p,...target.v[i].map(x=>x/100)])
 rows.push([...anchors.map(()=>1),0,0,0,0,0])
 for(let d=0;d<2;d++)rows.push([...anchors.map(p=>p[d]),0,0,0,0,0])
 for(let c=0;c<n+3;c++){
  let pivot=c;for(let r=c+1;r<n+3;r++)if(Math.abs(rows[r][c])>Math.abs(rows[pivot][c]))pivot=r
  ;[rows[c],rows[pivot]]=[rows[pivot],rows[c]]
  const divisor=rows[c][c];for(let j=c;j<n+5;j++)rows[c][j]/=divisor
  for(let r=0;r<n+3;r++)if(r!==c){const weight=rows[r][c];for(let j=c;j<n+5;j++)rows[r][j]-=weight*rows[c][j]}
 }
 return q=>{
  const p=q.map((v,d)=>((v-center[d])*scale+restCenter[d]+printOffset[d])/100),basis=[...anchors.map(a=>kernel(p,a)),1,...p]
  return [0,1].map(d=>100*basis.reduce((s,v,i)=>s+v*rows[i][n+3+d],0))
 }
}
const poses=Array.from({length:180},(_,f)=>warpShape(logo,deformation(at(property,f)[0])))
// The source emblem also has short, hand-keyed direction changes. A small
// symmetric temporal filter softens these without delaying the printed mark.
const weights=Array.from({length:13},(_,i)=>Math.exp(-.5*((i-6)/2.5)**2)),total=weights.reduce((s,w)=>s+w,0)
const shape=f=>({c:true,...Object.fromEntries(['v','i','o'].map(k=>[k,poses[f][k].map((p,j)=>p.map((_,d)=>
 Math.round(1000*weights.reduce((s,w,i)=>s+w*poses[Math.max(0,Math.min(179,f+i-6))][k][j][d],0)/total)/1000))]))})
const mark={ty:4,ind:100,nm:'n · на ткани',parent:cloth.ind,ip:0,op:180,st:0,sr:1,
 ks:structuredClone(insignia.ks),
 shapes:[group('n',[{ty:'sh',ks:baked(shape,180,true,3)},{ty:'fl',c:{a:0,k:[1,1,1,1]},o:{a:0,k:100},r:1}])]}
anim.layers.splice(anim.layers.indexOf(cloth),0,mark)
await finish('n-flag',source,anim,[0,15,30,45,60,70,75,80,90,120,150,179])


