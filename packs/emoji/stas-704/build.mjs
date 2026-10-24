import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {gunzipSync,gzipSync} from 'node:zlib'
import opentype from 'opentype.js'
import {ROOT,engine,Canvas,encodePng} from '../../../scripts/lib/sheets.mjs'
import {textOptions} from '../photo-devices/text-options.mjs'

const dir=import.meta.dirname,cfg=JSON.parse(await readFile(join(dir,'recipe.json'),'utf8'))
const {job,fontFor}=await textOptions(cfg)
await mkdir(join(ROOT,'exports/emoji'),{recursive:true})
await mkdir(join(ROOT,'exports/sheets/emoji-stas-704'),{recursive:true})
const original=JSON.parse(gunzipSync(await readFile(join(dir,'source.tgs')))),anim=structuredClone(original)
const raw=new opentype.Path()
let advance=0,previous=null
for(const char of cfg.text){
  const font=fontFor(char)
  const glyph=font.charToGlyph(char)
  if(previous)advance+=font.getKerningValue(previous,glyph)*100/font.unitsPerEm
  raw.commands.push(...glyph.getPath(advance,0,100).commands)
  advance+=glyph.advanceWidth*100/font.unitsPerEm;previous=glyph
}
const box=raw.getBoundingBox(),scale=Math.min(cfg.width/(box.x2-box.x1),180/(box.y2-box.y1))
const round=n=>Math.round(n*10000)/10000
const point=(x,y)=>[round((x-(box.x1+box.x2)/2)*scale),round((y-(box.y1+box.y2)/2)*scale)]
const normalized=raw.commands.map(c=>{
  const out={...c}
  for(const suffix of ['', '1', '2'])if(`x${suffix}` in c){
    const [x,y]=point(c[`x${suffix}`],c[`y${suffix}`]);out[`x${suffix}`]=x;out[`y${suffix}`]=y
  }
  return out
})
const svg=new opentype.Path();svg.commands=normalized
const height=(box.y2-box.y1)*scale
if(!job)await writeFile(join(dir,'inscription.svg'),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-cfg.width/2-4} ${-height/2-4} ${cfg.width+8} ${height+8}" aria-label="${cfg.text}"><path fill="${cfg.color}" d="${svg.toPathData(4)}"/></svg>\n`)
const contours=[];let shape,current
const close=()=>{
  if(!shape)return
  const last=shape.v.length-1
  if(last>0&&shape.v[0].every((v,d)=>Math.abs(v-shape.v[last][d])<1e-7)){
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
    shape.o[shape.o.length-1]=c1.map((v,d)=>round(v-current[d]))
    shape.v.push(end);shape.i.push(c2.map((v,d)=>round(v-end[d])));shape.o.push([0,0]);current=end
  }
}
close()
// Replace both the white face and its original black relief shadow. The two
// root precomp layers retain their exact turn, visibility and shadow offset.
const identity={p:{a:0,k:[0,0,0]},a:{a:0,k:[0,0,0]},s:{a:0,k:[100,100,100]},r:{a:0,k:0},o:{a:0,k:100}}
for(const [id,color]of [['comp_0',[1,1,1,1]],['comp_1',[0,0,0,1]]]){
  const comp=anim.assets.find(a=>a.id===id)
  comp.layers=[{ddd:0,ind:1,ty:4,nm:`${cfg.text} · ${id==='comp_0'?'white':'relief'}`,sr:1,st:0,ip:0,op:200,
    ks:structuredClone(identity),shapes:[{ty:'gr',nm:cfg.text,it:[
      ...contours.map(k=>({ty:'sh',ks:{a:0,k:structuredClone(k)}})),
      {ty:'fl',c:{a:0,k:color},o:{a:0,k:100},r:1},
      {ty:'tr',p:{a:0,k:[256,256]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}}
    ]}]}]
}
anim.nm=`704 · ${cfg.text}`
const output=gzipSync(Buffer.from(JSON.stringify(anim)),{level:9})
assert(output.length<=65536)
await writeFile(job?join(job,'stas-704.tgs'):join(ROOT,'exports/emoji/stas-704.tgs'),output)
const e=await engine(),r=e.create(JSON.stringify(anim)),size=260
const sheet=new Canvas(4*size,3*(size+20))
for(const [n,f]of [0,20,32,37,38,45,65,90,114,116,130,174].entries()){
  const x=n%4*size,y=Math.floor(n/4)*(size+20)
  sheet.text(''+f,x+3,y+3,[0,0,0]);sheet.draw(r.render(f,size,size),size,x,y+20)
}
await writeFile(job?join(job,'preview.png'):join(ROOT,'exports/sheets/emoji-stas-704/preview.png'),encodePng(sheet.px,sheet.width,sheet.height))
r.drop()
console.log(`704 СТАС: ${(output.length/1024).toFixed(1)} KB`)
