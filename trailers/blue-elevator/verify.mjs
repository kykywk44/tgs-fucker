import assert from 'node:assert/strict'
import {cfg,cabin,pose,skin,fingerGesture,headBeat} from './rig.mjs'
const N=cfg.seconds*cfg.fps,dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
assert.deepEqual(cabin(0),cabin(cfg.seconds))
assert(cfg.actors[2].mirror&&!cfg.actors[3].mirror)
let jacobian=Infinity,maxJump=0,relativeHead=0,relativeArm=0,headStretch=0,chestStretch=0,armStretch=0
for(let ai=0;ai<4;ai++){
 assert.deepEqual(pose(ai,0),pose(ai,N))
 for(let n=0;n<N;n++){
  const m=pose(ai,n),next=pose(ai,n+1)
  for(const pt of [[246,125],[246,390],[80,730],[412,730]])maxJump=Math.max(maxJump,dist(skin(pt,m),skin(pt,next)))
  relativeHead=Math.max(relativeHead,Math.abs(m.head));relativeArm=Math.max(relativeArm,Math.abs(m.armL-m.armR))
  headStretch=Math.max(headStretch,Math.abs(dist(skin([200,120],m),skin([290,120],m))-90))
  chestStretch=Math.max(chestStretch,Math.abs(dist(skin([190,390],m),skin([300,390],m))-110))
  armStretch=Math.max(armStretch,Math.abs(dist(skin([60,720],m),skin([90,720],m))-30),Math.abs(dist(skin([390,720],m),skin([420,720],m))-30))
  if(n%12)continue
  for(let y=40;y<790;y+=25)for(let x=50;x<440;x+=25){
   const a=skin([x,y],m),b=skin([x+.1,y],m),c=skin([x,y+.1],m)
   jacobian=Math.min(jacobian,((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/.01)
  }
 }
}
// This grid includes the transparent gap between arm and torso; it can compress
// as the arm approaches, but must never invert. Filled part rigidity is separate.
assert(jacobian>0,`Folded skin: ${jacobian}`)
assert(maxJump<4,`Motion jump: ${maxJump}`)
assert(relativeHead>.1&&relativeArm>.3&&relativeArm<1.5,'Arms should stay subtly alive')
assert(headStretch<.01&&chestStretch<.01,'Head/torso should stay rigid')
assert(armStretch<.01,'Forearms should retain their width')
for(let n=0;n<N;n++){
 const m=pose(3,n),rest={...m,fingers:0}
 for(const pt of [[105,795],[108,802],[80,760],[80,650],[190,820]]){
  assert(dist(skin(pt,m),skin(pt,rest))<1e-10,'Thumb, palm, forearm or thigh moved with fingers')
 }
 if(n<21||n>=153)assert(Math.abs(fingerGesture(n).angle)<1e-12)
}
assert(headBeat(8.3*cfg.fps)>.99)
assert(headBeat(0)===0&&headBeat(9.2*cfg.fps)===0)
const neutral={trunk:0,head:0,armL:0,armR:0,foreL:0,foreR:0,vertical:0,breath:0,fingers:0}
assert(dist(skin([80,835],neutral),[80,835])<1e-10,'Left fingers elongated')
assert(dist(skin([410,835],neutral),[410,835])<1e-10,'Right fingers elongated')
assert(skin([200,863],neutral)[1]>950,'Thigh continuation lost')
const vibration=Array.from({length:600},(_,n)=>Math.abs(cabin((n+1)/60).y-cabin(n/60).y))
assert(Math.max(...vibration)<.35,'Cabin vibration should be calm')
assert(vibration.reduce((a,b)=>a+b,0)/vibration.length>.015,'Cabin must keep moving')
console.log(JSON.stringify({periodic:true,skin_min_jacobian:jacobian,max_joint_travel_per_frame:maxJump,head_stretch:headStretch,chest_stretch:chestStretch,arm_width_stretch:armStretch,independent_arms:relativeArm,camera_peak_travel_per_frame:Math.max(...vibration),camera_mean_travel_per_frame:vibration.reduce((a,b)=>a+b,0)/vibration.length},null,2))
