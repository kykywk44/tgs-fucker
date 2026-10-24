// Exact cubic clipping below a horizontal rim, without raster masks.
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t)
function split(s,t){const[a,b,c,d]=s,ab=lerp(a,b,t),bc=lerp(b,c,t),cd=lerp(c,d,t),abc=lerp(ab,bc,t),bcd=lerp(bc,cd,t),p=lerp(abc,bcd,t);return [[a,ab,abc,p],[p,bcd,cd,d]]}
function sub(s,a,b){let p=s;if(b<1)p=split(p,b)[0];if(a>0)p=split(p,a/b)[1];return p}
const value=(s,t)=>s[0][1]*(1-t)**3+3*s[1][1]*(1-t)**2*t+3*s[2][1]*(1-t)*t*t+s[3][1]*t**3
export function clipHead(path,bottom){
 const pieces=[]
 for(let i=0;i<path.v.length;i++){
  const j=(i+1)%path.v.length
  if(!path.c&&j===0)break
  const a=path.v[i],d=path.v[j],s=[a,a.map((v,k)=>v+path.o[i][k]),d.map((v,k)=>v+path.i[j][k]),d],roots=[0]
  for(let n=0;n<32;n++){
   let lo=n/32,hi=(n+1)/32,yl=value(s,lo)-bottom,yh=value(s,hi)-bottom
   if(yl*yh<0){for(let k=0;k<32;k++){const mid=(lo+hi)/2;if((value(s,mid)-bottom)*yl>0)lo=mid;else hi=mid}roots.push((lo+hi)/2)}
  }
  roots.push(1)
  for(let n=0;n<roots.length-1;n++)if(value(s,(roots[n]+roots[n+1])/2)<=bottom+1e-7)pieces.push(sub(s,roots[n],roots[n+1]))
 }
 const result={c:path.c,v:[],i:[],o:[]}
 for(const [a,b,c,d] of pieces){
  const last=result.v.at(-1)
  if(!last||Math.hypot(last[0]-a[0],last[1]-a[1])>1e-6){result.v.push(a);result.i.push([0,0]);result.o.push([0,0])}
  result.o[result.o.length-1]=b.map((v,i)=>v-a[i]);result.v.push(d);result.i.push(c.map((v,i)=>v-d[i]));result.o.push([0,0])
 }
 if(result.v.length>1&&Math.hypot(result.v[0][0]-result.v.at(-1)[0],result.v[0][1]-result.v.at(-1)[1])<1e-6){result.v.pop();result.o.pop();result.i[0]=result.i.pop()}
 return result
}
