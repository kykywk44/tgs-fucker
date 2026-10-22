// Carry 143's index-tip displacement into the fixed 145 pose, with anchored bases.
import {at,walk,transform,mul,inverse,point,I,mapProperty} from '../lib/silhouette.mjs'

export function addFingerFlex(layers,motion,{indexGain=1,thumbGain=.3}={}) {
  const source=walk(motion.layers.find(l=>l.nm==='Index 4').shapes).find(x=>x.ty==='sh').ks
  const reference=at(source,0)[0].v[2]
  const smooth=x=>{const u=Math.max(0,Math.min(1,x));return u*u*(3-2*u)}
  const round=x=>Math.round(x*1000)/1000
  const index=new Set(['Index stroke','Index fill shad light','Palm Fill','Palm Index Shad'])
  const thumb=new Set(['Thumb 3','Thumb Shad','Thumb Down Shad 2','Palm Fill','Palm Index Shad'])
  function localToHand(layer) {
    const parent=layer.parent==null||layer.parent===21?I:localToHand(layers.find(l=>l.ind===layer.parent))
    return mul(parent,transform(layer.ks,0))
  }
  let paths=0
  for(const layer of layers) {
    if(!layer.shapes||(!index.has(layer.nm)&&!thumb.has(layer.nm)))continue
    function visit(items,parent) {
      const matrix=mul(parent,transform(items.find(x=>x.ty==='tr'),0)),inv=inverse(matrix)
      for(const item of items) {
        if(item.ty==='gr'){visit(item.it,matrix);continue}
        if(item.ty!=='sh')continue
        const base=structuredClone(item.ks.k)
        const warp=(q,delta)=>{
          // At the palm both fields are zero, so the finger joints stay attached.
          const a=index.has(layer.nm)?smooth((-85-q[1])/208):0
          const b=thumb.has(layer.nm)?smooth((q[0]-115)/165):0
          return [q[0]+delta[0]*a*indexGain-delta[1]*b*thumbGain,
            q[1]+delta[1]*a*indexGain+delta[0]*b*thumbGain]
        }
        const deform=shape=>{
          const delta=shape.v[2].map((v,d)=>v-reference[d])
          const out={...base,v:[],i:[],o:[]}
          for(let n=0;n<base.v.length;n++) {
            const v=point(inv,warp(point(matrix,base.v[n]),delta))
            out.v.push(v.map(round))
            for(const key of ['i','o']) {
              const control=base.v[n].map((v,d)=>v+base[key][n][d])
              const q=point(inv,warp(point(matrix,control),delta))
              out[key].push(q.map((x,d)=>round(x-v[d])))
            }
          }
          return out
        }
        const moved=deform(at(source,36)[0])
        if(!moved.v.some((v,n)=>v.some((x,d)=>Math.abs(x-base.v[n][d])>.002)))continue
        item.ks=mapProperty(source,deform)
        paths++
      }
    }
    visit(layer.shapes,localToHand(layer))
  }
  return {paths,indexGain,thumbGain,sourceTimes:source.k.map(k=>k.t)}
}
