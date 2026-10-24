// Frozen source189 left busts, scrolling right-to-left, numbered in Roboto Black.
// node packs/blue/counting-crowd/build.mjs [cycles=92]
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {spawn,execFileSync} from 'node:child_process'
import {once} from 'node:events'
import {read,at,group,rgb} from '../lib/silhouette.mjs'
import {glyph} from '../lib/glyph.mjs'
import {ROOT,engine,encodePng,Canvas} from '../../../scripts/lib/sheets.mjs'
import {spoofDuration} from '../../../scripts/spoof-webm-duration.mjs'
const dir=join(ROOT,'exports/counting-crowd');await mkdir(dir,{recursive:true})
const cycles=Number(process.argv[2]??92),S=100,FPS=10,PITCH=40
assert.ok(Number.isInteger(cycles)&&cycles>0&&cycles<=4096)
const source=await read('packs/blue/counting-crowd/source.tgs')
function freeze(value){
 if(!value||typeof value!=='object')return value
 if(value.a===1&&Array.isArray(value.k)){
  let k=at(value,0);if(Array.isArray(k)&&k.length===1)k=k[0]
  return {a:0,k:freeze(k)}
 }
 return Array.isArray(value)?value.map(freeze):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,freeze(v)]))
}
const left=freeze(source.assets[0].layers.filter(l=>l.nm.startsWith('L-')&&l.ip<=0))
for(const l of left){l.ip=0;l.op=1;delete l.ef}
const spriteAnim={v:'5.7.4',fr:FPS,ip:0,op:1,w:512,h:512,layers:left,assets:[]}
const eng=await engine(),actor=eng.create(JSON.stringify(spriteAnim)),sprite=actor.render(0,S,S).slice()
await writeFile(join(dir,'actor.png'),encodePng(actor.render(0,512,512).slice(),512,512));actor.drop()
const digits=[]
for(let d=0;d<10;d++){
 const a={...spriteAnim,w:20,h:20,layers:[{ty:4,ind:1,ip:0,op:1,ks:{p:{a:0,k:[10,14]}},shapes:[group('Roboto Black '+d,[...glyph(String(d),12).map(k=>({ty:'sh',ks:{a:0,k}})),{ty:'st',c:{a:0,k:[...rgb('#335375'),1]},o:{a:0,k:100},w:{a:0,k:.7},lj:2},{ty:'fl',c:{a:0,k:[1,1,1,1]},o:{a:0,k:100},r:1}])]}]}
 const p=eng.create(JSON.stringify(a));digits.push(p.render(0,20,20).slice());p.drop()
}
function over(dst,src,w,h,ox,oy=0){
 ox=Math.round(ox);oy=Math.round(oy)
 for(let y=Math.max(0,-oy);y<Math.min(h,S-oy);y++)for(let x=Math.max(0,-ox);x<Math.min(w,S-ox);x++){
  const a=(y*w+x)*4,b=((y+oy)*S+x+ox)*4,sa=src[a+3]/255;if(!sa)continue
  const da=dst[b+3]/255,alpha=sa+da*(1-sa)
  for(let c=0;c<3;c++)dst[b+c]=Math.round((src[a+c]*sa+dst[b+c]*da*(1-sa))/alpha)
  dst[b+3]=Math.round(alpha*255)
 }
}
// Cache the complete moving bodies for one pitch. Only digits change thereafter.
const bodies=Array.from({length:PITCH},(_,phase)=>{
 const out=Buffer.alloc(S*S*4)
 for(let k=3;k>=-2;k--)over(out,sprite,S,S,30+PITCH*k-phase-32)
 return out
})
function frame(f){
 const pixel=f*20/FPS,phase=pixel%PITCH,base=Math.floor(pixel/PITCH)+1,out=Buffer.from(bodies[phase])
 for(let k=-2;k<=3;k++){
  const label=base+k,x=30+PITCH*k-phase;if(label<1||x< -15||x>S+15)continue
  const chars=String(label)
  for(let j=0;j<chars.length;j++)over(out,digits[Number(chars[j])],20,20,x+(j-(chars.length-1)/2)*8-10,0)
 }
 return out
}
const sheet=new Canvas(600,120)
for(const [i,f]of [0,10,20,Math.floor(cycles*FPS),Math.max(0,cycles*FPS*2-40),(cycles*FPS*2)-1].entries()){
 const data=frame(f);sheet.text(String(Math.floor(f/FPS/2)+1),i*100+2,2,[50,50,50]);sheet.draw(data,100,i*100,20)
}
await writeFile(join(dir,'preview.png'),encodePng(sheet.px,sheet.width,sheet.height))
const encoded=join(dir,`counter-${cycles}.encoded.webm`),output=join(dir,`counter-${cycles}.webm`)
const ff=spawn('ffmpeg',['-hide_banner','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgba','-s','100x100','-r',String(FPS),'-i','pipe:0','-an','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-b:v','0','-crf','42','-deadline','good','-cpu-used','4','-g','100000','-auto-alt-ref','1',encoded],{windowsHide:true,stdio:['pipe','ignore','pipe']})
let errors='';ff.stderr.on('data',b=>errors+=b);const closed=once(ff,'close')
for(let f=0;f<cycles*FPS*2;f++){
 if(!ff.stdin.write(frame(f)))await once(ff.stdin,'drain')
 if(f&&f%4000===0)console.log(`Rendered ${f/FPS}s / ${cycles*2}s`)
}
ff.stdin.end();const [code]=await closed;assert.equal(code,0,errors)
const bytes=await readFile(encoded);await writeFile(output,spoofDuration(bytes))
const meta=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',output],{encoding:'utf8'})),v=meta.streams[0]
assert.equal(meta.streams.length,1);assert.equal(v.codec_name,'vp9');assert.equal(+v.nb_read_frames,cycles*FPS*2);assert.equal(v.width,100);assert.equal(v.height,100);assert.equal(+v.tags.alpha_mode,1)
const report={cycles,maxVisibleNumber:cycles+2,seconds:cycles*2,fps:FPS,frames:cycles*FPS*2,bytes:bytes.length,withinTelegramSize:bytes.length<=256*1024,metadataSeconds:+meta.format.duration,font:'Roboto Black',source:'189',file:output}
await writeFile(join(dir,`counter-${cycles}.json`),JSON.stringify(report,null,2)+'\n');console.log(report)
if(report.withinTelegramSize){
 await mkdir(join(ROOT,'exports/emoji'),{recursive:true})
 await writeFile(join(ROOT,'exports/emoji/counting-crowd.webm'),spoofDuration(bytes))
 // Honest duration for local playback/seeking; Telegram upload uses patched file.
 await writeFile(join(dir,'counting-crowd-preview.webm'),bytes)
 await writeFile(join(dir,'result.json'),JSON.stringify(report,null,2)+'\n')
}

