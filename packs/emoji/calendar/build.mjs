import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {createRequire} from 'node:module'
import {gunzipSync,gzipSync} from 'node:zlib'
import opentype from 'opentype.js'
import {ROOT,engine,Canvas,encodePng} from '../../../scripts/lib/sheets.mjs'

const dir=import.meta.dirname,cfg=JSON.parse(await readFile(join(dir,'recipe.json'),'utf8'))
const original=JSON.parse(gunzipSync(await readFile(join(dir,'source.tgs')))),anim=structuredClone(original)
const require=createRequire(import.meta.url)
const bytes=await readFile(join(require.resolve('@fontsource/roboto/LICENSE'),'..','files','roboto-latin-900-normal.woff'))
const font=opentype.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))
assert([...cfg.text].every(c=>font.charToGlyphIndex(c)!==0))
const raw=new opentype.Path()
let advance=0,previous=null
for(const char of cfg.text){
  const glyph=font.charToGlyph(char)
  if(previous)advance+=font.getKerningValue(previous,glyph)*100/font.unitsPerEm
  raw.commands.push(...glyph.getPath(advance,0,100).commands)
  advance+=glyph.advanceWidth*100/font.unitsPerEm;previous=glyph
}
const box=raw.getBoundingBox(),scale=cfg.width/(box.x2-box.x1)
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
await writeFile(join(dir,'inscription.svg'),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-cfg.width/2-4} ${-height/2-4} ${cfg.width+8} ${height+8}" aria-label="${cfg.text}"><path fill="${cfg.color}" d="${svg.toPathData(4)}"/></svg>\n`)
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
const tr=position=>({ty:'tr',p:{a:0,k:position},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}})

// Locate each old date's centre in its group coordinates. Keep the original
// group/layer transforms and visibility, including the paper squash on turns.
function dateBounds(group){
  const vertices=[]
  const collect=(items,offset)=>{
    for(const s of items){
      if(s.ty==='gr'){
        const t=s.it.find(x=>x.ty==='tr')
        assert(!t?.p?.a&&!t?.a?.a)
        collect(s.it,offset.map((v,d)=>v+(t?.p?.k[d]??0)-(t?.a?.k[d]??0)))
      }else if(s.ty==='sh'){
        const path=s.ks.a?s.ks.k[0].s[0]:s.ks.k
        vertices.push(...path.v.map(p=>p.map((v,d)=>v+offset[d])))
      }
    }
  }
  collect(group.it,[0,0])
  return [0,1].map(d=>(Math.min(...vertices.map(p=>p[d]))+Math.max(...vertices.map(p=>p[d])))/2)
}
function opaquePaper(items){
  return items.filter(s=>s.ty!=='st'&&s.ty!=='gs').map(s=>{
    if(s.it)return {...s,it:opaquePaper(s.it)}
    if(s.ty==='fl'||s.ty==='gf')return {ty:'fl',c:{a:0,k:[1,1,1,1]},o:{a:0,k:100},r:1}
    return structuredClone(s)
  })
}
for(const {layer:ind,group:index,paper:paperId,paperGroup} of cfg.dates){
  const layer=anim.layers.find(l=>l.ind===ind),old=layer.shapes[index],center=dateBounds(old)
  const print={ty:'gr',nm:`${cfg.text} · fixed date`,it:[
    {ty:'gr',nm:'Outlined Roboto Black',it:[...contours.map(k=>({ty:'sh',ks:{a:0,k:structuredClone(k)}})),
      {ty:'fl',c:{a:0,k:[...cfg.color.match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16)/255),1]},o:{a:0,k:100},r:1},tr(center)]},
    structuredClone(old.it.find(s=>s.ty==='tr')),
  ]}
  // The visible front of a curling page is a separate animated polygon.
  // Clip this sheet's print to that polygon: an obsolete billboard must not
  // remain over the newly exposed sheet below the curl.
  const paper=original.layers.find(l=>l.ind===paperId)
  const mask={...structuredClone(paper),ind:1000+ind,nm:`Paper face · ${ind}`,td:1,
    shapes:[{...structuredClone(paper.shapes[paperGroup]),it:opaquePaper(paper.shapes[paperGroup].it)}]}
  const ink={ddd:0,ind:1100+ind,ty:4,nm:`${cfg.text} · page ${ind}`,parent:ind,
    sr:1,st:0,ip:layer.ip,op:layer.op,tt:1,
    ks:{p:{a:0,k:[0,0,0]},a:{a:0,k:[0,0,0]},s:{a:0,k:[100,100,100]},r:{a:0,k:0},o:{a:0,k:100}},
    shapes:[print]}
  layer.shapes[index]={ty:'gr',nm:'Date replaced',it:[structuredClone(old.it.find(s=>s.ty==='tr'))]}
  anim.layers.splice(anim.layers.indexOf(layer),0,mask,ink)
}
anim.layers=anim.layers.filter(l=>!cfg.removeLayers.includes(l.ind))
// Original FEB has a mode-1 Merge Paths (compound-path concatenation), which
// Telegram's checker rejects. Its paths already share one fill; omitting this
// no-op preserves their drawing. The verifier compares both renders.
function removeCompoundMerge(items){
  return items.filter(s=>s.ty!=='mm'||s.mm!==1).map(s=>s.it?{...s,it:removeCompoundMerge(s.it)}:s)
}
for(const layer of anim.layers)if(layer.shapes)layer.shapes=removeCompoundMerge(layer.shapes)
anim.nm=`631 · Calendar · ${cfg.text}`
const output=gzipSync(Buffer.from(JSON.stringify(anim)),{level:9})
assert(output.length<=65536)
const out=join(ROOT,'exports/emoji'),sheets=join(ROOT,'exports/sheets/emoji-calendar')
await mkdir(out,{recursive:true});await mkdir(sheets,{recursive:true})
await writeFile(join(out,'calendar.tgs'),output)
const eng=await engine(),render=eng.create(JSON.stringify(anim))
assert(render)
const frames=[0,12,25,36,49,60,75,87,99,112,123,136,148,160,170,178],size=260
const sheet=new Canvas(4*size,4*(size+20))
for(const[n,frame]of frames.entries()){
  const x=n%4*size,y=Math.floor(n/4)*(size+20)
  sheet.text(''+frame,x+4,y+4,[25,25,25]);sheet.draw(render.render(frame,size,size),size,x,y+20)
}
await writeFile(join(sheets,'preview.png'),encodePng(sheet.px,sheet.width,sheet.height))
render.drop()
console.log(`Calendar: ${cfg.dates.length} dates replaced by ${cfg.text}; Heart removed; ${(output.length/1024).toFixed(1)} KB`)
