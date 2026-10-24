// Fixed random seed makes the approved editorial rhythm reproducible.
export const fps=60,width=1920,height=360,iconSize=300
export const durations=[.8,.68,.56,.46,.36,.29,.23,.18,.14,.11,.085,.067,.05,.05,.05,.05,.05,.05,.05,.05,.05,.067,.085,.11,.15,.21,.30,.44,.65]
export function timeline(pool){
 let seed=24102026,last='',t=1.45
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32}
 const segments=[{name:'n-bubble',start:0,end:t,kind:'intro'}]
 const append=(name,duration,kind,sourceStart=0)=>{
  const end=Math.round((t+duration)*fps)/fps
  segments.push({name,start:t,end,kind,sourceStart});t=end;last=name
 }
 append('facepalm',.8,'opening',124)
 append('identification-card',.68,'opening',0)
 append('partying-face',.56,'opening',0)
 const reserved=new Set(['facepalm','identification-card','partying-face','coffin','screaming-face','technologist-bust','family'])
 const middle=pool.filter(name=>!reserved.has(name))
 if(middle.length<2)throw new Error('Carousel needs at least two middle stickers')
 for(const duration of durations.slice(3,21)){
  let name
  do name=middle[Math.floor(random()*middle.length)];while(name===last)
  const phase=Math.floor(random()*80)
  append(name,duration,'random');segments.at(-1).phase=phase
 }
 append('coffin',.20,'ending',70)
 append('screaming-face',.35,'ending',0)
 append('technologist-bust',.60,'ending',64)
 append('family',.95,'ending',0)
 const flagStart=t
 segments.push({name:'n-flag',start:t,end:t+3,kind:'flag'});t+=3
 segments.push({name:'n-flag',start:t,end:t+.2,kind:'exit'});t+=.2
 const frames=Math.ceil(t*fps/2)*2,seconds=frames/fps
 return {fps,width,height,iconSize,frames,seconds,flagStart,segments}
}
