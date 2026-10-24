// A letter of Roboto Black as Lottie paths (no text layers in TGS), the way identification-card
// draws its big n: glyph(char, height) → closed shapes {c,v,i,o}, centred on x, baseline at y 0.
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {createRequire} from 'node:module'
import opentype from 'opentype.js'

const require=createRequire(import.meta.url)
const fontFile=join(require.resolve('@fontsource/roboto/LICENSE'),'..','files','roboto-latin-900-normal.woff')
const bytes=await readFile(fontFile)
const font=opentype.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))

export function glyph(char,height){
  const g=font.charToGlyph(char).getPath(0,0,50)
  const box=g.getBoundingBox(),scale=height/(box.y2-box.y1)
  const pos=(x,y)=>[(x-(box.x1+box.x2)/2)*scale,(y-box.y2)*scale]
  const shapes=[];let shape,current
  const close=()=>{
    if(!shape)return
    const n=shape.v.length-1
    if(n>0&&shape.v[0].every((v,d)=>Math.abs(v-shape.v[n][d])<1e-8)){
      shape.i[0]=shape.i[n];shape.v.pop();shape.i.pop();shape.o.pop()
    }
    shapes.push(shape);shape=null
  }
  for(const c of g.commands){
    const end='x'in c?pos(c.x,c.y):null
    if(c.type==='M'){close();shape={c:true,v:[end],i:[[0,0]],o:[[0,0]]};current=end}
    else if(c.type==='Z')close()
    else{
      let c1=current,c2=end
      if(c.type==='C'){c1=pos(c.x1,c.y1);c2=pos(c.x2,c.y2)}
      else if(c.type==='Q'){
        const q=pos(c.x1,c.y1)
        c1=current.map((v,d)=>v+2/3*(q[d]-v));c2=end.map((v,d)=>v+2/3*(q[d]-v))
      }
      shape.o[shape.o.length-1]=c1.map((v,d)=>v-current[d])
      shape.v.push(end);shape.i.push(c2.map((v,d)=>v-end[d]));shape.o.push([0,0]);current=end
    }
  }
  close()
  return shapes
}
