// The laptop stays original except for its plane-shaped cutout, now the card's n.
import assert from 'node:assert/strict'
import {writeFile,readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {ROOT,engine,encodePng} from '../../../scripts/lib/sheets.mjs'
import {read,walk,at} from '../lib/silhouette.mjs'
const source=await read('packs/blue/technologist-bust/source.tgs')
const anim=await read('exports/blue/technologist-bust.tgs')
const by=(a,n)=>a.layers.find(l=>l.nm===n)
const laptop=by(anim,'Laptop'),old=by(source,'Laptop')
assert.deepEqual({...laptop,shapes:undefined},{...old,shapes:undefined},'Laptop rig changed')
const before=structuredClone(old.shapes),after=structuredClone(laptop.shapes)
const path=after[3].it.find(p=>p.ty==='sh')
assert.notDeepEqual(path.ks,before[3].it.find(p=>p.ty==='sh').ks,'Plane has not been replaced')
path.ks=before[3].it.find(p=>p.ty==='sh').ks
assert.deepEqual(after,before,'Laptop circle, material or other shapes changed')
const glyph=JSON.parse(await readFile(join(import.meta.dirname,'logo.json'),'utf8')).shape
const badge=laptop.shapes[3],paths=walk([badge]).filter(p=>p.ty==='sh')
const origin=p=>[0,1].map(d=>(p.v[0][d]+p.v[2][d])/2)
for(let f=0;f<180;f++){
  const letter=at(paths[0].ks,f)[0],disk=at(paths[1].ks,f)[0],c=origin(disk)
  assert.equal(letter.v.length,glyph.v.length,'Letter outline changed')
  const x=[0,1].map(d=>(disk.v[3][d]-disk.v[1][d])/2),y=[0,1].map(d=>(disk.v[2][d]-disk.v[0][d])/2)
  const det=x[0]*y[1]-x[1]*y[0]
  for(const v of letter.v){
    const p=v.map((n,d)=>n-c[d]),u=(p[0]*y[1]-p[1]*y[0])/det,w=(x[0]*p[1]-x[1]*p[0])/det
    assert.ok(u*u+w*w<.9,`n escapes the circle at frame ${f}`)
  }
}
const player=(await engine()).create(JSON.stringify(anim))
assert.equal(player.frameCount,180)
let margin=512
for(let f=0;f<180;f++){
  const pixels=player.render(f,512,512).slice()
  for(let y=0;y<512;y++)for(let x=0;x<512;x++)if(pixels[(y*512+x)*4+3]>0)margin=Math.min(margin,x,y,511-x,511-y)
}
assert.ok(margin>=4,`Cropped frame: margin ${margin}`)
await writeFile(join(ROOT,'exports/sheets/blue-technologist-bust-preview.png'),encodePng(player.render(0,512,512).slice(),512,512))
player.drop()
console.log(JSON.stringify({frames:180,originalLaptopRig:true,originalCircleAndPaint:true,cardLetter:'n',letterInsideCircle:true,minimumMarginPx:margin}))
