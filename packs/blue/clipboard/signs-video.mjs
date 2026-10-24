// Eight user-supplied SVG signs on the approved six-second clipboard.
// node packs/blue/clipboard/signs-video.mjs --six
import assert from 'node:assert/strict'
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {execFileSync,spawn} from 'node:child_process'
import {once} from 'node:events'
import {read,baked} from '../lib/silhouette.mjs'
import {ROOT,engine,Canvas,encodePng} from '../../../scripts/lib/sheets.mjs'
import {boardProjection,bakeSourceLayer,turn,LONG} from './scene.mjs'
import {spoofDuration} from '../../../scripts/spoof-webm-duration.mjs'
assert.ok(LONG,'Use --six')
const dir=join(ROOT,'exports/clipboard-signs'),input=join(ROOT,'packs/blue/signs')
await mkdir(dir,{recursive:true})
// python-lottie already supplies our SVG importer; preserve all Bézier paths.
execFileSync(join(ROOT,'.venv/Scripts/python.exe'),['-c',
 'from lottie.importers.svg import import_svg;import pathlib,json,sys;p=pathlib.Path(sys.argv[1]);o=pathlib.Path(sys.argv[2]);[(o/(f.stem+".json")).write_text(json.dumps(import_svg(str(f)).to_dict()),encoding="utf-8") for f in sorted(p.glob("*.svg"))]',input,dir])
const source=await read('packs/blue/clipboard/source-193.tgs'),master=await read('exports/blue/clipboard-6s-preview.tgs')
assert.equal(master.op,360)
const board=boardProjection(source),eng=await engine(),sheet=new Canvas(512*4,532*2),manifest=[]
const files=(await readdir(input)).filter(f=>f.endsWith('.svg')).sort()
const onlyNew=process.argv.includes('--only-new')
const previous=onlyNew?JSON.parse(await readFile(join(dir,'manifest.json'),'utf8')):[]
for(const [index,file] of files.entries()){
 const existing=previous.find(item=>item.svg===file)
 if(existing){manifest.push(existing);continue}
 const svg=JSON.parse(await readFile(join(dir,file.replace('.svg','.json')),'utf8'))
 const anim=structuredClone(master),ink=[]
 for(const [j,l] of svg.layers.entries())if(l.ty===4){
  // bakeSourceLayer passes the frame as a separate projection argument.
  const actual=bakeSourceLayer(svg.layers,l,(q,f)=>board.front([-.82+1.64*q[0]/svg.w,-.75+1.64*q[1]/svg.w],f),()=>0)
  actual.ind=100+j;actual.ip=0;actual.op=360;actual.nm=`Надпись ${index+1}`
  actual.ks.o=baked(f=>[turn(f)>=.5?100:0],360)
  ink.push(actual)
 }
 assert.ok(ink.length)
 anim.assets[0].layers.splice(1,0,...ink)
 const player=eng.create(JSON.stringify(anim));assert.ok(player)
 const name=`${String(index+1).padStart(2,'0')}-${file.replace(/\D/g,'')||'sign'}`
 const preview=player.render(264,512,512).slice()
 await writeFile(join(dir,name+'.png'),encodePng(preview,512,512))
 sheet.text(`f ${index+1}`,index%4*512+4,Math.floor(index/4)*532+3,[50,50,50])
 sheet.draw(preview,512,index%4*512,Math.floor(index/4)*532+20)
 assert.deepEqual(player.render(0,128,128).slice(),player.render(359,128,128).slice(),'Loop seam')
 const output=join(dir,name+'.webm'),encoded=join(dir,name+'.encoded.webm')
 for(const crf of [35,39,43]){
  const ff=spawn('ffmpeg',['-hide_banner','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgba','-s','512x512','-r','30','-i','pipe:0','-an','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-b:v','0','-crf',String(crf),'-deadline','good','-cpu-used','2',encoded],{windowsHide:true,stdio:['pipe','ignore','pipe']})
  let errors='';ff.stderr.on('data',b=>{errors+=b});const closed=once(ff,'close')
  for(let f=0;f<360;f+=2){const px=Buffer.from(player.render(f,512,512));if(!ff.stdin.write(px))await once(ff.stdin,'drain')}
  ff.stdin.end();const [code]=await closed;assert.equal(code,0,errors)
  const bytes=await readFile(encoded)
  if(bytes.length<=256*1024){await writeFile(output,spoofDuration(bytes));break}
 }
 player.drop()
 const bytes=await readFile(output);assert.ok(bytes.length<=256*1024)
 const meta=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',output],{encoding:'utf8'})),v=meta.streams[0]
 assert.equal(meta.streams.length,1);assert.equal(v.codec_name,'vp9');assert.equal(+v.nb_read_frames,180)
 assert.equal(v.width,512);assert.equal(v.height,512);assert.equal(+v.tags.alpha_mode,1)
 manifest.push({number:index+1,svg:file,file:name+'.webm',bytes:bytes.length,frames:180,fps:30,realSeconds:6,metadataSeconds:+meta.format.duration})
 console.log(`${index+1}/${files.length}: ${file} → ${bytes.length} bytes`)
}
if(!onlyNew&&files.length<=8)await writeFile(join(dir,'comparison.png'),encodePng(sheet.px,sheet.width,sheet.height))
await writeFile(join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n')
