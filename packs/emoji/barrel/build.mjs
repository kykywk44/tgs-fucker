import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {gunzipSync,gzipSync} from 'node:zlib'
import opentype from 'opentype.js'
import {ROOT,engine,Canvas,encodePng} from '../../../scripts/lib/sheets.mjs'
import {textOptions} from '../photo-devices/text-options.mjs'

const dir=import.meta.dirname,cfg=JSON.parse(await readFile(join(dir,'recipe.json'),'utf8'))
const {job,fontFor}=await textOptions(cfg)
const original=JSON.parse(gunzipSync(await readFile(join(dir,'source.tgs')))),anim=structuredClone(original)
const raw=new opentype.Path();let advance=0,previous=null
for(const char of cfg.text){
  const font=fontFor(char)
  assert(font.charToGlyphIndex(char),`Missing Cyrillic glyph: ${char}`)
  const glyph=font.charToGlyph(char)
  if(previous)advance+=font.getKerningValue(previous,glyph)*100/font.unitsPerEm
  raw.commands.push(...glyph.getPath(advance,0,100).commands)
  advance+=glyph.advanceWidth*100/font.unitsPerEm;previous=glyph
}
const box=raw.getBoundingBox(),scale=Math.min(2*cfg.panel.radius*cfg.panel.halfAngle/(box.x2-box.x1),80/(box.y2-box.y1))
const flatPoint=(x,y)=>[(x-(box.x1+box.x2)/2)*scale,(y-(box.y1+box.y2)/2)*scale]
const flat=raw.commands.map(c=>{
  const out={...c}
  for(const suffix of ['', '1', '2'])if(`x${suffix}` in c){
    const [x,y]=flatPoint(c[`x${suffix}`],c[`y${suffix}`]);out[`x${suffix}`]=x;out[`y${suffix}`]=y
  }
  return out
})
const round=n=>Math.round(n*1000)/1000
const add=(a,b)=>a.map((v,d)=>v+b[d]),sub=(a,b)=>a.map((v,d)=>v-b[d]),mul=(a,n)=>a.map(v=>v*n)
const lerp=(a,b,t)=>a.map((v,d)=>v+(b[d]-v)*t)
const tr={ty:'tr',p:{a:0,k:[0,0]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}}

// Repaint only the original red enamel; silver hardware stays metallic.
// Keep every gradient stop, alpha ramp, paint keyframe and highlight geometry.
function graphite(c){
  const [r,g,b]=c
  if(r<g*1.25||r<b*1.25)return c
  const light=(.2126*r+.7152*g+.0722*b)*.55
  return [round(light*.96),round(light),round(light*1.045),...c.slice(3)]
}
function liquid(c,id){
  if(id===45){const light=round(.975-(c[0]+c[1]+c[2])/3*.4);return [light,light,light,...c.slice(3)]}
  const light=id===48?.965:1
  return [light,light,light,...c.slice(3)]
}
function mapProperty(prop,fn){
  if(!prop.a)prop.k=fn(prop.k)
  else for(const k of prop.k)for(const field of ['s','e'])if(k[field])k[field]=fn(k[field])
}
function repaint(items,id){
  const fn=cfg.liquidLayers.includes(id)?c=>liquid(c,id):graphite
  for(const s of items){
    if(s.it)repaint(s.it,id)
    if(s.c)mapProperty(s.c,fn)
    if(s.g)mapProperty(s.g.k,stops=>{
      const result=[...stops]
      for(let n=0;n<s.g.p;n++)result.splice(n*4+1,3,...fn(stops.slice(n*4+1,n*4+4)).slice(0,3))
      return result
    })
  }
}
for(const layer of anim.layers)repaint(layer.shapes??[],layer.ind)

// The two raised hoops change their projected ellipse at 0/20/30/50.
// Follow the middle of the flat panel between those hoops in TELO coordinates.
const hoop1=original.layers.find(l=>l.ind===26).shapes[2].it[0].ks.k
const hoop2=original.layers.find(l=>l.ind===27).shapes[2].it[0].ks.k
const times=hoop1.map(k=>k.t)
function surface(index){
  const delta=((hoop1[index].s[0].v[4][1]-hoop1[0].s[0].v[4][1])+
    (hoop2[index].s[0].v[1][1]-hoop2[0].s[0].v[1][1]))*.35/2
  return {cx:cfg.panel.center[0],cy:cfg.panel.center[1]+delta,depth:cfg.panel.depth+delta}
}
function warp(p,s){
  const angle=p[0]/cfg.panel.radius
  return [s.cx+cfg.panel.radius*Math.sin(angle),s.cy+p[1]+s.depth*(Math.cos(angle)-1)]
}
function tangent(p,v,s){
  const angle=p[0]/cfg.panel.radius
  return [Math.cos(angle)*v[0],v[1]-s.depth/cfg.panel.radius*Math.sin(angle)*v[0]]
}
const cubic=(p,t)=>{
  const a=lerp(p[0],p[1],t),b=lerp(p[1],p[2],t),c=lerp(p[2],p[3],t)
  return lerp(lerp(a,b,t),lerp(b,c,t),t)
}
const derivative=(p,t)=>mul(lerp(lerp(sub(p[1],p[0]),sub(p[2],p[1]),t),lerp(sub(p[2],p[1]),sub(p[3],p[2]),t),t),3)

// Split the font's long segments before cylindrical projection. Both vertices
// and Bezier tangents are bent; mapping only vertices makes straight letters kink.
const outlines=[];let contour,current,start
const close=()=>{
  if(!contour)return
  if(Math.hypot(...sub(current,start))>1e-7)segment([current,current,start,start])
  outlines.push(contour);contour=null
}
function segment(p){
  const length=p.slice(1).reduce((sum,v,n)=>sum+Math.hypot(...sub(v,p[n])),0)
  const count=Math.max(1,Math.ceil(length/10))
  for(let n=0;n<count;n++){
    const t0=n/count,t1=(n+1)/count,a=cubic(p,t0),b=cubic(p,t1)
    contour.push([a,add(a,mul(derivative(p,t0),1/count/3)),sub(b,mul(derivative(p,t1),1/count/3)),b])
  }
  current=p[3]
}
for(const c of flat){
  const end='x' in c?[c.x,c.y]:null
  if(c.type==='M'){close();contour=[];start=current=end}
  else if(c.type==='Z')close()
  else{
    let c1=current,c2=end
    if(c.type==='C'){c1=[c.x1,c.y1];c2=[c.x2,c.y2]}
    else if(c.type==='Q'){const q=[c.x1,c.y1];c1=add(current,mul(sub(q,current),2/3));c2=add(end,mul(sub(q,end),2/3))}
    else assert.equal(c.type,'L')
    segment([current,c1,c2,end])
  }
}
close()
function projected(segments,s){
  const path={c:true,v:[],i:[],o:[]}
  for(const [a,c1,c2,b]of segments){
    path.v.push(warp(a,s).map(round))
    path.o.push(tangent(a,sub(c1,a),s).map(round))
    path.i.push(tangent(b,sub(c2,b),s).map(round))
  }
  // Incoming tangent belongs to the following vertex (cyclic contour).
  path.i.unshift(path.i.pop())
  return path
}
const text={ddd:0,ind:1001,ty:4,nm:`${cfg.text} · cylindrical white print`,parent:cfg.bodyLayer,
  sr:1,st:0,ip:0,op:180,bm:0,ks:{p:{a:0,k:[0,0,0]},a:{a:0,k:[0,0,0]},s:{a:0,k:[100,100,100]},r:{a:0,k:0},o:{a:0,k:100}},
  shapes:[{ty:'gr',nm:cfg.text,it:[...outlines.map(segments=>({ty:'sh',ks:{a:1,k:times.map((t,index)=>({
    t,s:[projected(segments,surface(index))],...(index<times.length-1?{i:structuredClone(hoop1[index].i),o:structuredClone(hoop1[index].o)}:{})
  }))}})),{ty:'fl',c:{a:0,k:[1,1,1,1]},o:{a:0,k:100},r:1},structuredClone(tr)]}]}
// Immediately above the barrel body, below its hoops and the moving lid:
// existing foreground pieces naturally occlude the print as they pass.
anim.layers.splice(anim.layers.findIndex(l=>l.ind===cfg.bodyLayer),0,text)
anim.nm=`569 · Black barrel · ${cfg.text}`
const output=gzipSync(Buffer.from(JSON.stringify(anim)),{level:9})
assert(output.length<=65536,`TGS exceeds 64 KB: ${output.length}`)
await mkdir(join(ROOT,'exports/emoji'),{recursive:true})
const sheets=join(ROOT,'exports/sheets/emoji-barrel');await mkdir(sheets,{recursive:true})
await writeFile(job?join(job,'barrel.tgs'):join(ROOT,'exports/emoji/barrel.tgs'),output)
const projectedSvg=new opentype.Path()
for(const path of outlines.map(c=>projected(c,surface(0)))){
  projectedSvg.moveTo(...path.v[0])
  for(let n=0;n<path.v.length;n++){
    const next=(n+1)%path.v.length
    projectedSvg.curveTo(...add(path.v[n],path.o[n]),...add(path.v[next],path.i[next]),...path.v[next])
  }
  projectedSvg.close()
}
if(!job)await writeFile(join(dir,'inscription.svg'),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="28 -70 260 120" aria-label="${cfg.text}"><path fill="white" d="${projectedSvg.toPathData(3)}"/></svg>\n`)
const eng=await engine(),render=eng.create(JSON.stringify(anim)),size=300
assert(render)
const canvas=new Canvas(4*size,3*(size+20))
for(const[n,frame]of [0,15,30,45,60,75,90,105,120,135,150,179].entries()){
  const x=n%4*size,y=Math.floor(n/4)*(size+20)
  canvas.text(''+frame,x+4,y+4,[25,25,25]);canvas.draw(render.render(frame,size,size),size,x,y+20)
}
await writeFile(job?join(job,'preview.png'):join(sheets,'preview.png'),encodePng(canvas.px,canvas.width,canvas.height))
render.drop()
console.log(`569: black enamel, white liquid, cylindrical ${cfg.text}; ${(output.length/1024).toFixed(1)} KB`)
