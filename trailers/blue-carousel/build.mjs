import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises'
import {join} from 'node:path'
import {gunzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {spawn,execFileSync} from 'node:child_process'
import {ROOT,engine,encodePng,Canvas} from '../../scripts/lib/sheets.mjs'
import {timeline} from './timeline.mjs'
const ready=join(ROOT,'packs/blue/ready'),out=join(ROOT,'exports/blue-carousel')
await mkdir(out,{recursive:true});await mkdir(join(out,'stages'),{recursive:true})
const names=(await readdir(ready)).filter(f=>f.endsWith('.tgs')).map(f=>f.slice(0,-4))
const pool=names.filter(n=>!['n-bubble','n-flag'].includes(n)&&!n.toLowerCase().includes('skibidi'))
const timing=timeline(pool);assert(timing.segments.every(s=>!s.name.includes('skibidi')))
const eng=await engine(),players=new Map(),assetHashes={}
for(const name of new Set(timing.segments.map(s=>s.name))){
 const bytes=await readFile(join(ready,name+'.tgs'));assetHashes[name]=createHash('sha256').update(bytes).digest('hex')
 const a=JSON.parse(gunzipSync(bytes)),r=eng.create(JSON.stringify(a));assert(r)
 players.set(name,{r,frames:a.op-a.ip})
}
// Render exact native sticker frames on square stages. Entry/exit transforms
// are applied to the whole stage later, leaving all original sticker rigs intact.
const frameInfo=[]
for(let n=0;n<timing.frames;n++){
 const t=n/60,s=timing.segments.find(s=>n>=Math.round(s.start*60)&&n<Math.round(s.end*60))??timing.segments.at(-1)
 const local=(n-Math.round(s.start*60))/60,p=players.get(s.name)
 let f
 if(s.kind==='intro')f=Math.min(179,Math.round(t*60))
 else if(s.kind==='flag')f=Math.min(179,Math.floor(local*60+1e-6))
 else if(s.kind==='exit')f=179
 else if(s.kind==='opening'||s.kind==='ending')f=Math.min(p.frames-1,s.sourceStart+Math.floor(local*60+1e-6))
 else f=(Math.floor(local*60)+(s.phase??0))%p.frames
 const px=p.r.render(f,360,360)
 await writeFile(join(out,'stages',`${String(n).padStart(4,'0')}.png`),encodePng(px,360,360))
 frameInfo.push({n,name:s.name,kind:s.kind,local,sourceFrame:f})
}
for(const p of players.values())p.r.drop()
await writeFile(join(out,'timeline.json'),JSON.stringify({...timing,pool,assetHashes,frameInfo},null,2))
console.log(`${timing.frames} native frames; ${timing.seconds.toFixed(2)}s; ${pool.length} eligible stickers; flag plays once`)
execFileSync('python',[join(import.meta.dirname,'compose.py')],{stdio:'inherit'})
