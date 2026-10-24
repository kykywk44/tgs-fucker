// Native512px/30fps first: preserve quality rather than maximize duration.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'
import {ROOT,engine,encodePng} from '../../../scripts/lib/sheets.mjs'
import {spoofDuration,durationElement} from '../../../scripts/spoof-webm-duration.mjs'
const dir=join(ROOT,'exports/clipboard-sleep'),frames=join(dir,'frames');await mkdir(frames,{recursive:true})
const anim=JSON.parse(await readFile(join(dir,'drawing.json'),'utf8')),player=(await engine()).create(JSON.stringify(anim)),N=450
for(let i=0;i<N;i++){
 const frame=player.render(Math.round(i*(anim.op-1)/(N-1)),512,512).slice()
 assert.ok(frame.some((v,j)=>j%4===3&&v>0),'Empty frame'+i)
 await writeFile(join(frames,`f${String(i).padStart(4,'0')}.png`),encodePng(frame,512,512))
}
player.drop();console.log('Rendered450 native512px frames')
const run=args=>execFileSync('ffmpeg',['-hide_banner','-y','-loglevel','error',...args],{windowsHide:true,stdio:'pipe'})
const input=join(frames,'f%04d.png'),results=[]
for(const crf of [42,44,45]){
 const encoded=join(dir,`clipboard-sleep-crf${crf}.webm`)
 run(['-framerate','30','-i',input,'-an','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-b:v','0','-crf',String(crf),'-deadline','good','-cpu-used','2','-g','1000',encoded])
 const bytes=await readFile(encoded);results.push({crf,bytes:bytes.length});console.log(results.at(-1))
 if(bytes.length<=256*1024){
  const output=spoofDuration(bytes)
  await writeFile(join(dir,'clipboard-sleep-15s-preview.webm'),bytes)
  await writeFile(join(dir,'clipboard-sleep-15s.webm'),output)
  await mkdir(join(ROOT,'exports/blue'),{recursive:true})
  await writeFile(join(ROOT,'exports/blue/clipboard-sleep-15s.webm'),output)
  const field=durationElement(bytes);assert.equal(field.seconds,15)
  assert.deepEqual(bytes.subarray(0,field.data),output.subarray(0,field.data));assert.deepEqual(bytes.subarray(field.end),output.subarray(field.end))
  await writeFile(join(dir,'video.json'),JSON.stringify({seconds:15,width:512,height:512,fps:30,frames:N,bytes:output.length,crf,metadataSeconds:2.99,attempts:results},null,2)+'\n')
  break
 }
}
assert.ok(results.at(-1).bytes<=256*1024,'Could not fit512px video; review quality before changing resolution')
run(['-f','lavfi','-i','color=c=white:s=512x512:r=30','-c:v','libvpx-vp9','-i',join(dir,'clipboard-sleep-15s-preview.webm'),'-filter_complex','[0:v][1:v]overlay=shortest=1:format=auto,format=yuv420p','-an','-c:v','libopenh264','-b:v','1500k','-movflags','+faststart',join(dir,'clipboard-sleep-15s-preview.mp4')])



