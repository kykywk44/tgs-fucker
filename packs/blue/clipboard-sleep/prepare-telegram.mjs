// Prepare the approved15s scene for both Telegram set types without changing it.
import assert from 'node:assert/strict'
import{execFileSync}from'node:child_process'
import{readFile,writeFile}from'node:fs/promises'
import{createHash}from'node:crypto'
import{join}from'node:path'
import{ROOT}from'../../../scripts/lib/sheets.mjs'
import{spoofDuration,durationElement}from'../../../scripts/spoof-webm-duration.mjs'
const dir=join(ROOT,'exports/clipboard-sleep'),file=join(dir,'clipboard-sleep-emoji-15s.encoded.webm')
execFileSync('ffmpeg',['-hide_banner','-y','-loglevel','error','-framerate','30','-i',join(dir,'frames/f%04d.png'),'-vf','scale=100:100:flags=lanczos','-an','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-b:v','0','-crf','40','-deadline','good','-cpu-used','1','-g','1000',file],{windowsHide:true})
const encoded=await readFile(file),output=spoofDuration(encoded)
assert.equal(durationElement(encoded).seconds,15);assert.ok(output.length<=64000)
const emoji=join(dir,'clipboard-sleep-emoji-15s.webm');await writeFile(emoji,output)
const manifest=[]
for(const [kind,path,size]of [['emoji',emoji,100],['sticker',join(dir,'clipboard-sleep-15s.webm'),512]]){
 const bytes=await readFile(path);assert.ok(bytes.length<=(kind==='emoji'?64000:256*1024))
 const p=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',path],{encoding:'utf8'})),s=p.streams[0]
 assert.equal(p.streams.length,1);assert.equal(s.codec_name,'vp9');assert.equal(s.width,size);assert.equal(s.height,size);assert.equal(s.nb_read_frames,'450');assert.equal(s.r_frame_rate,'30/1');assert.equal(+s.tags.alpha_mode,1);assert.equal(+p.format.duration,2.99)
 manifest.push({kind,file:path,size,frames:450,seconds:15,metadataSeconds:2.99,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})
}
await writeFile(join(dir,'telegram-files.json'),JSON.stringify(manifest,null,2)+'\n');console.log(manifest)
