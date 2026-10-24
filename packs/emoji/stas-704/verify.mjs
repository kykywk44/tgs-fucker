import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {gunzipSync} from 'node:zlib'
import {ROOT,engine} from '../../../scripts/lib/sheets.mjs'
import {join} from 'node:path'
const source=await readFile(join(import.meta.dirname,'source.tgs'))
assert(source.equals(await readFile(join(ROOT,'library/emoji/704.tgs'))))
const old=JSON.parse(gunzipSync(source)),bytes=await readFile(join(ROOT,'exports/emoji/stas-704.tgs'))
const anim=JSON.parse(gunzipSync(bytes))
assert(bytes.length<=65536)
assert.deepEqual(anim.layers,old.layers,'Root motion or effects changed')
assert.deepEqual(anim.assets[2],old.assets[2],'Button changed')
for(const id of ['comp_0','comp_1']){
  const c=anim.assets.find(c=>c.id===id)
  assert.equal(c.layers.length,1);assert.equal(c.layers[0].shapes[0].nm,'СТАС')
}
const e=await engine(),a=e.create(JSON.stringify(old)),b=e.create(JSON.stringify(anim))
for(let f=0;f<old.op;f++){
  const x=new Uint8Array(a.render(f,512,512)),y=b.render(f,512,512)
  for(let i=3;i<y.length;i+=4)assert.equal(y[i],x[i],`Silhouette changed at ${f}`)
  if(f>=38&&f<=114)assert(x.every((v,i)=>v===y[i]),`Back/effects changed at ${f}`)
}
a.drop();b.drop()
console.log(`PASS: ${old.op} frames; face/shadow replaced; turn, diapers, effects and silhouette unchanged`)
