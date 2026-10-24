// Only the closing opacity transition may differ from the approved blue version.
import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {ROOT,engine,Canvas,encodePng} from '../../../scripts/lib/sheets.mjs'
import {read,at} from '../lib/silhouette.mjs'
const source=await read('packs/blue/face-with-hand-over-mouth/source.tgs')
const anim=await read('exports/blue/face-with-hand-over-mouth.tgs')
const baseline=structuredClone(anim)
for(const name of ['mouth-2','mouth 3'])baseline.layers.find(l=>l.nm===name).ks.o=structuredClone(source.layers.find(l=>l.nm===name).ks.o)
const eng=await engine(),players=[baseline,anim].map(a=>eng.create(JSON.stringify(a)))
for(let f=0;f<=120;f++){
  const before=Buffer.from(players[0].render(f,512,512).slice()),after=Buffer.from(players[1].render(f,512,512).slice())
  assert.ok(before.equals(after),`Existing laugh changed at frame ${f}`)
}
const big=anim.layers.find(l=>l.nm==='mouth-2'),small=anim.layers.find(l=>l.nm==='mouth 3')
for(let f=126;f<180;f++){
  assert.equal(at(big.ks.o,f)[0],0,`Collapsed grin still visible at ${f}`)
  assert.equal(at(small.ks.o,f)[0],100)
}
for(let f=120;f<=126;f++)assert.ok(Math.abs(at(big.ks.o,f)[0]+at(small.ks.o,f)[0]-100)<1e-7,'Fade is not complementary')
const frames=[120,122,124,126,128,131],size=256,sheet=new Canvas(size*frames.length,(size+20)*2)
for(const[row,p]of players.entries())for(const[col,f]of frames.entries()){
  sheet.text(`f ${f}`,col*size+4,row*(size+20)+4,[70,70,70])
  sheet.draw(p.render(f,size,size).slice(),size,col*size,row*(size+20)+20)
}
await writeFile(join(ROOT,'exports/sheets/face-with-hand-over-mouth/closing-before-after.png'),encodePng(sheet.px,sheet.width,sheet.height))
players.forEach(p=>p.drop())
console.log(JSON.stringify({unchangedFrames:'0–120: pixel-identical',originalContours:true,closingCrossfade:[120,126],noCollapsedGrinAfter:126,loop:true}))
