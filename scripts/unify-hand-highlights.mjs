// Recolor the current approved assets in place, preserving any manual geometry fixes.
import assert from 'node:assert/strict'
import{readFile,writeFile,mkdir}from'node:fs/promises'
import{existsSync}from'node:fs'
import{join}from'node:path'
import{HAND_TARGETS,normalizeHandHighlights}from'../packs/blue/lib/hand-highlights.mjs'
import{read,writeTgs,style}from'../packs/blue/lib/silhouette.mjs'
import{ROOT,engine,Canvas,encodePng,load}from'./lib/sheets.mjs'
const {telegramChecks}=await load('src/core/checks.ts')
const backup=join(ROOT,'exports/hand-highlights-before');await mkdir(backup,{recursive:true})
const report=[],eng=await engine(),C=192,featured=['victory-hand','raised-back-of-hand','palms-up-together','finger-ok','heart-hands','middle-finger']
const sheet=new Canvas(C*6,(C+20)*2)
function geometry(x){
 if(!x||typeof x!=='object')return x
 if(Array.isArray(x))return x.map(geometry)
 return Object.fromEntries(Object.entries(x).filter(([k])=>!(['fl','st','gf','gs'].includes(x.ty)&&['c','o','g'].includes(k))).map(([k,v])=>[k,geometry(v)]))
}
for(const name of HAND_TARGETS)for(const dir of ['packs/blue/ready','exports/blue']){
 const relative=`${dir}/${name}.tgs`;if(!existsSync(join(ROOT,relative)))continue
 const folder=join(backup,dir==='exports/blue'?'drafts':'ready'),saved=join(folder,name+'.tgs')
 const current=await read(relative),before=process.argv.includes('--from-backup')&&existsSync(saved)?await read(saved.replace(ROOT+'\\','').replaceAll('\\','/')):current,after=normalizeHandHighlights(before,style)
 assert.deepEqual(geometry(before),geometry(current),'Concurrent geometry change: '+name)
 assert.deepEqual(geometry(after),geometry(before),'Geometry/rig/time changed: '+name)
 assert.deepEqual(normalizeHandHighlights(after,style),after,'Non-idempotent palette: '+name)
 if(JSON.stringify(before)===JSON.stringify(after)){report.push({file:relative,changed:false});continue}
 await mkdir(folder,{recursive:true})
 if(!existsSync(saved))await writeFile(saved,await readFile(join(ROOT,relative)))
 const bytes=await writeTgs(after),checks=telegramChecks(after,bytes.length);assert.ok(checks.every(c=>c.ok),JSON.stringify(checks.filter(c=>!c.ok)))
 await writeFile(join(ROOT,relative),bytes)
 report.push({file:relative,changed:true,bytes:bytes.length,geometryExact:true})
 if(dir==='packs/blue/ready'&&featured.includes(name)){
  const i=featured.indexOf(name),players=[before,after].map(a=>eng.create(JSON.stringify(a)))
  players.forEach((p,row)=>{sheet.text(name.slice(0,22),i*C+3,row*(C+20)+3,[50,50,50]);sheet.draw(p.render(Math.min(90,p.frameCount-1),C,C).slice(),C,i*C,row*(C+20)+20);p.drop()})
 }
}
await writeFile(join(ROOT,'exports/sheets/hand-highlights-comparison.png'),encodePng(sheet.px,sheet.width,sheet.height))
await writeFile(join(ROOT,'exports/hand-highlights-report.json'),JSON.stringify(report,null,2)+'\n')
console.log(`Updated ${report.filter(r=>r.changed).length} hand files; exact geometry/time; common ${style.handHighlight} fills up to ${style.handHighlightOpacity}%`)
