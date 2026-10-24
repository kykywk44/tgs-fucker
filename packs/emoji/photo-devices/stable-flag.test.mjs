import {it,expect} from 'vitest'
import {flagGrid} from './stable-flag.mjs'
it('keeps the photo mesh unfolded through the whole loop',()=>{
 for(let f=0;f<180;f++){
  const g=flagGrid(f)
  for(let y=0;y<12;y++)for(let x=0;x<24;x++){
   const a=g[y][x],b=g[y][x+1],c=g[y+1][x+1],d=g[y+1][x]
   const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])
   expect(cross(a,b,c)).toBeGreaterThan(200)
   expect(cross(a,c,d)).toBeGreaterThan(200)
  }
 }
})
it('has a seamless loop and no sudden frame jumps',()=>{
 const first=flagGrid(0),last=flagGrid(180)
 for(let f=0;f<180;f++){
  const a=flagGrid(f),b=flagGrid(f+1)
  for(let y=0;y<13;y++)for(let x=0;x<25;x++){
   expect(Math.hypot(a[y][x][0]-b[y][x][0],a[y][x][1]-b[y][x][1])).toBeLessThan(1)
   if(f===0)expect(Math.hypot(first[y][x][0]-last[y][x][0],first[y][x][1]-last[y][x][1])).toBeLessThan(1e-10)
  }
 }
})
