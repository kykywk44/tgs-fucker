import {read,by,whiteMouth} from '../lib/large-face.mjs'
import {head,path,at,mapProperty,group,stroke,gradient,finish} from '../lib/silhouette.mjs'
const name='melting-face',source=await read(`packs/blue/${name}/source.tgs`),anim=structuredClone(source)
anim.nm='074 · Тающая голова'
anim.layers=anim.layers.filter(l=>!['Right eye','Left eye'].includes(l.nm))
whiteMouth(by(anim.layers,'Mouth'),['Group 1','Group 2'])
const body=by(anim.layers,'Body'),outline=by(source.layers,'Body').shapes[0]
const old=path({shapes:[outline]}),reference=at(old,19)[0],sx=300/378.29418
const model=head(old,{width:300,height:378.29418,center:[3.001,-14.5]})
const skull=model[1].it[0].ks.k[0].s[0]
const warp=([x,y])=>[3.001+(x-3.001)*sx*(1-.26*Math.max(0,Math.min(1,(y+15)/190))),y]
function melted(p) {
  const out={c:true,v:[],i:[],o:[]},add=(v,i,o)=>{out.v.push(v);out.i.push(i);out.o.push(o)}
  const mv=(n,sourceIndex,strength=1)=>{
    const delta=p.v[sourceIndex].map((v,d)=>(v-reference.v[sourceIndex][d])*(d===0?sx:1)*strength)
    add(skull.v[n].map((v,d)=>v+delta[d]),skull.i[n].slice(),skull.o[n].slice())
  }
  for(const [n,index]of [[2,0],[3,1],[4,1],[5,1],[6,2],[7,3]])mv(n,index,n===7?.5:1)
  for(let n=3;n<20;n++) {
    const v=warp(reference.v[n]),delta=p.v[n].map((v,d)=>(v-reference.v[n][d])*(d===0?sx:1))
    const handle=k=>{
      const q=warp(reference.v[n].map((v,d)=>v+reference[k][n][d]))
      return q.map((x,d)=>x-v[d]+(p[k][n][d]-reference[k][n][d])*(d===0?sx:1))
    }
    add(v.map((v,d)=>v+delta[d]),handle('i'),handle('o'))
  }
  mv(1,19,.5)
  return out
}
const shape=mapProperty(old,melted),rim=structuredClone(model[0])
// The crown remains solid while the lower original vertices flow into a puddle.
const pos=outline.it.find(x=>x.ty==='tr')
body.shapes=[{ty:'gr',nm:'Тающий силуэт',it:[
  rim,group('Голова и лужица',[{ty:'sh',ks:shape},stroke(),gradient([3,200],[3,-204])]),
  structuredClone(pos),
]}]
await finish(name,source,anim,[0,10,19,35,56,70,90,110,130,150,166,179])
