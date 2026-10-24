// The rubber stamp, grey, drawn from scratch (no emoji had one) as a small 3D model that is projected
// into paths frame by frame, so it can fly in and turn at any angle (like the boxes of 622/623).
// The model, along its axis z (z = 0: the rubber's face, +z: towards the knob):
//   pad    a rounded slab of dark rubber,
//   block  a rounded block, its back edge bevelled,
//   foot   the handle's flared foot, neck the slim neck, knob the ball on top.
// Every extruded part is drawn as its silhouette (the hull of its two end outlines, built with a fixed
// number of points so the keys interpolate) plus its near cap; the light comes from the top left,
// the paint of every surface follows its normal (Lambert + a sharp specular), so gradients and
// highlights move with the turn. Office grey, thin dark edges, glossy rims, as in 646 / 636 / 559.
//
// stampFrame(S, pose) → the paths and paints of one pose; stampLayers(S, poses) → layers with those
// baked into keys. pose: {t, x, y, scale, yaw, pitch, roll, squash} (degrees; squash 1 = none).

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

export function stampFrame(S,pose){
  const cam=camera(pose,S),shade=shader(S),M=S.model,P=S.palette
  const grey=hexrgb(P.grey),rubber=hexrgb(P.rubber),white=[1,1,1],out={}
  const scaleAt=(z)=>{const w=cam.world([0,0,z]);return pose.scale*S.focal/(S.focal-w[2]*pose.scale)}
  const centerAt=(z)=>cam.project([0,0,z])

  // pad: the rubber, its face at z 0
  const [pw,pd,pr,pt]=M.pad
  out.pad={path:hull(roundRect(pw,pd,pr,0),roundRect(pw,pd,pr,pt),cam),...across(shade,cam.axis,centerAt(pt/2),pw/2*scaleAt(pt/2),rubber)}
  // block: straight sides, then the bevel up to its back face
  const [bw,bd,br,bt,bevel]=M.block,z0=pt,z1=pt+bt,z2=z1+bevel
  out.block={path:hull(roundRect(bw,bd,br,z0),roundRect(bw,bd,br,z1),cam),...across(shade,cam.axis,centerAt((z0+z1)/2),bw/2*scaleAt(z1),grey)}
  const back=roundRect(bw-bevel*2,bd-bevel*2,br-bevel,z2)
  out.bevel={path:hull(roundRect(bw,bd,br,z1),back,cam),...across(shade,cam.axis,centerAt(z1),bw/2*scaleAt(z1),mix(grey,white,0.2),1)}
  // the back face: a soft sweep from its lit corner around the paint its normal gets
  const faceC=shade(cam.axis,grey),[fx,fy]=centerAt(z2),fs=(bw/2-bevel)*scaleAt(z2)
  out.face={path:flat(back,cam),s:[round(fx-fs*0.8),round(fy-fs*0.7)],e:[round(fx+fs*0.8),round(fy+fs*0.7)],
    g:[0,...mix(faceC,white,0.45),0.5,...faceC,1,...mix(faceC,hexrgb(P.shade),0.3)]}
  out.faceRim={path:flat(roundRect(bw-bevel*2-S.rim*2,bd-bevel*2-S.rim*2,br-bevel-S.rim,z2),cam)}
  // the handle
  const [f0,f1,fh]=M.foot,[n0,n1,nh]=M.neck,[kr,kz]=M.knob
  const zf=z2,zn=zf+fh,zk=zn+nh+kz
  out.footShadow={path:flat(circle(f0+M.shadow,zf),cam)}
  const turned=mix(grey,white,S.handle_lift) // the turned handle a shade lighter than the block
  out.foot={path:hull(circle(f0,zf),circle(f1,zn),cam),...across(shade,cam.axis,centerAt((zf+zn)/2),f0*scaleAt(zf),turned,(f0-f1)/fh)}
  out.neck={path:hull(circle(n0,zn),circle(n1,zn+nh),cam),...across(shade,cam.axis,centerAt(zn+nh/2),n0*scaleAt(zn),turned)}
  // the ball: one radial gradient from its lit point — the highlight is the gradient's white heart,
  // the far rim gets a touch of light bounced back
  const [kx,ky]=centerAt(zk),k=kr*scaleAt(zk),L=norm(S.light),shadeC=hexrgb(P.shade)
  const disc=circle(k,0,8).map((p)=>({...p,v:[kx+p.v[0],ky+p.v[1],0]}))
  const hot=[kx+L[0]*k*S.knob_light,ky+L[1]*k*S.knob_light]
  out.knob={path:flat(disc,{project:(v)=>v}),type:2,s:hot.map(round),
    e:[round(hot[0]-L[0]*k*1.5),round(hot[1]-L[1]*k*1.5)],
    g:[0,...mix(grey,white,0.95),0.12,...mix(grey,white,0.7),0.38,...mix(grey,white,0.2),0.7,...mix(grey,shadeC,0.35),
      0.9,...mix(grey,shadeC,0.6),1,...mix(grey,shadeC,0.35)]}
  return out
}

// ---------- layers ----------
const rgba=(h)=>[...hexrgb(h),1]
const tr=()=>({ty:'tr',p:{a:0,k:[0,0]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}})
const ease=(n,len,o)=>n<len-1?o:{}
const strip=({c,v,i,o})=>({c,v,i,o})
const pathKeys=(frames,part)=>frames.length===1?{a:0,k:strip(frames[0][part].path)}:
  {a:1,k:frames.map((f,n)=>({t:f.t,s:[strip(f[part].path)],...ease(n,frames.length,{o:{x:0,y:0},i:{x:1,y:1}})}))}
const valueKeys=(frames,part,key)=>frames.length===1?{a:0,k:frames[0][part][key]}:
  {a:1,k:frames.map((f,n)=>({t:f.t,s:f[part][key].map((x)=>Math.round(x*1000)/1000),...ease(n,frames.length,{o:{x:[0],y:[0]},i:{x:[1],y:[1]}})}))}
const gfill=(frames,part)=>({ty:'gf',o:{a:0,k:100},r:1,t:frames[0][part].type??1,bm:0,
  ...(frames[0][part].type===2&&{h:{a:0,k:0},a:{a:0,k:0}}),s:valueKeys(frames,part,'s'),e:valueKeys(frames,part,'e'),
  g:{p:frames[0][part].g.length/4,k:valueKeys(frames,part,'g')}})
const solid=(h,o=100)=>({ty:'fl',c:{a:0,k:rgba(h)},o:{a:0,k:o},r:1})
const line=(h,w,o=100)=>({ty:'st',c:{a:0,k:rgba(h)},o:{a:0,k:o},w:{a:0,k:w},lc:2,lj:2})

// poses: [{t, ...pose}] → the stamp's layers, topmost first, every part keyed at those frames
export function stampLayers(S,poses,{ind=1,ip=0,op=180,parent}={}){
  const frames=poses.map((p)=>({t:p.t,...stampFrame(S,p)}))
  const group=(nm,it)=>({ty:'gr',nm,it:[...it,tr()]})
  const shape=(part)=>({ty:'sh',ks:pathKeys(frames,part)})
  const edge=()=>line(S.palette.edge,S.edge)
  const layer=(nm,shapes,n)=>({ty:4,nm,ind:ind+n,...(parent!=null&&{parent}),ip,op,st:0,sr:1,ao:0,
    ks:{o:{a:0,k:100},r:{a:0,k:0},p:{a:0,k:[0,0,0]},a:{a:0,k:[0,0,0]},s:{a:0,k:[100,100,100]}},shapes})
  return [
    layer('Knob',[
      group('Ball',[shape('knob'),edge(),gfill(frames,'knob')]),
    ],0),
    layer('Neck',[group('Neck',[shape('neck'),edge(),gfill(frames,'neck')])],1),
    layer('Foot',[group('Foot',[shape('foot'),edge(),gfill(frames,'foot')])],2),
    layer('Face',[
      group('Shadow',[shape('footShadow'),solid(S.palette.shade,S.shadow_opacity)]),
      group('Rim',[shape('faceRim'),line('#ffffff',S.edge*0.9,50)]),
      group('Face',[shape('face'),gfill(frames,'face')]),
    ],3),
    layer('Bevel',[group('Bevel',[shape('bevel'),edge(),gfill(frames,'bevel')])],4),
    layer('Block',[group('Block',[shape('block'),edge(),gfill(frames,'block')])],5),
    layer('Pad',[group('Pad',[shape('pad'),edge(),gfill(frames,'pad')])],6),
  ]
}
