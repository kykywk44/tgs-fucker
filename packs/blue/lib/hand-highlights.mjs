// Unified, restrained specular palette for standalone blue hands only.
export const HAND_TARGETS=['call-me-hand','clapping-hands','flexed-biceps','folded-hands','hand-with-fingers-splayed','hand-with-index-finger-and-thumb-crossed','handshake','heart-hands','index-pointing-at-the-viewer','leftwards-hand','loser-hand','middle-finger','ok-hand','oncoming-fist','open-hands','palms-up-together','raised-back-of-hand','raised-hand','raising-hands','rightwards-hand','six-seven','thumbs-down','thumbs-up','victory-hand','vulcan-salute','waving-hand','writing-hand','gift-hand','finger-ok','pinching-hand']
export function normalizeHandHighlights(input,style={}){
 const anim=structuredClone(input),color=style.handHighlight??'#8cb7d3',limit=style.handHighlightOpacity??85
 const target=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255)
 const bright=c=>c[0]>.51&&c[1]>.65&&c[2]>c[0]+.025
 const mapProperty=(p,fn)=>p.a?{...p,k:p.k.map(k=>({...k,...(k.s&&{s:fn(k.s)}),...(k.e&&{e:fn(k.e)})}))}:{...p,k:fn(p.k)}
 function opacity(p){
  p??={a:0,k:100}
  const values=p.a?p.k.flatMap(k=>[...(k.s??[]),...(k.e??[])]):[p.k],peak=Math.max(...values)
  if(peak<=limit)return p
  const scale=v=>Array.isArray(v)?v.map(x=>x*limit/peak):v*limit/peak
  return mapProperty(p,scale)
 }
 function items(list){for(const p of list){
  if(p.ty==='gr'){items(p.it);continue}
  let light=false
  if(['fl','st'].includes(p.ty)&&p.c){p.c=mapProperty(p.c,c=>{if(!bright(c))return c;light=true;return [...target,...c.slice(3)]})}
  if(['gf','gs'].includes(p.ty)&&p.g){p.g.k=mapProperty(p.g.k,values=>{
   const a=[...values],first=a.slice(1,4)
   // Uniform blue gradients are hand reflections with alpha ramps. Multicolour
   // gradients include the original sparkle effects; keep those untouched.
   const uniform=Array.from({length:p.g.p},(_,i)=>a.slice(i*4+1,i*4+4)).every(c=>c.every((v,d)=>Math.abs(v-first[d])<1e-6))
   if(uniform&&bright(first)){light=true;for(let i=0;i<p.g.p;i++)a.splice(i*4+1,3,...target)}return a})}
  // Keep narrow rim strokes and every existing softer accent. Dense fills
  // share an85% maximum; animated envelopes retain their original curves.
  if(light&&['fl','gf'].includes(p.ty))p.o=opacity(p.o)
 }}
 for(const l of [...anim.layers,...(anim.assets??[]).flatMap(a=>a.layers??[])])if(l.shapes&&!l.td)items(l.shapes)
 return anim
}
