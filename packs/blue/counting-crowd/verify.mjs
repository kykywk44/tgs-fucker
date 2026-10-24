import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {read} from '../lib/silhouette.mjs'
import {ROOT,Canvas,encodePng} from '../../../scripts/lib/sheets.mjs'
import {join} from 'node:path'
import {durationElement} from '../../../scripts/spoof-webm-duration.mjs'
const dir=join(ROOT,'exports/counting-crowd'),result=JSON.parse(await readFile(join(dir,'result.json'),'utf8'))
const file=join(ROOT,'exports/emoji/counting-crowd.webm'),bytes=await readFile(file),honest=await readFile(join(dir,'counting-crowd-preview.webm'))
assert.ok(bytes.length<=256*1024)
assert.deepEqual(await readFile(join(ROOT,'packs/blue/counting-crowd/source.tgs')),await readFile(join(ROOT,'library/emoji/189.tgs')))
const field=durationElement(bytes);assert.equal(field.seconds,2.99)
assert.deepEqual(bytes.subarray(0,field.data),honest.subarray(0,field.data));assert.deepEqual(bytes.subarray(field.end),honest.subarray(field.end))
const rgba=execFileSync('ffmpeg',['-v','error','-c:v','libvpx-vp9','-i',file,'-f','rawvideo','-pix_fmt','rgba','pipe:1'],{maxBuffer:128*1024*1024})
assert.equal(rgba.length,result.frames*100*100*4)
const sheet=new Canvas(600,120),samples=[0,10,20,920,1800,1839]
let transparent=0,opaque=0
for(let f=0;f<result.frames;f++){
 const frame=rgba.subarray(f*40000,(f+1)*40000)
 let visible=0;for(let i=3;i<40000;i+=4){if(frame[i]===0)transparent++;if(frame[i]===255)opaque++;visible+=frame[i]}
 assert.ok(visible>100000,'Empty decoded frame '+f)
 const i=samples.indexOf(f);if(i>=0){sheet.text(`f ${f}`,i*100+2,2,[50,50,50]);sheet.draw(frame,100,i*100,20)}
}
assert.ok(transparent>0&&opaque>0)
// Body pixels repeat every complete pitch even as the number changes.
// Allow lossy codec error: mean below number area must remain close.
let error=0,count=0
for(let y=22;y<100;y++)for(let x=0;x<100;x++)for(let c=0;c<4;c++){
 const i=(y*100+x)*4+c;error+=Math.abs(rgba[i]-rgba[20*40000+i]);count++
}
assert.ok(error/count<5,'Body cycle should repeat without a pose change')
const report={...result,decodedFrames:rgba.length/40000,transparentPixels:transparent,opaquePixels:opaque,meanBodyCycleError:error/count,sourceExact:true,onlyDurationBytesChanged:true,sha256:createHash('sha256').update(bytes).digest('hex'),largerProbeBytes:JSON.parse(await readFile(join(dir,'counter-93.json'),'utf8')).bytes}
await writeFile(join(dir,'decoded-preview.png'),encodePng(sheet.px,sheet.width,sheet.height))
await writeFile(join(dir,'verification.json'),JSON.stringify(report,null,2)+'\n')
console.log(report)
