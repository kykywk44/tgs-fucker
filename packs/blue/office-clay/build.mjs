// Clay tablet motion, reused for a stack of office gadgets. All donors stay vector.
import assert from 'node:assert/strict'
import{readFile,writeFile}from'node:fs/promises'
import{read,world,transform,mul,point,I,tr,group,rgb,baked,finish}from'../lib/silhouette.mjs'
import{freeze}from'../lib/freeze.mjs'
import{getShape}from'../clipboard/scene.mjs'
import{load}from'../../../scripts/lib/sheets.mjs'
const{fitHomography,applyHomography}=await load('src/core/homography.ts')
const source=await read('packs/blue/office-clay/source.tgs'),anim=structuredClone(source)
anim.nm='Синий · Офисные гаджеты'
const unit=[[0,0],[1000,0],[1000,1000],[0,1000]]
const round=v=>Array.isArray(v)?v.map(round):Math.round(v*1000)/1000
const plus=(a,b)=>a.map((v,i)=>v+b[i]),minus=(a,b)=>a.map((v,i)=>v-b[i])
function warp(p,fn){return{c:p.c,v:p.v.map(v=>round(fn(v))),i:p.i.map((h,i)=>round(minus(fn(plus(p.v[i],h)),fn(p.v[i])))),o:p.o.map((h,i)=>round(minus(fn(plus(p.v[i],h)),fn(p.v[i]))))}}
// Flatten one frozen donor pose, including inherited group transforms, paints,
// gradients and opacity. Its geometry is rectified once, rather than per frame.
function flattened(a,pose,projection,filter=()=>true){
 const b=freeze(structuredClone(a),pose),out=[]
 // Lottie parenting inherits the matrix, not the parent's opacity (donor nulls
 // deliberately have opacity0 while their children remain visible).
 const opacity=l=>(l.ks?.o?.k??100)/100
 function go(items,m){const result=[]
  for(const p of items){const d=structuredClone(p)
   if(p.ty==='gr'){d.it=go(p.it,mul(m,transform(p.it.find(q=>q.ty==='tr'),0)))}
   else if(p.ty==='tr'){Object.assign(d,tr(),{o:p.o??{a:0,k:100}})}
   else if(p.ty==='sh')d.ks={a:0,k:warp(p.ks.k,v=>projection(point(m,v)))}
   else if(p.ty==='gf'||p.ty==='gs')for(const k of ['s','e'])d[k]={a:0,k:round(projection(point(m,p[k].k)))}
   if(['st','gs'].includes(p.ty)){
    const o=projection(point(m,[0,0])),x=minus(projection(point(m,[1,0])),o),y=minus(projection(point(m,[0,1])),o)
    d.w={a:0,k:round(p.w.k*Math.sqrt(Math.abs(x[0]*y[1]-x[1]*y[0])))}
   }
   result.push(d)
  }return result
 }
 for(const l of b.layers){if(l.ty!==4||l.ip>pose||l.op<=pose||!filter(l)||opacity(l)<.001)continue
  const it=go(l.shapes,world(b.layers,l,0));it.push({...tr(),o:{a:0,k:opacity(l)*100}})
  out.push({ty:'gr',nm:l.nm,it})
 }return out
}
const laptop=await read('packs/blue/office-clay/laptop.tgs'),keyboard=await read('packs/blue/office-clay/keyboard.tgs'),phone=await read('packs/blue/office-clay/phone.tgs'),pen=await read('packs/blue/office-clay/pen.tgs')
// Remove the complete original circle/plane compound logo. The replacement uses
// the very same Roboto Black n outline as the approved technologist laptop.
laptop.layers.find(l=>l.nm==='Cover').shapes=laptop.layers.find(l=>l.nm==='Cover').shapes.filter(g=>g.nm!=='Group 3')
const project=(quad,placement,turn90=false)=>{const h=fitHomography(quad,unit);return v=>{const p=applyHomography(h,v),q=[p[0]*placement[2]+placement[0]*1000,p[1]*placement[3]+placement[1]*1000];if(!turn90)return q;const c=[(placement[0]+placement[2]/2)*1000,(placement[1]+placement[3]/2)*1000];return[c[0]-(q[1]-c[1]),c[1]+(q[0]-c[0])]}}
const lp=project([[88,260],[425,260],[472,442],[37,442]],[-.04,.13,1.08,.8],true)
const kp=project([[69,182],[445,182],[470,337],[40,337]],[0,.35,1,.43],true)
const phonePlacement=[.33,.2,.34,.62]
const pp=project([[148,41],[365,41],[365,474],[148,474]],phonePlacement)
const pb=project([[196,49],[320,46],[330,465],[206,468]],phonePlacement)
const lfront=flattened(laptop,25,lp,l=>l.nm!=='Keyboard')
const logo=JSON.parse(await readFile('packs/blue/technologist-bust/logo.json','utf8')).shape
const ys=logo.v.map(v=>v[1]),yc=(Math.min(...ys)+Math.max(...ys))/2,h=Math.max(...ys)-Math.min(...ys)
const n=warp(logo,v=>lp([256.9+v[0]/h*2*44.5*.62,349.9+(v[1]-yc)/h*2*28.34*.62]))
const circle={c:true,v:[[256.9,321.56],[301.4,349.9],[256.9,378.24],[212.4,349.9]],i:[[-24.577,0],[0,-15.651],[24.577,0],[0,15.651]],o:[[24.577,0],[0,15.651],[-24.577,0],[0,-15.651]]}
const fill=c=>({ty:'fl',c:{a:0,k:[...rgb(c),1]},o:{a:0,k:100},r:1})
lfront.unshift(group('N · логотип',[{ty:'sh',ks:{a:0,k:n}},fill('#c9c8ce')]),group('Диск логотипа',[{ty:'sh',ks:{a:0,k:warp(circle,lp)}},fill('#8f8c96')]))
// Omit the keyboard's dense animated shadow/matte pair to fit TGS. The original
// keys/case and their own small bevel shadows stay intact.
const kfront=flattened(keyboard,0,kp,l=>!['shades','mask','shade'].includes(l.nm)),pfront=flattened(phone,0,pp,l=>!l.td)
const frozenPhone=freeze(structuredClone(phone),0),screen=frozenPhone.layers.find(l=>l.ty===0)
const screenMatrix=world(frozenPhone.layers,screen,0),screenAsset=phone.assets.find(a=>a.id===screen.refId)
const screenIcons=flattened({...phone,layers:screenAsset.layers},0,v=>pp(point(screenMatrix,v)),l=>!l.td)
pfront.splice(pfront.findIndex(g=>g.nm==='Front'),0,...screenIcons)
const pback=flattened(phone,37,pb,l=>!l.td)
// Each plate's existing front contour supplies the changing plane axes.
function contour(layer,index,f){let found=0,result
 function go(items,m){for(const p of items){if(p.ty==='gr')go(p.it,mul(m,transform(p.it.find(q=>q.ty==='tr'),f)));else if(p.ty==='sh'){if(found++===index)result=getShape(p.ks,f).v.map(v=>point(m,v))}}}
 go(layer.shapes,I);assert.ok(result);return result
}
// SVD as nested rotations/scales reproduces the plane affine map with ordinary
// Lottie group transforms. Detailed keys/screens stay static and compact.
function carried(id,geometry,pathIndex,corners){const original=source.layers.find(l=>l.ind===id),table=[];let lastPhi=0,lastTheta=0
 for(let f=0;f<180;f++){
  const v=contour(original,pathIndex,f),[a,b,c]=corners.map(i=>v[i]),u=minus(b,a).map(x=>x/1000),w=minus(c,a).map(x=>x/1000)
  let phi=.5*Math.atan2(2*(u[0]*w[0]+u[1]*w[1]),u[0]**2+u[1]**2-w[0]**2-w[1]**2)
  while(phi-lastPhi>Math.PI/2)phi-=Math.PI;while(phi-lastPhi< -Math.PI/2)phi+=Math.PI
  const x=[u[0]*Math.cos(phi)+w[0]*Math.sin(phi),u[1]*Math.cos(phi)+w[1]*Math.sin(phi)],sx=Math.hypot(...x),sy=(u[0]*w[1]-u[1]*w[0])/sx
  let theta=Math.atan2(x[1],x[0]);while(theta-lastTheta>Math.PI)theta-=Math.PI*2;while(theta-lastTheta< -Math.PI)theta+=Math.PI*2
  lastPhi=phi;lastTheta=theta;table.push({p:round(a),s:round([sx*100,sy*100]),r:round(theta*180/Math.PI),inner:round(-phi*180/Math.PI)})
 }
 const inner=group('Ориентация плоскости',geometry);inner.it.at(-1).r=baked(f=>[table[f].inner],180,false,2)
 const outer=group('Переворот гаджета',[inner]),t=outer.it.at(-1)
 t.p=baked(f=>table[f].p,180,false,2);t.s=baked(f=>table[f].s,180,false,2);t.r=baked(f=>[table[f].r],180,false,2)
 const l=structuredClone(original);l.nm={2:'Телефон · экран',16:'Телефон · оборот',7:'Клавиатура',10:'Ноутбук · N'}[id];l.shapes=[outer];return l
}
const layers=[carried(2,pfront,12,[16,19,12]),carried(7,kfront,0,[14,17,10]),carried(10,lfront,1,[12,15,8]),carried(16,pback,12,[16,19,12])]
// Replace the bone with the full black pen, without importing the writing hand.
const bone=source.layers.find(l=>l.ind===8),bonePoints=[]
function points(items,m){for(const p of items)if(p.ty==='gr')points(p.it,mul(m,transform(p.it.find(q=>q.ty==='tr'),0)));else if(p.ty==='sh')bonePoints.push(...getShape(p.ks,0).v.map(v=>point(m,v)))}points(bone.shapes,I)
const bounds=vs=>[0,1].map(d=>[Math.min(...vs.map(v=>v[d])),Math.max(...vs.map(v=>v[d]))]),bb=bounds(bonePoints)
const penScale=Math.min((bb[0][1]-bb[0][0])/289,(bb[1][1]-bb[1][0])/404)
const penProjection=v=>[(v[0]-188.1)*penScale+(bb[0][0]+bb[0][1])/2,(v[1]-250)*penScale+(bb[1][0]+bb[1][1])/2]
const penLayer=structuredClone(bone);penLayer.nm='Чёрная ручка · 168';penLayer.shapes=flattened(pen,0,penProjection,l=>l.nm==='PEN')
const replacements=new Map([...layers.map(l=>[l.ind,l]),[8,penLayer]])
anim.layers=source.layers.filter(l=>l.ty===3||replacements.has(l.ind)).map(l=>replacements.get(l.ind)??structuredClone(l))
await writeFile('packs/blue/office-clay/drawing.json',JSON.stringify(anim)+'\n')
await finish('office-clay',source,anim,[0,16,25,35,50,65,80,100,120,140,160,179])
