import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {gunzipSync} from 'node:zlib'
import {join} from 'node:path'
import {ROOT,engine} from '../../../scripts/lib/sheets.mjs'

const source=await readFile(new URL('./source.tgs',import.meta.url))
assert(source.equals(await readFile(join(ROOT,'library/emoji/658.tgs'))),'Original changed')
const original=JSON.parse(gunzipSync(source))
const bytes=await readFile(join(ROOT,'exports/emoji/white-heart.tgs'))
const anim=JSON.parse(gunzipSync(bytes))
assert(bytes.length<=65536)
assert.equal(anim.w,512);assert.equal(anim.h,512);assert.equal(anim.fr,60);assert.equal(anim.op-anim.ip,180)
const unchanged=structuredClone(anim)
unchanged.nm=original.nm
const comp=unchanged.assets.find(a=>a.id==='comp_0')
const letters=comp.layers.filter(l=>l.nm.startsWith('+ąi ·'))
assert.equal(letters.length,2)
comp.layers=comp.layers.filter(l=>!l.nm.startsWith('+ąi ·'))
assert.deepEqual(unchanged,original,'Heart animation changed')
assert.deepEqual(letters[0].shapes,letters[1].shapes,'Both sides must use identical readable outlines')
const e=await engine(),a=e.create(JSON.stringify(original)),b=e.create(JSON.stringify(anim))
assert(a&&b)
let changed=0
for(let frame=0;frame<180;frame++){
  const before=new Uint8Array(a.render(frame,512,512)),after=b.render(frame,512,512)
  assert(after)
  for(let i=0;i<before.length;i+=4){
    assert.equal(after[i+3],before[i+3],`Inscription changes silhouette at frame ${frame}`)
    if(after[i]!==before[i]||after[i+1]!==before[i+1]||after[i+2]!==before[i+2]){
      assert(before[i+3]>250,`Inscription escaped heart at frame ${frame}`);changed++
    }
  }
}
assert(changed>0)
a.drop();b.drop()
console.log(`PASS: 180 frames; silhouette/alpha unchanged, ${changed} inscription pixels inside heart; ${(bytes.length/1024).toFixed(1)} KB`)
