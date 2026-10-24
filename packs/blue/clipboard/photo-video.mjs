// Local-only raster texture on the six-second clipboard. No pack upload.
// node packs/blue/clipboard/photo-video.mjs --six
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {join} from 'node:path'
import {read} from '../lib/silhouette.mjs'
import {ROOT,load} from '../../../scripts/lib/sheets.mjs'
import {boardProjection,turn,LONG} from './scene.mjs'
import {spoofDuration} from '../../../scripts/spoof-webm-duration.mjs'
if(!LONG)throw new Error('Use --six')
const dir=join(ROOT,'exports/clipboard-photo'),photo=join(import.meta.dirname,'private/photo.png')
await mkdir(dir,{recursive:true})
const {fitHomography}=await load('src/core/homography.ts')
const [w,h]=JSON.parse(execFileSync('python',['-c','from PIL import Image; import sys,json; print(json.dumps(Image.open(sys.argv[1]).size))',photo],{encoding:'utf8'}))
const board=boardProjection(await read('packs/blue/clipboard/source-193.tgs'))
const height=1.62,width=height*w/h,y=-.78
const quad=[[-width/2,y],[width/2,y],[width/2,y+height],[-width/2,y+height]]
const frames=Array.from({length:180},(_,i)=>{
 const f=i*2
 if(turn(f)<.505)return null
 const dst=quad.map(q=>board.front(q,f)),matrix=fitHomography(dst,[[0,0],[w,0],[w,h],[0,h]])
 return matrix.slice(0,8).map(v=>v/matrix[8])
})
await writeFile(join(dir,'projection.json'),JSON.stringify(frames))
execFileSync('python',[join(import.meta.dirname,'photo-video.py'),photo,dir],{stdio:'inherit'})
const clean=join(dir,'encoded.webm')
let bytes
for(const crf of [36,40,44,48]){
 execFileSync('ffmpeg',['-hide_banner','-y','-loglevel','error','-framerate','30','-i',join(dir,'frames/f%04d.png'),'-an','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-b:v','0','-crf',String(crf),'-deadline','good','-cpu-used','2',clean])
 bytes=await readFile(clean)
 if(bytes.length<=256*1024)break
}
if(bytes.length>256*1024)throw new Error('Video exceeds 256 KiB')
const output=join(dir,'clipboard-photo-6s.webm')
await writeFile(output,spoofDuration(bytes))
console.log(output,bytes.length,'bytes')
