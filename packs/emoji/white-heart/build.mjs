// Independent emoji pack: original 658 + two outlined inscriptions.
import assert from 'node:assert/strict'
import {readFile, writeFile, mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {createRequire} from 'node:module'
import {gunzipSync, gzipSync} from 'node:zlib'
import opentype from 'opentype.js'
import {ROOT, engine, Canvas, encodePng, load} from '../../../scripts/lib/sheets.mjs'

const dir=import.meta.dirname
const cfg=JSON.parse(await readFile(join(dir,'recipe.json'),'utf8'))
const sourceBytes=await readFile(join(dir,'source.tgs'))
const original=JSON.parse(gunzipSync(sourceBytes)), anim=structuredClone(original)
const require=createRequire(import.meta.url)
const fontDir=join(require.resolve('@fontsource/roboto/LICENSE'),'..','files')
const fonts=await Promise.all(['latin','latin-ext'].map(async subset=>{
  const b=await readFile(join(fontDir,`roboto-${subset}-900-normal.woff`))
  return opentype.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength))
}))

// These subsets complement one another: ą is in latin-ext, + and i in latin.
let advance=0
const commands=[]
for(const char of cfg.text){
  const font=fonts.find(f=>f.charToGlyphIndex(char)!==0)
  assert(font,`Missing glyph: ${char}`)
  const glyph=font.charToGlyph(char)
  commands.push(...glyph.getPath(advance,0,100).commands)
  advance+=glyph.advanceWidth*100/font.unitsPerEm+2
}
const raw=new opentype.Path();raw.commands=commands
const box=raw.getBoundingBox(), scale=cfg.width/(box.x2-box.x1)
const point=(x,y)=>[(x-(box.x1+box.x2)/2)*scale,(y-(box.y1+box.y2)/2)*scale]
const normalized=commands.map(c=>{
  const out={...c}
  for(const suffix of ['', '1', '2'])if(`x${suffix}` in c){
    const [x,y]=point(c[`x${suffix}`],c[`y${suffix}`]);out[`x${suffix}`]=x;out[`y${suffix}`]=y
  }
  return out
})
const svgPath=new opentype.Path();svgPath.commands=normalized
const height=(box.y2-box.y1)*scale
await writeFile(join(dir,'inscription.svg'),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-cfg.width/2-4} ${-height/2-4} ${cfg.width+8} ${height+8}" role="img" aria-label="+ąi"><path fill="${cfg.color}" d="${svgPath.toPathData(4)}"/></svg>\n`)

// Convert quadratic font curves to cubic Lottie contours, including the ogonek.
const contours=[];let shape,current
function close(){
  if(!shape)return
  const last=shape.v.length-1
  if(last>0&&shape.v[0].every((v,d)=>Math.abs(v-shape.v[last][d])<1e-8)){
    shape.i[0]=shape.i[last];shape.v.pop();shape.i.pop();shape.o.pop()
  }
  contours.push(shape);shape=null
}
for(const c of normalized){
  const end='x' in c?[c.x,c.y]:null
  if(c.type==='M'){close();shape={c:true,v:[end],i:[[0,0]],o:[[0,0]]};current=end}
  else if(c.type==='Z')close()
  else{
    let c1=current,c2=end
    if(c.type==='C'){c1=[c.x1,c.y1];c2=[c.x2,c.y2]}
    else if(c.type==='Q'){
      const q=[c.x1,c.y1]
      c1=current.map((v,d)=>v+2/3*(q[d]-v));c2=end.map((v,d)=>v+2/3*(q[d]-v))
    }else assert.equal(c.type,'L')
    shape.o[shape.o.length-1]=c1.map((v,d)=>v-current[d])
    shape.v.push(end);shape.i.push(c2.map((v,d)=>v-end[d]));shape.o.push([0,0]);current=end
  }
}
close()
const color=[1,3,5].map(i=>parseInt(cfg.color.slice(i,i+2),16)/255)
const tr={ty:'tr',p:{a:0,k:[0,0]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}}
const comp=anim.assets.find(a=>a.id==='comp_0')
const front=comp.layers.find(l=>l.nm==='base'),back=comp.layers.find(l=>l.nm==='base 4')
const outer=layer=>layer.shapes[1].it.find(s=>s.ty==='sh').ks
const width=s=>Math.max(...s.v.map(p=>p[0]))-Math.min(...s.v.map(p=>p[0]))
const full=width(outer(front).k[0].s[0]),edge=width(outer(front).k.at(-1).s[0])
const {easeAt}=await load('src/core/motion/easing.ts')
function pathAt(prop,t){
  const keys=prop.k
  if(t<=keys[0].t)return keys[0].s[0]
  const n=keys.findIndex((k,i)=>i<keys.length-1&&t>=k.t&&t<keys[i+1].t)
  if(n<0)return keys.at(-1).s[0]
  const a=keys[n],b=keys[n+1],u=(t-a.t)/(b.t-a.t)
  const pick=v=>Array.isArray(v)?v[0]:v
  const e=a.h?0:a.o&&a.i?easeAt({x1:pick(a.o.x),y1:pick(a.o.y),x2:pick(a.i.x),y2:pick(a.i.y)},u):u
  const from=a.s[0],to=b.s[0]
  return {v:from.v.map((p,i)=>p.map((v,d)=>v+(to.v[i][d]-v)*e))}
}
// Infer foreshortening from the author's actual silhouette keys, subtracting
// the heart's thick side profile. Both inscriptions inherit the original pulse
// and all parent transforms by living inside comp_0.
const sampleKeys=fn=>Array.from({length:91},(_,n)=>{
  const t=n*2
  return {t,s:fn(t),...(t<180?{o:{x:.333,y:.333},i:{x:.667,y:.667}}:{})}
})
for(const [side,base,direction] of [['front',front,1],['back',back,-1]]){
  const state=t=>{
    const shape=pathAt(outer(base),Math.min(180,Math.max(base.ip,t)))
    const cosine=Math.max(0,Math.min(1,(width(shape)-edge)/(full-edge)))
    const sine=Math.sqrt(1-cosine*cosine)
    const shift=(Math.min(...shape.v.map(p=>p[0]))+Math.max(...shape.v.map(p=>p[0])))/2+2
    return {cosine,x:cfg.center[0]+direction*(cfg.surfaceDepth*sine+shift)}
  }
  const layer={ddd:0,ind:100+(side==='back'?1:0),ty:4,nm:`+ąi · ${side}`,
    sr:1,st:0,ip:base.ip,op:base.op,bm:0,
    ks:{o:{a:0,k:100},r:{a:0,k:0},a:{a:0,k:[0,0,0]},
      p:{a:1,k:sampleKeys(t=>[state(t).x,cfg.center[1],0])},
      s:{a:1,k:sampleKeys(t=>[Math.max(.001,state(t).cosine*100),100,100])}},
    shapes:[{ty:'gr',nm:'+ąi · vector outlines',it:[
      ...contours.map(k=>({ty:'sh',ks:{a:0,k}})),
      {ty:'fl',c:{a:0,k:[...color,1]},o:{a:0,k:100},r:1},structuredClone(tr)]}]}
  comp.layers.unshift(layer)
}
anim.nm='658 · White heart · +ąi'
const output=gzipSync(Buffer.from(JSON.stringify(anim)),{level:9})
assert(output.length<=65536,`TGS exceeds 64 KB: ${output.length}`)
const outDir=join(ROOT,'exports/emoji'),sheets=join(ROOT,'exports/sheets/emoji-white-heart')
await mkdir(outDir,{recursive:true});await mkdir(sheets,{recursive:true})
await writeFile(join(outDir,'white-heart.tgs'),output)
const e=await engine(),render=e.create(JSON.stringify(anim))
assert(render)
const frames=[0,30,60,75,83,90,97,105,120,150,179],size=220
const canvas=new Canvas(size*6,(size+22)*2)
for(let i=0;i<frames.length;i++){
  const x=(i%6)*size,y=Math.floor(i/6)*(size+22)
  canvas.text(''+frames[i],x+6,y+5,[45,45,45]);canvas.draw(render.render(frames[i],size,size),size,x,y+22)
}
await writeFile(join(sheets,'preview.png'),encodePng(canvas.px,canvas.width,canvas.height))
render.drop()
console.log(`White heart +ąi: ${(output.length/1024).toFixed(1)} KB; SVG + TGS + preview written`)
