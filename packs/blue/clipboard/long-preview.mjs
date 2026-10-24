// Six-second local master + video-sticker experiment. Does not publish or send.
import assert from 'node:assert/strict'
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'
import {ROOT,Canvas,engine,encodePng,load} from '../../../scripts/lib/sheets.mjs'
import {spoofDuration,durationElement} from '../../../scripts/spoof-webm-duration.mjs'

const dir=join(ROOT,'exports/clipboard-6s')
const run=args=>execFileSync('ffmpeg',['-hide_banner','-y','-loglevel','error',...args],{stdio:'pipe'})
const probe=file=>JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',file],{encoding:'utf8'}))
export async function exportLong(anim){
 await mkdir(join(dir,'frames'),{recursive:true})
 const {writeTgs}=await load('src/core/tgs.ts')
 const {telegramChecks}=await load('src/core/checks.ts')
 const tgs=await writeTgs(anim)
 // This file appears in drafts for editing only. Normal validation correctly
 // flags its real 6s duration; the existing approved 3s draft stays untouched.
 await writeFile(join(ROOT,'exports/blue/clipboard-6s-preview.tgs'),tgs)
 await writeFile(join(dir,'drawing.json'),JSON.stringify(anim)+'\n')
 const player=(await engine()).create(JSON.stringify(anim))
 assert.ok(player&&player.frameCount===360&&player.frameRate===60)
 const first=player.render(0,512,512).slice(),last=player.render(359,512,512).slice()
 assert.deepEqual(first,last,'Long master loop must join exactly')
 const shown=player.render(264,512,512).slice()
 let topShown=512,whiteShown=0
 for(let i=0;i<512*512;i++){
  if(shown[i*4+3])topShown=Math.min(topShown,Math.floor(i/512))
  if(shown[i*4]>240&&shown[i*4+1]>240&&shown[i*4+2]>240&&shown[i*4+3]>250)whiteShown++
 }
 assert.ok(topShown>=80&&topShown<=90,'About 1/6 canvas clear above presented board')
 assert.ok(whiteShown>512*512*.45,'Paper must fill the lower canvas')
 const keys=[0,27,45,72,90,120,150,180,198,216,234,252,276,300,324,348,359]
 const sheet=new Canvas(256*6,276*3)
 for(const [i,f] of keys.entries()){
  sheet.text(`f ${f}`,i%6*256+4,Math.floor(i/6)*276+3,[60,60,60])
  sheet.draw(player.render(f,256,256).slice(),256,i%6*256,Math.floor(i/6)*276+20)
 }
 await writeFile(join(dir,'storyboard.png'),encodePng(sheet.px,sheet.width,sheet.height))
 // Full 6s at 30fps: no frame dropping after the declared metadata duration.
 for(let i=0;i<180;i++){
  const px=player.render(i*2,512,512).slice()
  assert.ok(px.some((v,k)=>k%4===3&&v>0),`Empty video frame ${i}`)
  await writeFile(join(dir,'frames',`f${String(i).padStart(4,'0')}.png`),encodePng(px,512,512))
 }
 player.drop()
 const input=join(dir,'frames','f%04d.png'),results=[]
 for(const [kind,size,crf] of [['sticker',512,35],['emoji',100,34]]){
  const clean=join(dir,`clipboard-${kind}-6s.webm`),fake=join(dir,`clipboard-${kind}-6s-spoof.webm`)
  run(['-framerate','30','-i',input,'-vf',`scale=${size}:${size}:flags=lanczos`,
   '-an','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-b:v','0','-crf',String(crf),'-deadline','good','-cpu-used','2',clean])
  const original=await readFile(clean),out=spoofDuration(original)
  const d=durationElement(original)
  assert.ok(Math.abs(d.seconds-6)<.05)
  assert.deepEqual(original.subarray(0,d.data),out.subarray(0,d.data))
  assert.deepEqual(original.subarray(d.end),out.subarray(d.end),'Encoded packets must not change')
  await writeFile(fake,out)
  const meta=probe(fake),streams=meta.streams
  assert.equal(streams.length,1);const v=streams[0]
  assert.equal(v.codec_name,'vp9');assert.equal(v.width,size);assert.equal(v.height,size)
  assert.equal(v.r_frame_rate,'30/1');assert.equal(+v.nb_read_frames,180)
  assert.equal(+v.tags.alpha_mode,1);assert.ok(out.length<=(kind==='emoji'?64:256)*1024)
  assert.ok(Math.abs(+meta.format.duration-2.99)<.001)
  // Decode with libvpx (native VP9 decoding drops the WebM alpha plane).
  const rgba=execFileSync('ffmpeg',['-v','error','-c:v','libvpx-vp9','-i',fake,'-an','-f','rawvideo','-pix_fmt','rgba','pipe:1'],{maxBuffer:512*512*4*181})
  assert.equal(rgba.length,size*size*4*180,'Decoder must consume the full 6s, despite fake duration')
  assert.ok(rgba.some((v,k)=>k%4===3&&v===0),'Transparency lost')
  assert.ok(rgba.some((v,k)=>k%4===3&&v===255),'Opaque content lost')
  results.push({kind,size,bytes:out.length,codec:'vp9',fps:30,frames:180,decodedSeconds:6,metadataSeconds:+meta.format.duration,alpha:true,serverAcceptance:'not tested'})
 }
 const mp4=join(dir,'clipboard-6s-preview.mp4')
 run(['-f','lavfi','-i','color=c=white:s=512x512:r=30','-framerate','30','-i',input,
  '-filter_complex','[0:v][1:v]overlay=shortest=1:format=auto,format=yuv420p','-an','-c:v','libopenh264','-b:v','1500k','-movflags','+faststart',mp4])
 const validation={master:{frames:360,fps:60,seconds:6,bytes:tgs.length,loopPixelExact:true,topShown,whiteShown,checks:telegramChecks(anim,tgs.length)},videos:results,previewBytes:(await stat(mp4)).size}
 await writeFile(join(dir,'verification.json'),JSON.stringify(validation,null,2)+'\n')
 console.log(JSON.stringify(validation,null,2))
}
