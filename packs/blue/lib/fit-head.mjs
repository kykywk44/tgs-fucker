// The 069 head over a face circle that changes shape (a scream stretches it): the circle's path,
// narrowed about its centre to the head's 300:378 proportion, keyframe by keyframe, so the head
// follows every stretch of the original. `scale` undoes a group's scale for the outline width.
import {head} from './silhouette.mjs'
import {mapVector} from './large-face.mjs'
const RATIO=300/378.29418
const narrow=p=>{
  const xs=p.v.map(v=>v[0]),cx=(Math.min(...xs)+Math.max(...xs))/2
  return {...p,v:p.v.map(([x,y])=>[cx+(x-cx)*RATIO,y]),i:p.i.map(([x,y])=>[x*RATIO,y]),o:p.o.map(([x,y])=>[x*RATIO,y])}
}
export function fittedHead(circle,{bottom,top,scale=1}){
  const narrowed=circle.a?{...circle,k:circle.k.map(k=>({...k,...(k.s&&{s:k.s.map(narrow)}),...(k.e&&{e:k.e.map(narrow)})}))}:{...circle,k:narrow(circle.k)}
  return head(narrowed,{bottom,top,outline:8/scale})
}
export {mapVector}
