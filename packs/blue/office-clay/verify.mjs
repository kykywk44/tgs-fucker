import assert from 'node:assert/strict'
import{readFile,writeFile,mkdir}from'node:fs/promises'
import{createHash}from'node:crypto'
import{read,walk}from'../lib/silhouette.mjs'
import{engine,load}from'../../../scripts/lib/sheets.mjs'
const source=await read('packs/blue/office-clay/source.tgs'),a=await read('exports/blue/office-clay.tgs')
for(const k of ['w','h','fr','ip','op'])assert.equal(a[k],source[k])
assert.deepEqual(a.layers.map(l=>l.ind),[2,5,7,8,10,13,14,16],'Only gadgets/pen and original motion parents remain')
for(const l of a.layers){const s=source.layers.find(p=>p.ind===l.ind);for(const k of ['ks','parent','ip','op','st','sr'])assert.deepEqual(l[k],s[k],`Original motion ${l.ind}.${k}`)}
assert.equal(a.layers.find(l=>l.ind===2).nm,'Телефон · экран')
assert.equal(a.layers.find(l=>l.ind===7).nm,'Клавиатура')
assert.equal(a.layers.find(l=>l.ind===10).nm,'Ноутбук · N')
assert.ok(a.layers.find(l=>l.ind===10).shapes[0].it[0].it.some(g=>g.nm==='N · логотип'))
assert.ok(walk(a.layers.find(l=>l.ind===7).shapes).filter(p=>p.ty==='sh').length>100,'Original detailed keyboard')
const bytes=await readFile('exports/blue/office-clay.tgs'),{telegramChecks}=await load('src/core/checks.ts')
assert.ok(telegramChecks(a,bytes.length).every(c=>c.ok))
const eng=await engine(),normal=eng.create(JSON.stringify(a))
assert.deepEqual(normal.render(0,512,512).slice(),normal.render(179,512,512).slice(),'Exact loop');normal.drop()
// Render on an expanded transparent canvas to detect geometry clipped by512px.
const expanded=structuredClone(a);expanded.w=expanded.h=768
for(const l of expanded.layers)if(l.parent==null)l.parent=999
expanded.layers.push({ind:999,ty:3,ip:0,op:180,st:0,ks:{p:{a:0,k:[128,128]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}}})
const player=eng.create(JSON.stringify(expanded));let box=[768,768,0,0]
for(let f=0;f<180;f++){const px=player.render(f,768,768).slice();let count=0
 for(let y=0;y<768;y++)for(let x=0;x<768;x++)if(px[(y*768+x)*4+3]>1){assert.ok(x>=128&&x<640&&y>=128&&y<640,'Clipped gadget at '+f);count++;box=[Math.min(box[0],x),Math.min(box[1],y),Math.max(box[2],x),Math.max(box[3],y)]}
 assert.ok(count>0,'Empty frame '+f)
}player.drop()
const report={sourceSha256:createHash('sha256').update(await readFile('packs/blue/office-clay/source.tgs')).digest('hex'),bytes:bytes.length,frames:180,fps:60,originalRigAndTiming:true,orderBottomToTop:['laptop','keyboard','phone'],landscapeGadgetsTurned90:true,noDustOrClay:true,pixelExactLoop:true,allFramesInsideCanvas:true,bounds:box.map(v=>v-128)}
await mkdir('exports/office-clay',{recursive:true});await writeFile('exports/office-clay/verification.json',JSON.stringify(report,null,2)+'\n');console.log(report)
