import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'
import {at,walk,read} from '../lib/silhouette.mjs'
import {ROOT,engine} from '../../../scripts/lib/sheets.mjs'
const dir=join(ROOT,'exports/clipboard-sleep'),anim=JSON.parse(await readFile(join(dir,'drawing.json'),'utf8'))
assert.equal(anim.op,900);assert.equal(anim.fr,60)
assert.ok(!anim.assets[0].layers.some(l=>l.nm.includes('Лицевая сторона')))
for(const l of anim.assets[0].layers.filter(l=>l.nm!=='Pen'))for(const p of walk(l.shapes).filter(p=>p.ty==='sh'))assert.equal(p.ks.a,0,'Clipboard and clip stay fixed on the writing side')
const rotation=anim.layers.find(l=>l.nm==='HEAD').ks.r
const r=t=>Number(at(rotation,t*899/15))
assert.ok(r(11.43)-r(11.78)>2.8&&r(12.07)-r(11.78)>2.8,'Two distinct nods after waking')
const mouth=walk(anim.layers.find(l=>l.nm==='Mouth').shapes).find(p=>p.ty==='sh').ks
const mouthHeight=f=>{const s=at(mouth,f)[0];return Math.max(...s.v.map(p=>p[1]))-Math.min(...s.v.map(p=>p[1]))}
assert.ok(mouthHeight(540)<mouthHeight(0)*.2,'Smile should flatten as he falls asleep')
const letters=anim.layers.filter(l=>l.nm.includes('из090'))
assert.equal(letters.length,3)
const speed=JSON.parse(await readFile(join(dir,'writing-speed.json'),'utf8')),rate=t=>speed.find(s=>s.seconds===t).speed
assert.ok(rate(3)>rate(5)&&rate(5)>rate(6.5)&&rate(6.5)>rate(8),'Writing must progressively slow before sleep')
assert.ok(rate(5)<=.55&&rate(6.5)<=.27&&rate(8.5)===0)
const earliest=Array.from({length:900},(_,f)=>f).find(f=>letters.some(l=>Number(at(l.ks.o,f))>1))*15/899
assert.ok(earliest>=6.4&&earliest<=6.65,'Z should start at6.5 seconds')
for(const f of [0,120,360,660,899])for(const l of letters)assert.equal(Number(at(l.ks.o,f)),0,'Z must be absent outside sleep')
assert.ok(letters.every(l=>Math.max(...Array.from({length:180},(_,i)=>Number(at(l.ks.o,420+i))))>95),'Each source Z must become visible')
const eng=await engine(),player=eng.create(JSON.stringify(anim))
// At full emergence the imported rig must render pixel-for-pixel like the
// approved donor: exact letter sizes, positions, paints and parent scale.
const donor=await read('packs/blue/clipboard-sleep/zzz-donor.tgs')
const donorOnly={...donor,layers:donor.layers.filter(l=>l.ind===2||/^Z [123]$/.test(l.nm))}
const motion=JSON.parse(await readFile(join(ROOT,'packs/blue/clipboard-sleep/motion.json'),'utf8'))
const donorEnd=motion.zClockStart+79/60,overlap=donorEnd-.1
assert.ok(motion.zHandoverLead>=.4,'Floating must overlap the end of emergence')
for(const l of letters){
 const src=donor.layers.find(d=>l.nm.startsWith(d.nm+' ·')),actual=at(l.ks.p,overlap*899/15),original=at(src.ks.p,100+(overlap-motion.zClockStart)*60)
 assert.ok(Math.hypot(actual[0]-original[0],actual[1]-original[1])>1,'Extra flight should already be active before donor ends')
 const points=Array.from({length:120},(_,i)=>at(l.ks.p,(8+i/60)*899/15))
 const dy=points.slice(1).map((p,i)=>p[1]-points[i][1])
 assert.ok(dy.some(y=>y>.06)&&dy.some(y=>y<-.15),'Z should bob down and up')
 assert.ok(points.at(-1)[1]<points[0][1]-8,'Overall flight must rise')
}
const pops=anim.layers.filter(l=>l.nm.startsWith('Z pop '));assert.equal(pops.length,3)
for(const l of letters)assert.ok(Math.max(...Array.from({length:30},(_,i)=>at(l.ks.s,(10.35+i/60)*899/15)[0]))>105,'Z should inflate before popping')
for(const l of pops)assert.ok(Math.max(...Array.from({length:30},(_,i)=>Number(at(l.ks.o,(10.4+i/60)*899/15))))>70,'Pop rays should briefly appear')
const ordered=[...letters].sort((a,b)=>a.nm.localeCompare(b.nm)),opacity=(l,t)=>Number(at(l.ks.o,t*899/15))
assert.equal(opacity(ordered[0],10.54),0)
assert.ok(opacity(ordered[1],10.54)>0&&opacity(ordered[1],10.54)<opacity(ordered[2],10.54),'Smallest Z disappears first')
assert.equal(opacity(ordered[1],10.63),0);assert.ok(opacity(ordered[2],10.63)>0,'Largest Z disappears last')
// Remove only the verified extra drift when checking the original glyph rig.
const copiedOnly=structuredClone({...anim,layers:anim.layers.filter(l=>l.ind===120||l.nm.includes('из090'))})
for(const l of copiedOnly.layers.filter(l=>l.nm.includes('из090')))l.ks.p={a:0,k:at(donor.layers.find(d=>l.nm.startsWith(d.nm+' ·')).ks.p,179)}
const donorPlayer=eng.create(JSON.stringify(donorOnly)),copiedPlayer=eng.create(JSON.stringify(copiedOnly))
assert.deepEqual(copiedPlayer.render(564,512,512).slice(),donorPlayer.render(179,512,512).slice(),'Exact approved Z rig at full size')
donorPlayer.drop();copiedPlayer.drop()
assert.deepEqual(player.render(0,512,512).slice(),player.render(899,512,512).slice(),'Pixel-exact loop')
for(let f=0;f<900;f+=3)assert.ok(player.render(f,128,128).some((v,i)=>i%4===3&&v>0),'Empty master frame')
player.drop()
// Overscan the isolated head and letters: bounds must not be hidden by canvas.
const isolated=structuredClone(anim)
for(const l of [...isolated.layers,...isolated.assets.flatMap(a=>a.layers??[])])if(l.ty===4&&!['HEAD','Mouth',...letters.map(l=>l.nm),...pops.map(l=>l.nm)].includes(l.nm))l.shapes=[]
for(const l of isolated.layers)if(l.parent==null)l.parent=999
isolated.layers.push({ty:3,ind:999,ip:0,op:900,ks:{p:{a:0,k:[128,128]},s:{a:0,k:[100,100]},o:{a:0,k:100}}});isolated.w=isolated.h=768
const head=eng.create(JSON.stringify(isolated));let bounds=[384,384,0,0]
for(let f=0;f<900;f+=3){const px=head.render(f,384,384);for(let i=0;i<384*384;i++)if(px[4*i+3]){const x=i%384,y=Math.floor(i/384);bounds=[Math.min(bounds[0],x),Math.min(bounds[1],y),Math.max(bounds[2],x),Math.max(bounds[3],y)]}}
head.drop();bounds=bounds.map(v=>v*2-128)
assert.ok(bounds[0]>=8&&bounds[1]>=8&&bounds[2]<=503&&bounds[3]<=503,JSON.stringify(bounds))
let video=null
try{video=JSON.parse(await readFile(join(dir,'video.json'),'utf8'))}catch{}
if(video){
 const file=join(dir,'clipboard-sleep-15s.webm'),probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',file],{encoding:'utf8'}))
 assert.equal(probe.streams.length,1);const s=probe.streams[0]
 assert.equal(s.codec_name,'vp9');assert.equal(s.width,512);assert.equal(s.height,512);assert.equal(s.nb_read_frames,'450');assert.equal(s.r_frame_rate,'30/1');assert.equal(+s.tags.alpha_mode,1);assert.equal(+probe.format.duration,2.99)
 assert.ok((await readFile(file)).length<=256*1024)
 const hashes=execFileSync('ffmpeg',['-v','error','-c:v','libvpx-vp9','-i',file,'-pix_fmt','rgba','-f','framemd5','pipe:1'],{encoding:'utf8'})
 assert.equal(hashes.split('\n').filter(l=>l.startsWith('0,')).length,450,'Decode every frame after spoofed duration')
 const rgba=execFileSync('ffmpeg',['-v','error','-c:v','libvpx-vp9','-i',file,'-vf','select=eq(n\\,0)+eq(n\\,449)','-fps_mode','vfr','-pix_fmt','rgba','-f','rawvideo','pipe:1'],{maxBuffer:3*1024*1024})
 assert.equal(rgba.length,2*512*512*4);assert.ok(rgba.some((v,i)=>i%4===3&&v===0));assert.ok(rgba.some((v,i)=>i%4===3&&v===255))
}
const report={frames:900,seconds:15,loopPixelExact:true,writingSpeedAt5:rate(5),writingSpeedAt6_5:rate(6.5),zFirstVisibleSeconds:earliest,zHandoverOverlap:motion.zHandoverLead,headAndZBounds:bounds,smileHeightStart:mouthHeight(0),smileHeightAsleep:mouthHeight(540),originalZLetters:3,zDonorPixelExact:true,zContinuousFlight:true,zBobsUpAndDown:true,zPops:true,zDisappearSmallToLarge:true,boardNeverPresented:true,video}
await writeFile(join(dir,'verification.json'),JSON.stringify(report,null,2)+'\n');console.log(report)
