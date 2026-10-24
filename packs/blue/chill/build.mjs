// Palette-only variant of chillstick.tgs. Original geometry and timing stay exact.
import assert from 'node:assert/strict'
import{writeFile}from'node:fs/promises'
import{read,rgb,finish}from'../lib/silhouette.mjs'
const source=await read('packs/blue/chill/source.tgs'),anim=structuredClone(source)
anim.nm='Синий · Chill'
const ramp=[[0,'#233d58'],[.16,'#335375'],[.35,'#44688b'],[.55,'#6086a7'],[.76,'#7ba3c3'],[.9,'#a5d6ea'],[1,'#ffffff']].map(([t,c])=>[t,rgb(c)])
const recolor=c=>{
 const [r,g,b]=c,max=Math.max(r,g,b),min=Math.min(r,g,b)
 if(max-min<.025||b<r*.65||b<g*1.12)return c
 const y=.2126*r+.7152*g+.0722*b
 const i=Math.max(1,ramp.findIndex(([t])=>t>=y)),[a,lo]=ramp[i-1],[z,hi]=ramp[i],u=(y-a)/(z-a)
 return[...lo.map((v,j)=>v+(hi[j]-v)*u),...c.slice(3)]
}
const property=(p,fn)=>{if(!p.a)p.k=fn(p.k);else for(const k of p.k)for(const key of ['s','e'])if(k[key])k[key]=fn(k[key])}
let paints=0
function visit(x){
 if(!x||typeof x!=='object')return
 if(['fl','st'].includes(x.ty)&&x.c){property(x.c,recolor);paints++}
 if(['gf','gs'].includes(x.ty)&&x.g){property(x.g.k,values=>{const out=[...values];for(let i=0;i<x.g.p;i++)out.splice(i*4+1,3,...recolor(values.slice(i*4+1,i*4+4)));return out});paints++}
 for(const [k,v]of Object.entries(x))if(!['c','g'].includes(k)&&v&&typeof v==='object')if(Array.isArray(v))v.forEach(visit);else visit(v)
}
for(const l of anim.layers){
 // Water drops stay exact; neutral/cyan chrome reflections are outside the
 // recolour range, while violet edging and magenta sparks join the blue palette.
 if(l.nm.startsWith('drop'))continue
 visit(l)
}
assert.ok(paints>0)
await finish('chill',source,anim,[0,16,32,48,65,81,97,113,130,146,162,179])
await writeFile('packs/blue/chill/drawing.json',JSON.stringify(anim)+'\n')
console.log('Recoloured paint properties:',paints)
