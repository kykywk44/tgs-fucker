// The blue one in the coffin, from reference/approved.png vectorised by trace.mjs (traced.json,
// 1254 px design space, lying exactly on 584's coffin at 512/1254): the body's silhouette in the
// pack's gradient, its traced line art (outline and open strokes, as filled shapes) and light rims
// over it, the white smile. Static: it lies on the coffin's floor and moves with it.
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {group,rgb,stroke,tr,walk} from '../lib/silhouette.mjs'

const traced=JSON.parse(readFileSync(join(import.meta.dirname,'traced.json'),'utf8'))
const S=512/traced.size,r=(x)=>Math.round(x*S*100)/100
const scaled=(p)=>({c:p.c,v:p.v.map((q)=>q.map(r)),i:p.i.map((q)=>q.map(r)),o:p.o.map((q)=>q.map(r))})
const shapes=(list)=>list.map((p)=>({ty:'sh',ks:{a:0,k:scaled(p)}}))
const fill=(c,o=100,rule=1)=>({ty:'fl',c:{a:0,k:[...rgb(c),1]},o:{a:0,k:o},r:rule})
const grad=(s,e,stops,o=100)=>({ty:'gf',t:1,o:{a:0,k:o},r:1,bm:0,s:{a:0,k:s.map(r)},e:{a:0,k:e.map(r)},
  g:{p:stops.length,k:{a:0,k:stops.flatMap(([u,c])=>[u,...rgb(c)])}}})
const box=(p)=>{const xs=p.v.map((v)=>v[0]),ys=p.v.map((v)=>v[1]);return (Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys))}

// an SVG path of M/L/C/Z in the design space → {c,v,i,o}
function svg(d){
  const t=d.match(/[MCLZ]|-?\d+(?:\.\d+)?/g),v=[],i=[],o=[];let n=0,c=false
  const pt=()=>[+t[n++],+t[n++]]
  while(n<t.length){const cmd=t[n++]
    if(cmd==='M'||cmd==='L'){v.push(pt());i.push([0,0]);o.push([0,0])}
    else if(cmd==='C'){const a=pt(),b=pt(),p=pt(),last=v.at(-1);o[o.length-1]=[a[0]-last[0],a[1]-last[1]];v.push(p);i.push([b[0]-p[0],b[1]-p[1]]);o.push([0,0])}
    else c=true}
  if(c&&v.length>1&&v.at(-1).every((x,j)=>x===v[0][j])){i[0]=i.at(-1);v.pop();i.pop();o.pop()}
  return {c,v,i,o}
}

// A tapered stroke along smooth points (design space): width w[0] at the first point to w[1] at
// the last, pointed ends — a line drawn with a brush, as filled shape.
function taper(points,[w0,w1]){
  const n=points.length,side=[],back=[]
  for(let k=0;k<n;k++){
    const a=points[Math.max(0,k-1)],b=points[Math.min(n-1,k+1)],d=[b[0]-a[0],b[1]-a[1]],l=Math.hypot(...d)
    const u=k/(n-1),w=(w0+(w1-w0)*u)*Math.sin(Math.PI/2*Math.min(1,Math.min(u,1-u)*7+0.3))/2
    const nx=-d[1]/l*w,ny=d[0]/l*w
    side.push([points[k][0]+nx,points[k][1]+ny]);back.unshift([points[k][0]-nx,points[k][1]-ny])
  }
  const v=[...side,...back],m=v.length,i=[],o=[]
  for(let k=0;k<m;k++){const a=v[(k+m-1)%m],c=v[(k+1)%m],t=[(c[0]-a[0])/6,(c[1]-a[1])/6];i.push([-t[0],-t[1]]);o.push(t)}
  return {c:true,v,i,o}
}

// A smooth closed outline through points (Catmull-Rom handles).
function smooth(v,closed=true){
  const m=v.length,i=[],o=[]
  for(let k=0;k<m;k++){
    const a=v[closed?(k+m-1)%m:Math.max(0,k-1)],c=v[closed?(k+1)%m:Math.min(m-1,k+1)],t=[(c[0]-a[0])/6,(c[1]-a[1])/6]
    i.push([-t[0],-t[1]]);o.push(t)
  }
  return {c:closed,v,i,o}
}
// A band along an edge: the edge points, and the same moved by `by` (its far side, where a
// gradient across it fades out).
const band=(edge,[dx,dy])=>smooth([...edge,...[...edge].reverse().map(([x,y])=>[x+dx,y+dy])])
// One colour fading by opacity stops [position, alpha] from s to e.
const fade=(s,e,color,alphas)=>({ty:'gf',t:1,o:{a:0,k:100},r:1,bm:0,s:{a:0,k:s.map(r)},e:{a:0,k:e.map(r)},
  g:{p:2,k:{a:0,k:[0,...rgb(color),1,...rgb(color),...alphas.flat()]}}})
const centre=(p)=>{const xs=p.v.map((v)=>v[0]),ys=p.v.map((v)=>v[1]);return [(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2]}
const inside=([x,y],[x0,y0,x1,y1])=>x>=x0&&x<=x1&&y>=y0&&y<=y1

// The light on the crown: a crescent under the outline, from the left side over the top to the
// right, thickest a little left of the top; light blue above, fading out down the head.
function crown(silhouette,H){
  const p=silhouette,n=p.v.length,pts=[]
  for(let k=0;k<n;k++){const a=p.v[k],b=p.v[(k+1)%n],c1=[a[0]+p.o[k][0],a[1]+p.o[k][1]],c2=[b[0]+p.i[(k+1)%n][0],b[1]+p.i[(k+1)%n][1]]
    for(let s=0;s<12;s++){const t=s/12,u=1-t;pts.push([0,1].map((d)=>u*u*u*a[d]+3*u*u*t*c1[d]+3*u*t*t*c2[d]+t*t*t*b[d]))}}
  const [cx,cy]=H.centre,ang=([x,y])=>((Math.atan2(y-cy,x-cx)*180/Math.PI)+360)%360
  // the head's own arc only: near the middle, within the angles
  const arc=pts.filter((q)=>{const g=ang(q);return g>=H.from&&g<=H.to&&Math.hypot(q[0]-cx,q[1]-cy)<H.reach}).sort((a,b)=>ang(a)-ang(b))
  const step=Math.max(1,Math.floor(arc.length/H.points)),edge=arc.filter((_,k)=>k%step===0)
  const outer=[],inner=[]
  edge.forEach((q,k)=>{
    const g=(ang(q)-H.from)/(H.to-H.from),nx=cx-q[0],ny=cy-q[1],l=Math.hypot(nx,ny)
    const w=H.thick*Math.sin(Math.PI*g)**0.7*(1+H.lean*Math.cos(Math.PI*g))
    outer.push([q[0]+nx/l*H.inset,q[1]+ny/l*H.inset]);inner.push([q[0]+nx/l*(H.inset+w),q[1]+ny/l*(H.inset+w)])
  })
  return group('Свет макушки · градиент',[{ty:'sh',ks:{a:0,k:scaled(smooth([...outer,...inner.reverse()]))}},
    fade(H.light[0],H.light[1],H.color,H.alphas)])
}

export function recliningPerson(C){
  const P=C.paint,A=C.arms
  // the silhouette's outline and its one big hole (the smile); the rest are specks
  const silhouette=[...traced.silhouette].sort((a,b)=>box(b)-box(a)).slice(0,1)
  const smile=[...traced.smile].sort((a,b)=>box(b)-box(a)).slice(0,1)
  // the picture's own crown light and everything at the folded arms are redrawn below
  const keep=(list)=>list.filter((p)=>![C.crown.box,A.box].some((b)=>inside(centre(p),b)))
  const limb=(nm,points)=>group(nm,[{ty:'sh',ks:{a:0,k:scaled(smooth(points))}},stroke(P.outline*S,P.line),grad(P.along[0],P.along[1],P.body)])
  const soft=(nm,shape,f)=>group(nm,[{ty:'sh',ks:{a:0,k:scaled(shape)}},f])
  // The head lifts a little while the lid stands open (C.head): it is the silhouette cut across
  // the neck, its own outline open along the cut, turning about the neck; the body is the same
  // silhouette cut further up, so its neck goes on under the head.
  const H=C.head,cut=(path,line)=>{const g=group('',[{ty:'sh',ks:{a:0,k:scaled(path)}}]);clipAtInnerWall(g,[line.map((q)=>q.map((v)=>v*S))]);return g.it[0]}
  const sil=silhouette[0],n=sil.v.length
  // the outline as an open path starting far from the head (on the legs), so the cut leaves one arc
  const s0=sil.v.reduce((b,q,k)=>q[0]+q[1]>sil.v[b][0]+sil.v[b][1]?k:b,0),turn=(a)=>[...a.slice(s0),...a.slice(0,s0+1)]
  const open={c:false,v:turn(sil.v),i:turn(sil.i),o:turn(sil.o)}
  const [A0,B0]=H.neck,up=H.under
  const headFill=cut(sil,[A0,B0]),headLine=cut(open,[A0,B0])
  const bodyFill=cut(sil,[[B0[0]+up[0],B0[1]+up[1]],[A0[0]+up[0],A0[1]+up[1]]])
  // H.keys: [absolute frame, amount 0…1, hold]. At 1 the head has turned up about its chin (the
  // crown rises, so it swings right), moved back a little off the neck (the neck shows longer) and
  // turned towards the camera: the far ear grows, the near one shrinks, the mouth slides.
  const ease=(j)=>j<H.keys.length-1&&!H.keys[j][2]?{o:{x:[0.4],y:[0]},i:{x:[0.3],y:[1]}}:{}
  const key=(fn)=>({a:1,k:H.keys.map((k,j)=>({t:k[0],s:fn(k[1]),...(k[2]&&{h:1}),...ease(j)}))})
  const [ax,ay]=H.anchor.map(r)
  const lift={ty:'tr',a:{a:0,k:[ax,ay]},p:key((u)=>[ax+u*H.move[0]*S,ay+u*H.move[1]*S]),r:key((u)=>[u*H.turn]),
    s:{a:0,k:[100,100]},o:{a:0,k:100}}
  // the turn towards the camera as a warp of the head's points (512 px), by amount u
  const T=H.face
  const warp=([x,y],u,mouth)=>{
    let [dx,dy]=[0,0]
    for(const e of T.ears){const [cx,cy]=e.at.map((v)=>v*S),d2=((x-cx)**2+(y-cy)**2)/(e.r*S)**2,f=Math.exp(-d2/2)*u
      dx+=e.by[0]*S*f;dy+=e.by[1]*S*f}
    if(mouth){dx+=T.mouth[0]*S*u;dy+=T.mouth[1]*S*u}
    return [x+dx,y+dy]
  }
  const warped=(k,u,mouth)=>{const v=k.v.map((q)=>warp(q,u,mouth))
    const h=(key)=>k[key].map((d,j)=>{const q=warp([k.v[j][0]+d[0],k.v[j][1]+d[1]],u,mouth);return [q[0]-v[j][0],q[1]-v[j][1]]})
    return {c:k.c,v,i:h('i'),o:h('o')}}
  const turning=(g,mouth=false)=>{for(const x of g.ty==='gr'?g.it:[g]){
    if(x.ty==='gr')turning(x,mouth)
    else if(x.ty==='sh'){const k=x.ks.k;x.ks={a:1,k:H.keys.map((kk,j)=>({t:kk[0],s:[warped(k,kk[1],mouth)],...(kk[2]&&{h:1}),...ease(j)}))}}}
    return g}
  // the head's own move (as its group transform does it), and the neck following it: fully at the
  // jaw, less and less down to H.blend below the cut, so the outline stays joined
  const th=H.turn*Math.PI/180,[nx0,ny0]=A0.map((v)=>v*S),[nx1,ny1]=B0.map((v)=>v*S),nl=Math.hypot(nx1-nx0,ny1-ny0)
  const moved=([x,y],u)=>{const c=Math.cos(th*u),sn=Math.sin(th*u),dx=x-ax,dy=y-ay
    return [ax+dx*c-dy*sn+u*H.move[0]*S,ay+dx*sn+dy*c+u*H.move[1]*S]}
  const skin=(q,u)=>{const below=((nx1-nx0)*(q[1]-ny0)-(ny1-ny0)*(q[0]-nx0))/nl,b=Math.min(1,Math.max(0,below/(H.blend*S)))
    const w=1-b*b*(3-2*b),m=moved(q,u);return [q[0]+(m[0]-q[0])*w,q[1]+(m[1]-q[1])*w]}
  const skinned=(k,u)=>{const v=k.v.map((q)=>skin(q,u)),h=(key)=>k[key].map((d,j)=>{const q=skin([k.v[j][0]+d[0],k.v[j][1]+d[1]],u);return [q[0]-v[j][0],q[1]-v[j][1]]})
    return {c:k.c,v,i:h('i'),o:h('o')}}
  // clipped at the walls first: keyed shapes are not clipped later
  clipAtInnerWall(bodyFill.ks?{it:[bodyFill]}:bodyFill,C.walls)
  const bodyKeyed={ty:'sh',ks:{a:1,k:H.keys.map((kk,j)=>({t:kk[0],s:[skinned(bodyFill.ks.k,kk[1])],...(kk[2]&&{h:1}),...ease(j)}))}}
  const headGroup={ty:'gr',nm:'Голова · приподнимается',it:[
    turning(group('Улыбка',[...shapes(smile),fill('#ffffff')]),true),
    turning(crown(sil,C.crown)),
    turning(group('Контур головы',[headLine,stroke(P.outline*S,P.line)])),
    turning(group('Голова',[headFill,grad(P.along[0],P.along[1],P.body)])),lift]}
  // the shadow the lifted head throws on the neck: a layer of the legs' shade colour growing down
  // from under the jaw
  const N=H.shadow,grown=(u)=>skinned(scaled(smooth([...N.top,...N.top.map((q,j)=>{const o=N.open[j];return [q[0]+(o[0]-q[0])*u,q[1]+(o[1]-q[1])*u]}).reverse()])),u)
  const neck={ty:'gr',nm:'Тень на шее',it:[{ty:'sh',ks:{a:1,k:H.keys.map((k,j)=>({t:k[0],s:[grown(k[1])],...(k[2]&&{h:1}),...ease(j)}))}},
    fill(P.shade,N.opacity),tr()]}
  const body=group('Синий в гробу',[
    headGroup,
    neck,
    group('Светлые края',[...shapes(keep(traced.rims)),fill(P.rim)]),
    group('Светлые края · дорисованные',[...shapes([...C.strokes.rim,...A.rims].map((s)=>taper(s.points,s.width))),fill(P.rim)]),
    // the folded arms: clean outlined shapes, the near forearm and hand over the far hand, with
    // soft shadows on the chest above and below them instead of the picture's broken lines
    limb('Ближнее предплечье и кисть',A.near),
    limb('Дальняя кисть',A.far),
    ...A.shadows.map((x)=>soft(x.name,x.band?band(x.band,x.by):taper(x.points,x.width),fade(x.s,x.e,P.line,x.alphas))),
    group('Линии · дорисованные',[...shapes(C.strokes.line.map((s)=>taper(s.points,s.width))),fill(P.line)]),
    group('Внутренние линии',[...shapes(keep(traced.lines)),fill(P.line,100,2)]),
    group('Тени объёма',[...shapes(keep(traced.shades)),fill(P.shade,P.shade_opacity)]),
    group('Тело',[bodyKeyed,stroke(P.outline*S,P.line),grad(P.along[0],P.along[1],P.body)]),
  ])
  // whatever else lies where the neck follows the head (the near shoulder's light, a line, a
  // shade) follows it the same way: clipped at the walls first, then keyed
  for(const g of body.it.filter((x)=>x.ty==='gr'&&x!==headGroup&&x!==neck)){
    clipAtInnerWall(g,C.walls)
    for(const x of walk(g.it))if(x.ty==='sh'&&!x.ks.a&&!x.hd&&x.ks.k.v.some((q)=>{const m=skin(q,1);return Math.hypot(m[0]-q[0],m[1]-q[1])>0.05})){
      const k=x.ks.k;x.ks={a:1,k:H.keys.map((kk,j)=>({t:kk[0],s:[skinned(k,kk[1])],...(kk[2]&&{h:1}),...ease(j)}))}}
  }
  // contact shadow on the lining: the silhouette itself, twice, moved away from the light
  const shadow=group('Контактная тень',C.shadow.layers.map(([dx,dy,o])=>group('',[
    {ty:'sh',ks:{a:0,k:scaled({...sil,v:sil.v.map(([x,y])=>[x+dx,y+dy])})}},fill(C.shadow.color,o)])))
  return {figure:body,shadow}
}

// Clip cubic outlines to the inner walls that face away (near side, foot end): each wall a line
// A→B with the inside on its left, retaining Bezier handles. The original
// coffin rig moves this plane and the figure together. No masks or extra painted rims.
export function clipAtInnerWall(root,walls){for(const [A,B] of walls)clipAt(root,A,B)}
function clipAt(root,A,B){
 const dx=B[0]-A[0],dy=B[1]-A[1],L=Math.hypot(dx,dy)
 const distance=p=>(dx*(p[1]-A[1])-dy*(p[0]-A[0]))/L+.65
 const mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t)
 const split=(p,t)=>{const a=mix(p[0],p[1],t),b=mix(p[1],p[2],t),c=mix(p[2],p[3],t),d=mix(a,b,t),e=mix(b,c,t),f=mix(d,e,t);return [[p[0],a,d,f],[f,e,c,p[3]]]}
 const pos=(p,t)=>split(p,t)[0][3]
 const sub=(p,a,b)=>{const tail=a?split(p,a)[1]:p;return b<1?split(tail,(b-a)/(1-a))[0]:tail}
 function go(g){
  // keyed shapes (the head, the neck's shadow) lie well inside the walls
  if(g.ty==='sh'&&!g.ks.a){
   const p=g.ks.k,n=p.v.length,segments=[]
   for(let k=0;k<(p.c?n:n-1);k++){
    const j=(k+1)%n,q=[p.v[k],p.v[k].map((v,d)=>v+p.o[k][d]),p.v[j].map((v,d)=>v+p.i[j][d]),p.v[j]],cuts=[0]
    for(let m=0;m<48;m++){
     let a=m/48,b=(m+1)/48,da=distance(pos(q,a)),db=distance(pos(q,b))
     if((da<0)!==(db<0)){for(let it=0;it<40;it++){const t=(a+b)/2;if((distance(pos(q,t))<0)===(da<0))a=t;else b=t}cuts.push((a+b)/2)}
    }
    cuts.push(1)
    for(let m=0;m<cuts.length-1;m++){const a=cuts[m],b=cuts[m+1];if(distance(pos(q,(a+b)/2))<=0)segments.push(sub(q,a,b))}
   }
   if(!segments.length){g.hd=true;return}
   const v=[],i=[],o=[]
   for(const q of segments){
    if(!v.length||Math.hypot(...q[0].map((x,d)=>x-v.at(-1)[d]))>1e-5){v.push(q[0]);i.push([0,0]);o.push([0,0])}
    o[o.length-1]=q[1].map((x,d)=>x-q[0][d]);v.push(q[3]);i.push(q[2].map((x,d)=>x-q[3][d]));o.push([0,0])
   }
   if(p.c&&Math.hypot(...v.at(-1).map((x,d)=>x-v[0][d]))<1e-5){i[0]=i.pop();v.pop();o.pop()}
   g.ks.k={c:p.c,v,i,o}
  }
  if(g.it)g.it.forEach(go)
 }
 go(root)
}
