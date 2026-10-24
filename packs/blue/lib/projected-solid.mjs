// Projection, fixed-topology hull and lighting reused verbatim from zombie-stamp/stamp.mjs.
// See docs/3d-objects.md. Kept separate from stamp animation and material configuration.
const rad=(d)=>d*Math.PI/180
const add=(a,b)=>a.map((v,i)=>v+b[i])
const sub=(a,b)=>a.map((v,i)=>v-b[i])
const mulv=(a,k)=>a.map((v)=>v*k)
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0)
const norm=(a)=>mulv(a,1/Math.hypot(...a))
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
const mix=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u)
const hexrgb=(h)=>[1,3,5].map((i)=>parseInt(h.slice(i,i+2),16)/255)
const round=(n)=>Math.round(n*10)/10

// ---------- the camera ----------
// world: x right, y down, z towards the viewer. The model turns (yaw about y, pitch about x, roll
// about z) about a point of its axis, is squashed along the axis, scaled, put at (x, y), with a
// mild perspective (nearer is bigger).
function camera(pose,S){
  const [cy,sy,cp,sp,cr,sr]=[pose.yaw,pose.pitch,pose.roll].flatMap((a)=>[Math.cos(rad(a)),Math.sin(rad(a))])
  const Ry=[[cy,0,sy],[0,1,0],[-sy,0,cy]],Rx=[[1,0,0],[0,cp,-sp],[0,sp,cp]],Rz=[[cr,-sr,0],[sr,cr,0],[0,0,1]]
  const mm=(A,B)=>A.map((r)=>B[0].map((_,j)=>r.reduce((s,v,k)=>s+v*B[k][j],0)))
  const R=mm(Rz,mm(Rx,Ry))
  const rot=(v)=>R.map((r)=>dot(r,v))
  const squash=pose.squash??1
  const world=(p)=>rot([p[0],p[1],(p[2]-S.pivot)*squash])
  const project=(p)=>{
    const w=world(p),k=S.focal/(S.focal-w[2]*pose.scale)
    return [pose.x+w[0]*pose.scale*k,pose.y+w[1]*pose.scale*k,w[2]]
  }
  return {rot,project,world,axis:rot([0,0,1])}
}

// ---------- outlines in the model's planes (constant point counts) ----------
// A rounded rectangle at height z, each corner in SPLIT arcs (so the silhouette can switch
// between its two outlines close to where it really does); handles as 3D vectors.
const SPLIT=3
function roundRect(w,d,r,z){
  const pts=[],step=90/SPLIT,h=4/3*Math.tan(rad(step)/4)*r
  const corners=[[-w/2+r,-d/2+r,180],[w/2-r,-d/2+r,270],[w/2-r,d/2-r,0],[-w/2+r,d/2-r,90]]
  for(const [cx,cy,a0] of corners)for(let s=0;s<=SPLIT;s++){
    const a=rad(a0+step*s),t=[-Math.sin(a),Math.cos(a),0]
    pts.push({v:[cx+r*Math.cos(a),cy+r*Math.sin(a),z],i:s===0?[0,0,0]:mulv(t,-h),o:s===SPLIT?[0,0,0]:mulv(t,h),t})
  }
  return pts
}
function circle(r,z,n=12){
  const h=4/3*Math.tan(rad(360/n)/4)*r
  return Array.from({length:n},(_,s)=>{
    const a=rad(360/n*s),t=[-Math.sin(a),Math.cos(a),0]
    return {v:[r*Math.cos(a),r*Math.sin(a),z],i:mulv(t,-h),o:mulv(t,h),t}
  })
}
const flat=(pts,cam)=>{
  const v=pts.map((p)=>cam.project(p.v))
  const handle=(key)=>pts.map((p,n)=>{const q=cam.project(add(p.v,p[key]));return [round(q[0]-v[n][0]),round(q[1]-v[n][1])]})
  return {c:true,v:v.map((p)=>[round(p[0]),round(p[1])]),i:handle('i'),o:handle('o')}
}
// The silhouette of the solid between two outlines with matching points: at each point the one
// that lies outward (along the 2D outline's normal); where the choice changes, a straight tangent.
function hull(a,b,cam){
  const A=flat(a,cam),B=flat(b,cam),n=a.length
  const area=A.v.reduce((s,p,k)=>{const q=A.v[(k+1)%n];return s+p[0]*q[1]-q[0]*p[1]},0)
  // the outline's own tangent at each point, projected
  const pick=a.map((pt,k)=>{
    const q=cam.project(add(pt.v,pt.t)),p=A.v[k],t=[q[0]-p[0],q[1]-p[1]]
    const out=area>0?[t[1],-t[0]]:[-t[1],t[0]] // outward (y down)
    return dot(out,sub(B.v[k],p))
  }).map((f,k,all)=>f>0)
  // one run of the far outline only: the longest (round the loop) — lone flips are noise
  let best=[0,0]
  for(let k=0;k<n;k++){
    if(!pick[k]||pick[(k+n-1)%n])continue
    let len=0;while(len<n&&pick[(k+len)%n])len++
    if(len>best[1])best=[k,len]
  }
  if(pick.every(Boolean))best=[0,n]
  for(let k=0;k<n;k++)pick[k]=((k-best[0]+n)%n)<best[1]
  const shape={c:true,v:[],i:[],o:[]}
  for(let k=0;k<n;k++){
    const P=pick[k]?B:A
    shape.v.push(P.v[k])
    shape.i.push(pick[(k+n-1)%n]!==pick[k]?[0,0]:P.i[k])
    shape.o.push(pick[(k+1)%n]!==pick[k]?[0,0]:P.o[k])
  }
  return shape
}

// ---------- light ----------
function shader(S){
  const L=norm(S.light),H=norm(add(L,[0,0,1]))
  const dark=hexrgb(S.palette.shade)
  return (n,material)=>{
    const diffuse=Math.max(0,dot(n,L)),spec=Math.max(0,dot(n,H))**S.shine
    const lit=mix(dark,material,Math.min(1,S.ambient+diffuse*S.diffuse))
    return mix(lit,[1,1,1],Math.min(1,spec*S.specular))
  }
}
// A linear gradient across a round surface, from the silhouette's one edge to the other across the
// axis: the stops take the paint of the normals they look at (a cone's lean towards its axis: lean).
function across(shade,axis,center,halfWidth,material,lean=0,stops=[0,0.15,0.35,0.6,0.85,1]){
  const a=norm(axis),flatLen=Math.hypot(a[0],a[1])
  const side=flatLen<1e-3?[1,0,0]:[-a[1]/flatLen,a[0]/flatLen,0]
  let toward=norm(cross(side,a));if(toward[2]<0)toward=mulv(toward,-1)
  const g=stops.flatMap((u)=>{
    const s=u*2-1,n=norm(add(add(mulv(side,s),mulv(toward,Math.sqrt(Math.max(0,1-s*s)))),mulv(a,lean)))
    return [u,...shade(n,material)]
  })
  return {s:[round(center[0]-side[0]*halfWidth),round(center[1]-side[1]*halfWidth)],
    e:[round(center[0]+side[0]*halfWidth),round(center[1]+side[1]*halfWidth)],g}
}


export {camera,flat,hull,shader,across,circle,roundRect,norm,mix}
