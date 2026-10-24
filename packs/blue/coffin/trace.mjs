// Vectorises the figure of reference/approved.png (it lies exactly on 584's coffin at 512/1254):
// the pixels are sorted into the pack's classes — dark outline, body, light rim — by colour, each
// class mask is blurred a little and its 0.5 level traced (marching squares), smoothed, simplified
// and fitted with cubic handles. The line art itself becomes filled shapes, open strokes with their
// tapered ends included, so it reads like the picture rather than like a re-drawing of it.
// node packs/blue/coffin/trace.mjs → traced.json (1254 px design space). Needs ffmpeg.
import {execFileSync} from 'node:child_process'
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'

const dir=import.meta.dirname,W=1254,N=W*W
const px=execFileSync('ffmpeg',['-loglevel','error','-i',join(dir,'reference/approved.png'),'-f','rawvideo','-pix_fmt','rgba','-'],{maxBuffer:N*4+1024})
const T={blue:40,line:108,shade:127,rim:182,minArea:12,blur:1.1,tolerance:0.45,outline:3.7,edge:6.5}

// ---------- classes ----------
const mask=(fn)=>{const m=new Float32Array(N);for(let p=0;p<N;p++){const r=px[p*4],g=px[p*4+1],b=px[p*4+2];m[p]=fn(r,g,b,(r+g+b)/3)?1:0}return m}
const isBlue=(r,g,b)=>b-r>T.blue&&b>60
const blue=mask(isBlue)
const line=mask((r,g,b,l)=>isBlue(r,g,b)&&l<T.line)
const rim=mask((r,g,b,l)=>isBlue(r,g,b)&&l>=T.rim)
// the body's shaded side: darker than the paint, lighter than a line
const shade=mask((r,g,b,l)=>isBlue(r,g,b)&&l>=T.line&&l<T.shade)
// the silhouette with its holes (the smile) filled, and the holes alone
const outside=new Uint8Array(N),stack=[0];outside[0]=1
while(stack.length){const q=stack.pop(),x=q%W;for(const r of [x>0?q-1:-1,x<W-1?q+1:-1,q-W,q+W])if(r>=0&&r<N&&!outside[r]&&!blue[r]){outside[r]=1;stack.push(r)}}
const solid=new Float32Array(N),holes=new Float32Array(N)
for(let p=0;p<N;p++){solid[p]=outside[p]?0:1;holes[p]=!outside[p]&&!blue[p]?1:0}
// distance into the silhouette, up to `edge`: the outline is drawn as an even stroke on the
// silhouette pulled in by half its width (`outline`), so the traced line art keeps only what lies
// inside, off that band (the picture's own outline is softer and lighter at the crown)
const depth=new Float32Array(N).fill(99),R=Math.ceil(T.edge),disk=[]
for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){const d=Math.hypot(dx,dy);if(d<=T.edge)disk.push([dx,dy,d])}
for(let p=0;p<N;p++){if(!solid[p])continue;const x=p%W,y=(p/W)|0
  for(const [dx,dy,d] of disk){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=W||yy>=W||!solid[yy*W+xx])depth[p]=Math.min(depth[p],d)}}
const inner=new Float32Array(N)
for(let p=0;p<N;p++){inner[p]=solid[p]&&depth[p]>T.outline?1:0;if(depth[p]<=T.edge)line[p]=0}
// the line between the legs is soft in the picture and traces as dashes: it is drawn by hand
// (recipe.json → person.strokes), so the picture's is erased along it
const erase=[{points:[[612,780],[650,810],[700,853],[750,905],[768,923]],r:9},
  // the chest's two creases trace with notches: drawn by hand too
  {points:[[380,662],[405,697],[432,730]],r:9},{points:[[535,619],[552,640],[570,660]],r:8}]
for(const {points,r} of erase)for(let k=0;k<points.length-1;k++){
  const [a,b]=[points[k],points[k+1]],l=Math.hypot(b[0]-a[0],b[1]-a[1])
  for(let y=Math.floor(Math.min(a[1],b[1])-r);y<=Math.max(a[1],b[1])+r;y++)for(let x=Math.floor(Math.min(a[0],b[0])-r);x<=Math.max(a[0],b[0])+r;x++){
    const t=Math.max(0,Math.min(1,((x-a[0])*(b[0]-a[0])+(y-a[1])*(b[1]-a[1]))/(l*l)))
    const d=Math.hypot(x-a[0]-t*(b[0]-a[0]),y-a[1]-t*(b[1]-a[1]));if(d<=r)line[y*W+x]=0;if(d<=r+5)rim[y*W+x]=0}}
// lone specks of a class are noise
function clean(m){
  const seen=new Uint8Array(N)
  for(let p=0;p<N;p++){if(!m[p]||seen[p])continue
    const list=[p];seen[p]=1
    for(let k=0;k<list.length;k++){const q=list[k],x=q%W;for(const r of [x>0?q-1:-1,x<W-1?q+1:-1,q-W,q+W])if(r>=0&&r<N&&m[r]&&!seen[r]){seen[r]=1;list.push(r)}}
    if(list.length<T.minArea)for(const q of list)m[q]=0}
  return m
}
function blur(m,s){
  const k=[],R=Math.ceil(s*3);for(let i=-R;i<=R;i++)k.push(Math.exp(-i*i/(2*s*s)))
  const sum=k.reduce((a,b)=>a+b),tmp=new Float32Array(N),out=new Float32Array(N)
  for(let y=0;y<W;y++)for(let x=0;x<W;x++){let v=0;for(let i=-R;i<=R;i++){const xx=Math.min(W-1,Math.max(0,x+i));v+=m[y*W+xx]*k[i+R]}tmp[y*W+x]=v/sum}
  for(let y=0;y<W;y++)for(let x=0;x<W;x++){let v=0;for(let i=-R;i<=R;i++){const yy=Math.min(W-1,Math.max(0,y+i));v+=tmp[yy*W+x]*k[i+R]}out[y*W+x]=v/sum}
  return out
}

// ---------- marching squares at 0.5 → closed loops ----------
function contours(f){
  const iso=0.5,v=(x,y)=>f[y*W+x]
  // edge points keyed by edge id; segments joined end to end
  const pt=(x0,y0,x1,y1)=>{const a=v(x0,y0),b=v(x1,y1),t=(iso-a)/(b-a);return [x0+(x1-x0)*t,y0+(y1-y0)*t]}
  const next=new Map(),where=new Map()
  const key=(x,y,d)=>(y*W+x)*2+d // d 0: horizontal edge from (x,y), 1: vertical
  for(let y=0;y<W-1;y++)for(let x=0;x<W-1;x++){
    const c=(v(x,y)>iso?8:0)|(v(x+1,y)>iso?4:0)|(v(x+1,y+1)>iso?2:0)|(v(x,y+1)>iso?1:0)
    if(c===0||c===15)continue
    const T_=key(x,y,0),B_=key(x,y+1,0),L_=key(x,y,1),R_=key(x+1,y,1)
    const P={[T_]:()=>pt(x,y,x+1,y),[B_]:()=>pt(x,y+1,x+1,y+1),[L_]:()=>pt(x,y,x,y+1),[R_]:()=>pt(x+1,y,x+1,y+1)}
    // segments oriented with the inside on the right (y down)
    const segs={1:[[B_,L_]],2:[[R_,B_]],3:[[R_,L_]],4:[[T_,R_]],5:[[T_,L_],[B_,R_]],6:[[T_,B_]],7:[[T_,L_]],
      8:[[L_,T_]],9:[[B_,T_]],10:[[L_,B_],[R_,T_]],11:[[R_,T_]],12:[[L_,R_]],13:[[B_,R_]],14:[[L_,B_]]}[c]
    for(const [a,b] of segs){next.set(a,b);where.set(a,P[a]);where.set(b,P[b])}
  }
  const loops=[]
  for(const start of next.keys()){
    if(!next.has(start))continue
    const loop=[];let k=start
    while(next.has(k)){loop.push(where.get(k)());const n=next.get(k);next.delete(k);k=n}
    if(loop.length>=8)loops.push(loop)
  }
  return loops
}
// ---------- loop → smooth cubic path ----------
const area=(p)=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1]},0)/2
function simplify(p,tol){
  // Douglas–Peucker on a closed loop: split at the two farthest-apart points
  const far=(a,b)=>{let best=0,i=-1;for(let k=a+1;k<b;k++){const [x0,y0]=p[a],[x1,y1]=p[b%p.length],[x,y]=p[k]
    const d=Math.abs((y1-y0)*x-(x1-x0)*y+x1*y0-y1*x0)/(Math.hypot(x1-x0,y1-y0)||1);if(d>best){best=d;i=k}}return [i,best]}
  const keep=new Set([0,Math.floor(p.length/2)])
  const rec=(a,b)=>{const [i,d]=far(a,b);if(d>tol){keep.add(i%p.length);rec(a,i);rec(i,b)}}
  rec(0,Math.floor(p.length/2));rec(Math.floor(p.length/2),p.length)
  return [...keep].sort((a,b)=>a-b).map((i)=>p[i])
}
function path(loop){
  // a light moving average first: the 0.5 level of a blurred mask is already smooth
  const n=loop.length,s=loop.map((_,i)=>[0,1].map((d)=>(loop[(i+n-1)%n][d]+2*loop[i][d]+loop[(i+1)%n][d])/4))
  const v=simplify(s,T.tolerance),m=v.length,r=(x)=>Math.round(x*100)/100
  const i=[],o=[]
  for(let k=0;k<m;k++){
    const a=v[(k+m-1)%m],b=v[k],c=v[(k+1)%m],d=[c[0]-a[0],c[1]-a[1]],l=Math.hypot(...d)||1
    const la=Math.hypot(b[0]-a[0],b[1]-a[1])/3,lc=Math.hypot(c[0]-b[0],c[1]-b[1])/3
    i.push([r(-d[0]/l*la),r(-d[1]/l*la)]);o.push([r(d[0]/l*lc),r(d[1]/l*lc)])
  }
  return {c:true,v:v.map((p)=>p.map(r)),i,o}
}
const trace=(m,s=T.blur,min=T.minArea)=>contours(blur(m,s)).filter((l)=>Math.abs(area(l))>min).map(path)

const out={size:W,
  silhouette:trace(inner),
  smile:trace(holes),
  lines:trace(clean(line),T.blur,40),
  rims:trace(clean(rim),0.9),
  shades:trace(clean(shade),5,400)}
await writeFile(join(dir,'traced.json'),JSON.stringify(out)+'\n')
console.log(Object.entries(out).filter(([,v])=>Array.isArray(v)).map(([k,v])=>`${k}: ${v.length} paths, ${v.reduce((s,p)=>s+p.v.length,0)} points`).join('; '))
if(process.argv[2]==='--debug'){
  const {encodePng}=await import('../../../scripts/lib/sheets.mjs')
  const img=new Uint8ClampedArray(N*4)
  for(let p=0;p<N;p++){const c=line[p]?[20,20,20]:rim[p]?[120,220,255]:inner[p]?[90,140,190]:solid[p]?[200,200,240]:[255,255,255];img.set([...c,255],p*4)}
  await writeFile(process.argv[3],encodePng(img,W,W))
}
