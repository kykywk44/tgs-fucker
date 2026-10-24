// 584: original lid/flowers/rig, neutral grey coffin, a reclining blue silhouette.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {read,walk,finish} from '../lib/silhouette.mjs'
import {recliningPerson,clipAtInnerWall} from './person.mjs'
const name='coffin',dir=import.meta.dirname,cfg=JSON.parse(await readFile(join(dir,'recipe.json'),'utf8'))
const source=await read(`packs/blue/${name}/source.tgs`),anim=structuredClone(source)
anim.nm=cfg.name
const grey=c=>{
  const l=.2126*c[0]+.7152*c[1]+.0722*c[2],v=Math.min(1,.02+.98*l**.88)
  return [v,v,v,c[3]??1]
}
function recolor(p,fn){
  if(!p.a)p.k=fn(p.k)
  else for(const k of p.k)for(const x of ['s','e'])if(k[x])k[x]=fn(k[x])
}
for(const l of anim.layers){
  // Petals and stems keep their original colours; the wood, lining, handles,
  // band and flower shadows become neutral without flattening their materials.
  if(['Group 3','Group 4','Group 5','Group 7','Group 8','Group 9'].includes(l.nm))continue
  for(const p of walk(l.shapes??[])){
    if(p.c)recolor(p.c,grey)
    if(p.g)recolor(p.g.k,ks=>{
      const result=[...ks]
      for(let i=0;i<p.g.p;i++)result.splice(i*4+1,3,...grey(ks.slice(i*4+1,i*4+4)).slice(0,3))
      return result
    })
  }
}
const {figure,shadow}=recliningPerson(cfg.person)
clipAtInnerWall(figure,cfg.person.walls);clipAtInnerWall(shadow,cfg.person.walls)
const coffin=anim.layers.find(l=>l.nm==='grob'),inside=coffin.shapes.find(g=>g.nm==='Group 2')
// Keep the original rim in front; extra rim copies changed the outer alpha.
inside.it.splice(7,0,figure,shadow)
// The source window is [120,300), already exactly 3 seconds. Keep its absolute
// key times and in-point: op=300 does not mean a five-second duration.
// Source exports zero skew on groups; remove it for python-lottie compatibility.
function cleanup(x){if(!x||typeof x!=='object')return;if(x.ty==='tr'){delete x.sk;delete x.sa}for(const v of Object.values(x))if(v&&typeof v==='object')cleanup(v)}
cleanup(anim)
assert.equal(anim.layers.length,source.layers.length)
await finish(name,source,anim,[0,20,30,36,42,54,66,78,90,96,102,110,140,160,179])
await writeFile(join(dir,'drawing.json'),JSON.stringify(anim)+'\n')
