import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {gunzipSync,gzipSync} from 'node:zlib'
import {ROOT,Canvas,engine,encodePng,load} from '../../../scripts/lib/sheets.mjs'

const dir=import.meta.dirname
const cfg=JSON.parse(await readFile(join(dir,'recipe.json'),'utf8'))
const logo=JSON.parse(await readFile(join(dir,'logo.json'),'utf8'))
const original=JSON.parse(gunzipSync(await readFile(join(dir,'source.tgs'))))
const anim=structuredClone(original)
const walk=xs=>xs.flatMap(s=>s.ty==='gr'?[s,...walk(s.it)]:[s])
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255)
const chromatic=c=>Math.max(...c.slice(0,3))-Math.min(...c.slice(0,3))>.055
const mapProperty=(p,fn)=>p.a?{...p,k:p.k.map(k=>({...k,...(k.s&&{s:k.s.map(fn)}),...(k.e&&{e:k.e.map(fn)})}))}:{...p,k:fn(p.k)}
const length=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
const zero=p=>Math.hypot(...p)<.01
const add=(a,b)=>a.map((v,d)=>v+b[d]),sub=(a,b)=>a.map((v,d)=>v-b[d]),mul=(a,k)=>a.map(v=>v*k)
const mix=(a,b,t)=>a.map((v,d)=>v+(b[d]-v)*t)
const rounded=x=>Math.round(x*10000)/10000

// Replace each straight corner by two tangent points and a quadratic fillet,
// represented as a cubic. Identical topology at every morph key, including
// the almost flat edge-on poses. Existing curved spine segments are retained.
function soften(path,indices){
  const out={c:path.c,v:[],i:[],o:[]}
  for(let n=0;n<path.v.length;n++){
    if(!indices.has(n)){
      out.v.push(path.v[n]);out.i.push(path.i[n]);out.o.push(path.o[n]);continue
    }
    const v=path.v[n],prev=path.v[(n+path.v.length-1)%path.v.length],next=path.v[(n+1)%path.v.length]
    const incoming=length(prev,v),outgoing=length(v,next)
    const radius=zero(path.i[n])&&zero(path.o[n])?Math.min(cfg.cornerRadius,incoming*.18,outgoing*.18):0
    const p=incoming?mix(v,prev,radius/incoming):v,q=outgoing?mix(v,next,radius/outgoing):v
    out.v.push(p,q)
    out.i.push(radius?[0,0]:path.i[n],mul(sub(v,q),2/3))
    out.o.push(mul(sub(v,p),2/3),radius?[0,0]:path.o[n])
  }
  return out
}

// The separate rim strokes still ended at the old pointed corner even after
// rounding the filled cover. Stop each stroke at the fillet's tangent point.
// Use the nearby cover pose to reduce the inset while the cover is edge-on.
const rimSpecs=[['g top',0,4],['r top',0,4],['b top',1,4],['b top 2',1,5]]
const groupOffset=group=>{
  const tr=group.it.find(s=>s.ty==='tr')
  return [0,1].map(d=>(tr?.p?.k[d]??0)-(tr?.a?.k[d]??0))
}
let shortened=0
for(const [name,rimIndex,faceIndex] of rimSpecs){
  const layer=anim.layers.find(l=>l.nm===name),rim=layer.shapes[rimIndex],face=layer.shapes[faceIndex]
  const rimPath=rim.it.find(s=>s.ty==='sh'),facePath=face.it.find(s=>s.ty==='sh')
  const rimOffset=groupOffset(rim),faceOffset=groupOffset(face)
  const inset=(shape,t)=>{
    const pose=facePath.ks.a?facePath.ks.k.reduce((best,k)=>Math.abs(k.t-t)<Math.abs(best.t-t)?k:best).s[0]:facePath.ks.k
    const end=add(shape.v.at(-1),rimOffset)
    const corner=pose.v.reduce((best,v,n)=>length(add(v,faceOffset),end)<length(add(pose.v[best],faceOffset),end)?n:best,0)
    const p=pose.v[corner],prev=pose.v[(corner+pose.v.length-1)%pose.v.length],next=pose.v[(corner+1)%pose.v.length]
    const radius=Math.min(cfg.cornerRadius,length(prev,p)*.18,length(p,next)*.18)
    const out=structuredClone(shape),n=out.v.length-1,segment=length(out.v[n],out.v[n-1])
    assert(zero(out.i[n])&&zero(out.o[n-1]),`${name}: rim's final segment must be straight`)
    out.v[n]=mix(out.v[n],out.v[n-1],Math.min(radius,segment*.4)/Math.max(segment,1e-9))
    return out
  }
  rimPath.ks={...rimPath.ks,k:rimPath.ks.k.map((k,n,keys)=>({...k,
    ...(k.s&&{s:k.s.map(s=>inset(s,k.t))}),
    ...(k.e&&{e:k.e.map(s=>inset(s,keys[n+1]?.t??k.t))})}))}
  shortened++
}

let softened=0,repainted=0
for(const layer of anim.layers){
  if(!/^[gbr] /.test(layer.nm)||/page/.test(layer.nm))continue
  for(const shape of walk(layer.shapes??[])){
    if(shape.c&&!shape.c.a&&chromatic(shape.c.k)){
      const c=shape.c.k,light=c[0]*.2126+c[1]*.7152+c[2]*.0722
      const tone=.035+light*.30
      shape.c.k=[tone,tone*1.03,tone*1.13,c[3]??1];repainted++
    }
    if(shape.g){
      const stops=shape.g.p,properties=shape.g.k
      const recolor=values=>{
        if(!Array.from({length:stops},(_,n)=>values.slice(n*4+1,n*4+4)).some(chromatic))return values
        const result=[...values],palette=/top/.test(layer.nm)?cfg.cover:cfg.spine
        for(let n=0;n<stops;n++)result.splice(n*4+1,3,...rgb(palette[Math.round(n/(stops-1)*2)]))
        repainted++;return result
      }
      if(properties.a){for(const k of properties.k){if(k.s)k.s=recolor(k.s);if(k.e)k.e=recolor(k.e)}}
      else properties.k=recolor(properties.k)
    }
    if(shape.ty==='sh'){
      const initial=shape.ks.a?shape.ks.k[0].s[0]:shape.ks.k
      const candidates=new Set(initial.v.map((v,n)=>n).filter(n=>
        (initial.c||(n>0&&n<initial.v.length-1))&&zero(initial.i[n])&&zero(initial.o[n])))
      if(candidates.size){shape.ks=mapProperty(shape.ks,p=>soften(p,candidates));softened++}
    }
  }
}

// The exact logo outlines approved on the heart, projected onto the original
// upper cover's four material corners. Controls follow the same bilinear map.
// New layers reuse cover transforms/visibility and its hierarchy, so the white
// print disappears behind the edge and moves with the real opening cover.
const tr=()=>({ty:'tr',p:{a:0,k:[0,0]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}})

// Elastic follows two separately occluded surfaces: the cover and the page
// block. A disappearing cover variant must never hide the page-block stripe,
// or leave its obsolete connecting segment over a different book.
const {easeAt}=await load('src/core/motion/easing.ts')
function verticesAt(prop,t){
  if(!prop.a)return prop.k.v
  const keys=prop.k
  if(t<=keys[0].t)return keys[0].s[0].v
  const n=keys.findIndex((k,i)=>i<keys.length-1&&t>=k.t&&t<keys[i+1].t)
  if(n<0)return keys.at(-1).s[0].v
  const a=keys[n],b=keys[n+1],pick=v=>Array.isArray(v)?v[0]:v
  const u=(t-a.t)/(b.t-a.t)
  const eased=a.h?0:a.o&&a.i?easeAt({x1:pick(a.o.x),y1:pick(a.o.y),x2:pick(a.i.x),y2:pick(a.i.y)},u):u
  return a.s[0].v.map((p,i)=>mix(p,b.s[0].v[i],eased))
}
function groupPoint(group,p){
  const t=group.it.find(s=>s.ty==='tr'),s=t?.s?.k??[100,100]
  return p.map((v,d)=>(v-(t?.a?.k[d]??0))*s[d]/100+(t?.p?.k[d]??0))
}
const bandSpecs=[
  ['g top',[3,1,0,4]],['g top 2',[3,2,0,4]],
  ['r top',[2,1,0,4]],['r top 2',[2,1,0,4]],
  ['b top',[0,4,3,2]],['b top 2',[0,4,3,2]],
]
const stroke=()=>({ty:'st',c:{a:0,k:[...rgb(cfg.elastic.color),1]},o:{a:0,k:100},w:{a:0,k:cfg.elastic.width},lc:2,lj:2})
const offset=layer=>layer.ks.p.k.slice(0,2).map((v,d)=>v-layer.ks.a.k[d])
// Hand-tuned side-view interval. The source morphs move the front and lower
// edges by different horizontal amounts; material UV alone shears the strap.
// Ease into one vertical attachment axis, hold through the edge-on poses,
// then release once the lower cover has completed its turn.
function guideWeight(keys,t){
  if(t<=keys[0][0])return keys[0][1]
  const next=keys.findIndex(k=>k[0]>t)
  if(next<0)return keys.at(-1)[1]
  const [a,x]=keys[next-1],[b,y]=keys[next],u=(t-a)/(b-a),s=u*u*(3-2*u)
  return x+(y-x)*s
}
const sideGuide=t=>guideWeight(cfg.elastic.sideGuide,t)
const bottomGuide=t=>guideWeight(cfg.elastic.bottomGuide,t)

// Both lower-book representations are children of MOVE but have different
// animated translations. Use the unfolding cover's far-edge anchor in MOVE
// coordinates for all of them. Pinning to its near edge instead drifts left
// during the collapsed poses, even when the stripe itself remains vertical.
const unfolding=original.layers.find(l=>l.nm==='b top 2'),unfoldingFace=unfolding.shapes.at(-1)
function parentX(layer,t){
  const parent=original.layers.find(l=>l.ind===layer.parent),p=parent.ks.p
  assert(!parent.ks.r&&!parent.ks.s,'Lower-book guide assumes translating parents')
  if(!p.a)return p.k[0]-parent.ks.a.k[0]
  const keys=p.k,next=keys.findIndex(k=>k.t>t)
  if(next===0)return keys[0].s[0]-parent.ks.a.k[0]
  if(next<0)return keys.at(-1).s[0]-parent.ks.a.k[0]
  const a=keys[next-1],b=keys[next],pick=v=>Array.isArray(v)?v[0]:v,u=(t-a.t)/(b.t-a.t)
  const e=easeAt({x1:pick(a.o.x),y1:pick(a.o.y),x2:pick(a.i.x),y2:pick(a.i.y)},u)
  return a.s[0]+(b.s[0]-a.s[0])*e-parent.ks.a.k[0]
}
function lowerBookAxis(layer,t){
  // Once the cover stands up, freeze its attachment in book coordinates.
  // The far edge then sweeps left as the book tilts; chasing that edge while
  // fading the guide made the bottom end overshoot left and swing back.
  // Keep the parent's real movement, so the strap still follows the book.
  const vertices=verticesAt(unfoldingFace.it.find(s=>s.ty==='sh').ks,Math.min(t,cfg.elastic.bottomAnchorFrame))
  const far=groupPoint(unfoldingFace,mix(vertices[0],vertices[4],cfg.elastic.u))
  const current=verticesAt(unfoldingFace.it.find(s=>s.ty==='sh').ks,t)
  const near=groupPoint(unfoldingFace,mix(current[2],current[3],cfg.elastic.u))
  // Release toward the material attachment without crossing it and bouncing.
  const common=Math.max(far[0],near[0])+offset(unfolding)[0]+parentX(unfolding,t)
  return common-offset(layer)[0]-parentX(layer,t)
}
function simplifyBand(keys,tolerance=.035){
  const keep=new Set([0,keys.length-1])
  const visit=(first,last)=>{
    const a=keys[first],b=keys[last]
    let worst=-1,error=tolerance
    for(let n=first+1;n<last;n++){
      const t=(keys[n].t-a.t)/(b.t-a.t)
      const deviation=Math.max(...keys[n].s[0].v.map((p,i)=>length(p,mix(a.s[0].v[i],b.s[0].v[i],t))))
      if(deviation>error){error=deviation;worst=n}
    }
    if(worst>=0){keep.add(worst);visit(first,worst);visit(worst,last)}
  }
  visit(0,keys.length-1)
  return keys.filter((_,n)=>keep.has(n))
}
const bandKeys=(first,last,points)=>simplifyBand(Array.from({length:last-first+1},(_,n)=>{
  const t=first+n,v=points(t)
  return {t,s:[{c:false,v,i:v.map(()=>[0,0]),o:v.map(()=>[0,0])}],
    ...(t<last?{o:{x:.333,y:.333},i:{x:.667,y:.667}}:{})}
}))
for(const [bandIndex,[name,corners]] of bandSpecs.entries()){
  const source=original.layers.find(l=>l.nm===name),surface=source.shapes.at(-1)
  const lower=original.layers.find(l=>l.ind===source.parent)
  const floor=lower.shapes[0],upperPath=surface.it.find(s=>s.ty==='sh').ks,lowerPath=floor.it.find(s=>s.ty==='sh').ks
  assert(!source.ks.p.a&&!source.ks.a.a,'Cover placement must be static relative to its parent')
  const bandOut=Math.min(source.op,lower.op)
  const first=Math.max(0,source.ip),last=Math.min(anim.op-1,bandOut-1)
  const keys=bandKeys(first,last,t=>{
    const upper=verticesAt(upperPath,t)
    const [tl,far,near,bl]=corners.map(i=>upper[i]),u=cfg.elastic.u
    const points=[groupPoint(surface,mix(tl,far,u)),groupPoint(surface,mix(bl,near,u))],weight=sideGuide(t)
    if(name==='b top 2'){
      const axis=lowerBookAxis(source,t),blend=bottomGuide(t)
      points[0][0]+=(axis-points[0][0])*blend
      points[1][0]+=(axis-points[1][0])*blend
    }else if(!name.endsWith(' 2')){
      const bottom=verticesAt(lowerPath,t),edge=name.startsWith('b')?[1,2]:[4,0]
      const anchor=sub(groupPoint(floor,mix(bottom[edge[0]],bottom[edge[1]],u)),offset(source))
      points[1][0]+=(anchor[0]-points[1][0])*weight
    }
    if(name==='b top')points[1][0]+=(lowerBookAxis(source,t)-points[1][0])*bottomGuide(t)
    return points
  })
  const band={...structuredClone(source),op:bandOut,ind:200+bandIndex,nm:`elastic · ${name}`,
    shapes:[{ty:'gr',nm:'Elastic on cover',it:[{ty:'sh',ks:{a:1,k:keys}},stroke(),tr()]}]}
  anim.layers.splice(anim.layers.findIndex(l=>l.nm===name),0,band)
}

const pageBandSpecs=[
  ['g pages','g top',[3,1,0,4],[3,2,0,1],[4,0]],
  ['r pages','r top',[2,1,0,4],[2,1,3,0],[4,0]],
  ['b pages','b top',[0,4,3,2],[0,1,3,2],[1,2]],
  ['b pages 2','b top 2',[0,4,3,2],[0,1,3,2],[1,2]],
]
function opacityAt(prop,t){
  if(!prop)return 100
  if(!prop.a)return prop.k
  const keys=prop.k
  if(t<=keys[0].t)return keys[0].s[0]
  const next=keys.findIndex(k=>k.t>t)
  if(next<0)return keys.at(-1).s[0]
  const a=keys[next-1],b=keys[next]
  return a.s[0]+(b.s[0]-a.s[0])*(t-a.t)/(b.t-a.t)
}
for(const [n,[name,coverName,corners,paperCorners,bottomEdge]] of pageBandSpecs.entries()){
  const source=original.layers.find(l=>l.nm===name),face=source.shapes[3]
  const cover=original.layers.find(l=>l.nm===coverName),surface=cover.shapes.at(-1)
  const lower=original.layers.find(l=>l.ind===source.parent),floor=lower.shapes[0]
  assert.equal(cover.parent,source.parent)
  const upperPath=surface.it.find(s=>s.ty==='sh').ks,paperPath=face.it.find(s=>s.ty==='sh').ks,lowerPath=floor.it.find(s=>s.ty==='sh').ks
  const pageOffset=offset(source),coverOffset=offset(cover)
  const first=Math.max(0,source.ip),last=Math.min(anim.op-1,source.op-1),u=cfg.elastic.u
  const keys=bandKeys(first,last,t=>{
    const paper=verticesAt(paperPath,t),upper=verticesAt(upperPath,t),bottom=verticesAt(lowerPath,t)
    const [tl,tr,bl,br]=paperCorners.map(i=>paper[i])
    const pageTop=groupPoint(face,mix(tl,tr,u)),pageBottom=groupPoint(face,mix(bl,br,u))
    // The reverse-facing cover is drawn behind the stack. Its connecting
    // segment is hidden there; only the real page face remains in front.
    const forward=t<Math.min(cover.op,lower.op)&&opacityAt(cover.ks.o,t)>99
    const top=forward?sub(add(groupPoint(surface,mix(upper[corners[3]],upper[corners[2]],u)),coverOffset),pageOffset):pageTop
    const end=t<lower.op?sub(groupPoint(floor,mix(bottom[bottomEdge[0]],bottom[bottomEdge[1]],u)),pageOffset):pageBottom
    top[0]+=(end[0]-top[0])*sideGuide(t)
    if(name.startsWith('b pages')){
      const axis=lowerBookAxis(source,t),weight=bottomGuide(t)
      top[0]+=(axis-top[0])*weight
      end[0]+=(axis-end[0])*weight
    }
    // Tension runs straight between the two cover edges. Page coordinates
    // only supply a visibility fallback when that cover is hidden; they
    // must not introduce bends that pull the elastic onto the paper face.
    return [top,end]
  })
  const band={...structuredClone(source),ind:220+n,nm:`elastic · ${name}`,
    shapes:[{ty:'gr',nm:'Elastic on page block',it:[{ty:'sh',ks:{a:1,k:keys}},stroke(),tr()]}]}
  const above=name==='b pages 2'?'b page':name
  anim.layers.splice(anim.layers.findIndex(l=>l.nm===above),0,band)
}

const logoHeight=Math.max(...logo.flatMap(s=>s.v.map(p=>p[1])))-Math.min(...logo.flatMap(s=>s.v.map(p=>p[1])))
for(const [name,index,corners] of [['g top',100,[3,1,0,4]],['g top 2',101,[3,2,0,4]]]){
  const source=original.layers.find(l=>l.nm===name)
  const group=source.shapes.at(-1)
  const surface=group.it.find(s=>s.ty==='sh').ks
  const project=(glyph,face)=>{
    const [tl,tr,br,bl]=corners.map(n=>face.v[n])
    const point=p=>{
      const u=cfg.logo.center[0]+p[0]/210*cfg.logo.size[0]
      const v=cfg.logo.center[1]+p[1]/logoHeight*cfg.logo.size[1]
      return mix(mix(tl,tr,u),mix(bl,br,u),v).map(rounded)
    }
    return {c:true,v:glyph.v.map(point),i:glyph.v.map((p,n)=>sub(point(add(p,glyph.i[n])),point(p))),o:glyph.v.map((p,n)=>sub(point(add(p,glyph.o[n])),point(p)))}
  }
  const shapePaths=logo.map(glyph=>({ty:'sh',ks:mapProperty(surface,face=>project(glyph,face))}))
  const layer={...structuredClone(source),ind:index,nm:`+ąi · ${name}`,
    shapes:[{ty:'gr',nm:'+ąi · white vector print',it:[...shapePaths,{ty:'fl',c:{a:0,k:[1,1,1,1]},o:{a:0,k:100},r:1},structuredClone(group.it.find(s=>s.ty==='tr')??tr())]}]}
  // A printed logo must keep precisely the original layer's place in stacking.
  const at=anim.layers.findIndex(l=>l.nm===name)
  anim.layers.splice(at,0,layer)
}
anim.nm='637 · Графитовые дневники · +ąi'
// Generated fillets and projections otherwise retain meaningless floating
// point tails. Four decimals is below 0.001 canvas px and keeps TGS compact.
for(const layer of anim.layers){
  if(/page|Shadow/.test(layer.nm)||layer.ty===3)continue
  for(const shape of walk(layer.shapes??[]))if(shape.ty==='sh'){
    shape.ks=mapProperty(shape.ks,path=>({...path,...Object.fromEntries(['v','i','o'].map(key=>[key,path[key].map(p=>p.map(rounded))]))}))
  }
}
const output=gzipSync(Buffer.from(JSON.stringify(anim)),{level:9})
assert(output.length<=65536)
await mkdir(join(ROOT,'exports/emoji'),{recursive:true})
await writeFile(join(ROOT,'exports/emoji/diaries.tgs'),output)
await mkdir(join(ROOT,'exports/sheets/emoji-diaries'),{recursive:true})
const eng=await engine(),render=eng.create(JSON.stringify(anim)),sourceRender=eng.create(JSON.stringify(original))
assert(render&&sourceRender)
const frames=[0,30,50,55,60,66,75,87,104,130,150,178],size=230
const canvas=new Canvas(6*size,2*(size+22))
for(let n=0;n<frames.length;n++){
  const x=n%6*size,y=Math.floor(n/6)*(size+22)
  canvas.text(''+frames[n],x+5,y+5,[25,25,25]);canvas.draw(render.render(frames[n],size,size),size,x,y+22)
}
await writeFile(join(ROOT,'exports/sheets/emoji-diaries/preview.png'),encodePng(canvas.px,canvas.width,canvas.height))
const compare=new Canvas(3*360,2*360)
for(const [n,frame] of [0,30,150].entries()){
  compare.draw(sourceRender.render(frame,360,360),360,n*360,0)
  compare.draw(render.render(frame,360,360),360,n*360,360)
}
await writeFile(join(ROOT,'exports/sheets/emoji-diaries/compare.png'),encodePng(compare.px,compare.width,compare.height))
render.drop();sourceRender.drop()
console.log(`diaries: ${(output.length/1024).toFixed(1)} KB; ${softened} softened paths; ${shortened} shortened rims; ${repainted} graphite paints`)
