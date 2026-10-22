// Confirm the selected Telegram pose and the unmodified Victory Hand motion rig.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {ROOT,engine} from '../../../scripts/lib/sheets.mjs'
import {read,walk,at,transform,mul,point} from '../lib/silhouette.mjs'
const dir=import.meta.dirname
const recipe=JSON.parse(await readFile(join(dir,'recipe.json'),'utf8'))
const source=await read('packs/blue/loser-hand/source.tgs')
const motion=await read('packs/blue/loser-hand/motion-source.tgs')
for(const [file,id]of [['source.tgs','145'],['motion-source.tgs','143']])
  assert.deepEqual(await readFile(join(dir,file)),await readFile(join(ROOT,`library/emoji/${id}.tgs`)))
const pose=JSON.parse(await readFile(join(dir,'pose.json'),'utf8'))
const blue=JSON.parse(await readFile(join(ROOT,'exports/sheets/loser-hand/references/blue-145.json'),'utf8'))
const anim=await read('exports/blue/loser-hand.tgs')
assert.deepEqual(anim.layers.filter(l=>l.ty===3),motion.layers.filter(l=>l.ty===3),'Motion rig differs from 143')
const movingPose=anim.assets.find(a=>a.id==='l_pose_145').layers
const indexMotion=walk(motion.layers.find(l=>l.nm==='Index 4').shapes).find(x=>x.ty==='sh').ks
const allowed=new Set(['Thumb 3','Palm Index Shad','Thumb Shad','Thumb Down Shad 2','Index stroke','Index fill shad light','Palm Fill'])
let animatedPaths=0
for(const layer of movingPose) {
  const base=pose.layers.find(l=>l.ind===layer.ind)
  assert.deepEqual({...layer,shapes:undefined},{...base,shapes:undefined},'Changed a finger joint or layer rig')
  if(!allowed.has(layer.nm)){assert.deepEqual(layer,base);continue}
  const p=walk(layer.shapes).filter(x=>x.ty==='sh'),q=walk(base.shapes).filter(x=>x.ty==='sh')
  assert.deepEqual(walk(layer.shapes).filter(x=>x.ty!=='sh'),walk(base.shapes).filter(x=>x.ty!=='sh'),'Changed shading or group transforms')
  assert.equal(p.length,q.length)
  for(let n=0;n<p.length;n++) {
    if(!p[n].ks.a){assert.deepEqual(p[n],q[n]);continue}
    animatedPaths++
    assert.deepEqual(p[n].ks.k.map(({s,e,...key})=>key),indexMotion.k.map(({s,e,...key})=>key),'Finger timing differs from 143')
    for(const frame of [0,180]) {
      const shape=at(p[n].ks,frame)[0]
      for(const key of ['v','i','o'])for(let j=0;j<shape[key].length;j++)for(let d=0;d<2;d++)
        assert.ok(Math.abs(shape[key][j][d]-q[n].ks.k[key][j][d])<=.0011,'Rest pose or attachment changed')
    }
  }
}
assert.equal(animatedPaths,21)
function tip(layerName,groupName,vertex,frame) {
  const layer=movingPose.find(l=>l.nm===layerName),g=layer.shapes.find(g=>g.nm===groupName)
  const prop=walk([g]).find(x=>x.ty==='sh').ks
  const shape=prop.a?at(prop,frame)[0]:prop.k
  return point(mul(transform(layer.ks,0),transform(g.it.find(x=>x.ty==='tr'),0)),shape.v[vertex])
}
const delta=(a,b)=>a.map((v,d)=>v-b[d])
const indexDelta=delta(tip('Index stroke','Stroke Main',3,36),tip('Index stroke','Stroke Main',3,0))
const thumbDelta=delta(tip('Thumb 3','Stroke 4',4,36),tip('Thumb 3','Stroke 4',4,0))
const originalDelta=delta(at(indexMotion,36)[0].v[2],at(indexMotion,0)[0].v[2])
for(let d=0;d<2;d++)assert.ok(Math.abs(indexDelta[d]-originalDelta[d])<.002,'Index motion amplitude differs from 143')
const thumbRatio=Math.hypot(...thumbDelta)/Math.hypot(...indexDelta)
assert.ok(thumbRatio>.28&&thumbRatio<.31,'Thumb should flex much less than the index')
assert.deepEqual(pose.layers.map(l=>l.ind),source.layers.filter(l=>l.ip<=recipe.poseFrame&&recipe.poseFrame<l.op).map(l=>l.ind),'Inactive pose layers were included')
function staticProperties(x) {
  if(!x||typeof x!=='object')return
  assert.notEqual(x.a,1,'A finger or a paint is still animating')
  for(const v of Object.values(x))staticProperties(v)
}
staticProperties(pose)
const eng=await engine(),original=eng.create(JSON.stringify(blue)),frozen=eng.create(JSON.stringify(pose))
const a=original.render(recipe.poseFrame,512,512).slice(),b=frozen.render(0,512,512).slice()
let channels=0,maxError=0,visibleError=0
for(let i=0;i<a.length;i++)if(a[i]!==b[i]){channels++;maxError=Math.max(maxError,Math.abs(a[i]-b[i]))}
for(let i=0;i<a.length;i+=4) {
  visibleError=Math.max(visibleError,Math.abs(a[i+3]-b[i+3]))
  for(let c=0;c<3;c++)visibleError=Math.max(visibleError,Math.abs(a[i+c]*a[i+3]/255-b[i+c]*b[i+3]/255))
}
// tlottie's spatial interpolation and the evaluator can differ at subpixel AA boundaries.
assert.ok(channels<=24&&visibleError<=2,`Frozen pose differs: ${channels} channels, visible error ${visibleError}`)
original.drop();frozen.drop()
const player=eng.create(JSON.stringify(anim)),first=player.render(0,512,512).slice()
assert.equal(player.frameCount,180)
let margin=512,movingFrames=0
for(let f=0;f<180;f++) {
  const px=player.render(f,512,512).slice()
  if(px.some((v,i)=>v!==first[i]))movingFrames++
  for(let y=0;y<512;y++)for(let x=0;x<512;x++)if(px[(y*512+x)*4+3]>0)
    margin=Math.min(margin,x,y,511-x,511-y)
}
player.drop()
assert.ok(margin>=8,`Hand too close to canvas: ${margin}`)
assert.ok(movingFrames>160,'Hand is not rocking')
const report={source:'145',poseFrame:recipe.poseFrame,poseAntialiasDifferenceChannels:channels,maxVisibleChannelError:visibleError,
  animatedFingerPaths:animatedPaths,indexTipDisplacement:indexDelta,thumbTipDisplacement:thumbDelta,thumbRatio,
  motion:'143',originalRig:true,frames:180,movingFrames,minimumMarginPx:margin}
await writeFile(join(ROOT,'exports/sheets/loser-hand/pose-motion-verification.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
