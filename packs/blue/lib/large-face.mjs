// Shared operations for the large, neckless 069-style faces.
import {execFileSync} from 'node:child_process'
import {join} from 'node:path'
import {ROOT} from '../../../scripts/lib/sheets.mjs'
import {read,head,path,walk,rgb} from './silhouette.mjs'
export {read,walk,rgb}
export const by=(ls,nm)=>ls.find(l=>l.nm===nm)
export const mapVector=(p,fn)=>!p.a?{...p,k:fn(p.k)}:{...p,k:p.k.map(k=>({...k,
  ...(k.s&&{s:fn(k.s)}),...(k.e&&{e:fn(k.e)})}))}
export function replaceHead(layer,center,{width=300,height=378.29418}={}) {
  layer.shapes=head(path(layer),{width,height,center,
    bottom:[center[0],center[1]+height/2],top:[center[0],center[1]-height/2]})
}
export function whiteMouth(layer,groups) {
  layer.shapes=layer.shapes.filter(g=>groups.includes(g.nm))
  for(const p of walk(layer.shapes))if(p.c)p.c={a:0,k:[1,1,1,1]}
}
export async function restyled(name) {
  execFileSync(process.execPath,[join(ROOT,'scripts/restyle.mjs'),'blue/'+name],{stdio:'ignore'})
  return read('exports/blue/'+name+'.tgs')
}
