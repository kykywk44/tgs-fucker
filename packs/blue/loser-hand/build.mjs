// L pose from Telegram 145 frame 70, moving with the original 143 rig.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {ROOT,engine,encodePng,Canvas} from '../../../scripts/lib/sheets.mjs'
import {read,at,finish,walk,rgb} from '../lib/silhouette.mjs'
import {addFingerFlex} from './finger-flex.mjs'

const name='loser-hand'
const recipe=JSON.parse(await readFile(join(import.meta.dirname,'recipe.json'),'utf8'))
const poseFrame=recipe.poseFrame
execFileSync(process.execPath,[join(ROOT,'scripts/restyle.mjs'),'blue/'+name],{stdio:'ignore'})
const source=await read(`packs/blue/${name}/source.tgs`)
const blue=await read(`exports/blue/${name}.tgs`)
const motion=await read(`packs/blue/${name}/motion-source.tgs`)
// The broad thumb highlight should match the softer accents of other blue hands.
const highlight=recipe.thumbHighlight
const thumb=blue.layers.find(l=>l.nm===highlight.layer)
const paints=walk(thumb.shapes).filter(p=>p.ty==='fl'&&p.c?.k?.[0]>.5)
assert.equal(paints.length,2)
for(const paint of paints){paint.c={a:0,k:[...rgb(highlight.color),1]};paint.o={a:0,k:highlight.opacity}}
await writeFile(join(ROOT,'exports/sheets/loser-hand/references/blue-145.json'),JSON.stringify(blue))
const scalar=v=>Array.isArray(v)?v[0]:v
function freeze(value) {
  if(!value||typeof value!=='object')return value
  if(Array.isArray(value))return value.map(freeze)
  if(value.s===true&&value.x&&value.y)
    return {a:0,k:[scalar(at(value.x,poseFrame)),scalar(at(value.y,poseFrame)),0]}
  if(typeof value.a==='number'&&'k'in value) {
    if(!value.a)return structuredClone(value)
    let k=at(value,poseFrame)
    if(Array.isArray(k)&&k.length===1)k=k[0]
    return {...value,a:0,k:structuredClone(k)}
  }
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,freeze(v)]))
}
const pose=freeze(blue)
pose.ip=0;pose.op=180
pose.layers=pose.layers.filter(l=>(l.ip??0)<=poseFrame&&poseFrame<(l.op??blue.op))
for(const l of pose.layers){l.ip=0;l.op=180;l.st=0}
pose.nm='145 · L-поза · кадр 70'
await writeFile(join(import.meta.dirname,'pose.json'),JSON.stringify(pose,null,2)+'\n')

const rig=structuredClone(motion.layers.filter(l=>l.ty===3))
assert.deepEqual(rig.map(l=>l.nm),['ULTRA','Null Rotation','Null Up Down'])
const movingPose=structuredClone(pose.layers)
const flex=addFingerFlex(movingPose,motion,recipe.fingerFlex)
await writeFile(join(ROOT,'exports/sheets/loser-hand/finger-flex.json'),JSON.stringify(flex,null,2)+'\n')
const anim={...structuredClone(motion),nm:'L · Loser · 145 + 143',
  assets:[...(pose.assets??[]),{id:'l_pose_145',nm:pose.nm,w:512,h:512,layers:movingPose}],
  layers:[...rig,{ddd:0,ind:100,ty:0,nm:'L · 145 frame 70',refId:'l_pose_145',parent:4,sr:1,
    ks:{o:{a:0,k:100},r:{a:0,k:0},a:{a:0,k:[...recipe.placement.anchor,0]},
      p:{a:0,k:[...recipe.placement.position,0]},s:{a:0,k:[recipe.placement.scale,recipe.placement.scale,100]}},
    ao:0,w:512,h:512,ip:0,op:180,st:0,bm:0}],
}
await finish(name,source,anim,[0,25,36,44,55,67,76,84,93,113,128,179])
await writeFile(join(import.meta.dirname,'drawing.json'),JSON.stringify(anim,null,2)+'\n')
const eng=await engine(),player=eng.create(JSON.stringify(anim)),flat=eng.create(JSON.stringify(pose))
await writeFile(join(ROOT,'exports/sheets/loser-hand/pose.png'),encodePng(flat.render(0,1024,1024).slice(),1024,1024))
await writeFile(join(ROOT,'exports/sheets/loser-hand/static.png'),encodePng(player.render(0,1024,1024).slice(),1024,1024))
const preview=new Canvas(512,512)
preview.draw(player.render(0,512,512).slice(),512,0,0)
await writeFile(join(ROOT,'exports/sheets/loser-hand/checker.png'),encodePng(preview.px,512,512))
player.drop();flat.drop()
