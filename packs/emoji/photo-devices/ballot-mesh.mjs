// A Coons patch follows all four cubic paper edges, including their tangents.
export function ballotMesh(prop,frame,easeAt){
 const keys=prop.k
 let path=keys[0].s[0]
 if(frame>=keys.at(-1).t)path=keys.at(-1).s[0]
 else if(frame>keys[0].t){
  const n=keys.findIndex((k,i)=>i<keys.length-1&&frame>=k.t&&frame<keys[i+1].t),a=keys[n],b=keys[n+1],pick=v=>Array.isArray(v)?v[0]:v
  const u=(frame-a.t)/(b.t-a.t),e=a.h?0:easeAt({x1:pick(a.o.x),y1:pick(a.o.y),x2:pick(a.i.x),y2:pick(a.i.y)},u)
  path=Object.fromEntries(['v','i','o'].map(k=>[k,a.s[0][k].map((p,i)=>p.map((v,d)=>v+(b.s[0][k][i][d]-v)*e))]))
 }
 function edge(a,b,t){
  const forward=b===(a+1)%4,p=path.v[a],q=path.v[b],c1=p.map((v,d)=>v+(forward?path.o[a][d]:path.i[a][d])),c2=q.map((v,d)=>v+(forward?path.i[b][d]:path.o[b][d]))
  return [0,1].map(d=>(1-t)**3*p[d]+3*(1-t)**2*t*c1[d]+3*(1-t)*t*t*c2[d]+t**3*q[d])
 }
 const nx=16,ny=12,tl=path.v[2],tr=path.v[1],br=path.v[0],bl=path.v[3]
 return Array.from({length:ny+1},(_,y)=>Array.from({length:nx+1},(_,x)=>{
  const u=x/nx,v=y/ny,top=edge(2,1,u),bottom=edge(3,0,u),left=edge(2,3,v),right=edge(1,0,v)
  return [0,1].map(d=>256+top[d]*(1-v)+bottom[d]*v+left[d]*(1-u)+right[d]*u-
    (tl[d]*(1-u)*(1-v)+tr[d]*u*(1-v)+bl[d]*(1-u)*v+br[d]*u*v))
 }))
}
