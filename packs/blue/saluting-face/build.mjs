// 072: a salute with the approved 069/family neckless head, only a white mouth.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {join} from 'node:path'
import {ROOT} from '../../../scripts/lib/sheets.mjs'
import {read,head,walk,nullify,stroke,finish} from '../lib/silhouette.mjs'
execFileSync(process.execPath,[join(ROOT,'scripts/restyle.mjs'),'blue/saluting-face'],{stdio:'ignore'})
const source=await read('packs/blue/saluting-face/source.tgs'),anim=await read('exports/blue/saluting-face.tgs')
const ls=anim.assets[0].layers,originals=source.assets[0].layers,by=n=>ls.find(l=>l.nm===n)
const face=by('лицо'),circle=face.shapes.find(g=>g.nm==='Group 14').it.find(x=>x.ty==='sh').ks
face.shapes=head(circle,{width:300,height:378.29418,center:[236.479,-1.2605],bottom:[236.479,187.88659],top:[236.479,-190.40759]})
// The eyes layer also animates the mouth's position. Keep that rig as an empty null.
nullify(by('глаза'))
by('рот').shapes=structuredClone(originals.find(l=>l.nm==='рот').shapes.filter(g=>['Group 9','Group 10'].includes(g.nm)))
for(const x of walk(by('рот').shapes))if(x.c)x.c={a:0,k:[1,1,1,1]}
for(const x of walk(by('рука').shapes))if(x.ty==='st')Object.assign(x,stroke())
for(const l of ls)assert.deepEqual(l.ks,originals.find(x=>x.ind===l.ind).ks)
assert.deepEqual(anim.layers,source.layers)
await finish('saluting-face',source,anim,[0,19,34,49,68,84,106,115,122,133,145,162])
