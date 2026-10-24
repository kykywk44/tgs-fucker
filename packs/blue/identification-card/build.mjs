// 573: original animated card, blue portrait, one large n and a cursive n signature.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {createRequire} from 'node:module'
import opentype from 'opentype.js'
import {ROOT} from '../../../scripts/lib/sheets.mjs'
import {read,head,path,walk,group,stroke,mapProperty,finish,at} from '../lib/silhouette.mjs'

const dir=import.meta.dirname,name='identification-card'
const cfg=JSON.parse(await readFile(join(dir,'recipe.json'),'utf8'))
const source=await read(`packs/blue/${name}/source.tgs`),anim=structuredClone(source)
anim.nm='573 · n · Карточка'
const layers=anim.assets.find(a=>a.id==='comp_0').layers
const by=nm=>layers.find(l=>l.nm===nm)
const removed=new Set(['Hair','Brows 2','Eyes 2','Brows','Eyes','Nose','Ears','Hair Back'])
const portrait=by('HEAD')
const oval=path(portrait.shapes[0].it.find(g=>g.nm==='Group 2') ?
  {shapes:[portrait.shapes[0].it.find(g=>g.nm==='Group 2')]}:portrait)
portrait.shapes=head(oval,{...cfg.portrait,bottom:[0,126],top:[0,-172]})
// Move the complete portrait, including its child mouth, within the photo frame.
portrait.ks.p.k=portrait.ks.p.k.map((v,d)=>v+(cfg.portrait.positionOffset[d]??0))
const mouth=by('Mouth')
mouth.shapes=mouth.shapes.filter(g=>g.nm==='Group 3')
for(const paint of walk(mouth.shapes))if(paint.c)paint.c={a:0,k:[1,1,1,1]}
// The broad grin comes after the portrait, letter and signature have appeared.
const smile=walk(mouth.shapes).find(p=>p.ty==='sh')
const rest=structuredClone(at(smile.ks,110)[0])
const smileCenter=[0,1].map(d=>(Math.min(...rest.v.map(p=>p[d]))+Math.max(...rest.v.map(p=>p[d])))/2)
smile.ks={a:1,k:cfg.smile.keys.map(([t,amount],i)=>{
  const scale=cfg.smile.stretch.map(g=>1+(g-1)*amount)
  const shape={...structuredClone(rest),v:rest.v.map(p=>p.map((v,d)=>smileCenter[d]+(v-smileCenter[d])*scale[d])),
    i:rest.i.map(p=>p.map((v,d)=>v*scale[d])),o:rest.o.map(p=>p.map((v,d)=>v*scale[d]))}
  return {t,s:[shape],...(i<cfg.smile.keys.length-1&&{o:{x:.333,y:0},i:{x:.667,y:1}})}
})}

// Bake a real Roboto Black lower-case n to vector paths. No font/text layers in TGS.
const require=createRequire(import.meta.url)
const fontFile=join(require.resolve('@fontsource/roboto/LICENSE'),'..','files','roboto-latin-900-normal.woff')
const bytes=await readFile(fontFile)
const font=opentype.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))
const glyph=font.charToGlyph('n').getPath(0,0,50)
const box=glyph.getBoundingBox(),scale=cfg.letter.height/(box.y2-box.y1)
const pos=(x,y)=>[(x-(box.x1+box.x2)/2)*scale,(y-box.y2)*scale]
function contours(commands,point=pos){
  const shapes=[];let shape,current
  const finish=()=>{
    if(!shape)return
    const n=shape.v.length-1
    if(n>0&&shape.v[0].every((v,d)=>Math.abs(v-shape.v[n][d])<1e-8)){
      shape.i[0]=shape.i[n];shape.v.pop();shape.i.pop();shape.o.pop()
    }
    shapes.push(shape);shape=null
  }
  for(const command of commands){
    const end='x'in command?point(command.x,command.y):null
    if(command.type==='M'){
      finish();shape={c:true,v:[end],i:[[0,0]],o:[[0,0]]};current=end
    }else if(command.type==='Z')finish()
    else{
      let c1=current,c2=end
      if(command.type==='C'){c1=point(command.x1,command.y1);c2=point(command.x2,command.y2)}
      else if(command.type==='Q'){
        const q=point(command.x1,command.y1)
        c1=current.map((v,d)=>v+2/3*(q[d]-v));c2=end.map((v,d)=>v+2/3*(q[d]-v))
      }else assert.equal(command.type,'L')
      shape.o[shape.o.length-1]=c1.map((v,d)=>v-current[d])
      shape.v.push(end);shape.i.push(c2.map((v,d)=>v-end[d]));shape.o.push([0,0]);current=end
    }
  }
  finish();return shapes
}
const glyphShapes=contours(glyph.commands)
// The large letter keeps the first original letter's appearance/disappearance keys.
const text=[by('Isolation Mode')].map(original=>{
  const layer=structuredClone(original)
  layer.nm='n · Большая буква'
  layer.ks.p={a:0,k:cfg.letter.position}
  layer.shapes=[group('n · Roboto Black',[
    ...glyphShapes.map(shape=>({ty:'sh',ks:{a:0,k:structuredClone(shape)}})),
    {ty:'fl',c:{a:0,k:[0,0,0,1]},o:{a:0,k:100},r:1},
  ])]
  return layer
})

// One continuous pen stroke with entry/exit flourishes: a slanted lower-case n.
const signatureCommands=[
  {type:'M',x:-66,y:14},
  {type:'C',x1:-52,y1:14,x2:-39,y2:-1,x:-29,y:-16},
  {type:'C',x1:-32,y1:-7,x2:-37,y2:6,x:-40,y:13},
  {type:'C',x1:-31,y1:4,x2:-16,y2:-18,x:-5,y:-17},
  {type:'C',x1:9,y1:-18,x2:15,y2:-15,x:12,y:-7},
  {type:'C',x1:10,y1:-1,x2:2,y2:10,x:8,y:11},
  {type:'C',x1:18,y1:16,x2:43,y2:3,x:61,y:2},
]
const pen=contours(signatureCommands,(x,y)=>[x,y])[0];pen.c=false
const sign=by('sign'),oldSign=path(sign)
const base=oldSign.k[0].s[0]
const bounds=s=>[Math.min(...s.v.map(v=>v[0])),Math.max(...s.v.map(v=>v[0])),Math.min(...s.v.map(v=>v[1])),Math.max(...s.v.map(v=>v[1]))]
const reference=bounds(base)
const newSign=mapProperty(oldSign,s=>{
  const b=bounds(s),sx=(b[1]-b[0])/(reference[1]-reference[0]),sy=(b[3]-b[2])/(reference[3]-reference[2])
  return {...structuredClone(pen),v:pen.v.map(([x,y])=>[x*sx,y*sy]),
    i:pen.i.map(([x,y])=>[x*sx,y*sy]),o:pen.o.map(([x,y])=>[x*sx,y*sy])}
})
const originalTrim=sign.shapes.find(s=>s.ty==='tm')
sign.shapes=[group('n · Подпись одним росчерком',[{ty:'sh',ks:newSign},stroke(3.2,'#171b20')]),structuredClone(originalTrim)]

const keep=layers.filter(l=>!removed.has(l.nm)&&!l.nm.startsWith('Isolation Mode'))
// Text goes where the original letters were, above the card's paint layers.
const insert=keep.findIndex(l=>l.nm==='TEXT')+1
keep.splice(insert,0,...text)
anim.assets.find(a=>a.id==='comp_0').layers=keep
await finish(name,source,anim,[0,15,30,45,60,75,90,105,120,140,160,179])
await writeFile(join(dir,'drawing.json'),JSON.stringify(anim,null,2)+'\n')
