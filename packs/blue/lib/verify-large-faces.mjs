// Asset checks: preserve original rigs, hands, mouth contours, and accessory animation.
// node packs/blue/lib/verify-large-faces.mjs
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {ROOT,engine} from '../../../scripts/lib/sheets.mjs'
import {read,walk,at,path} from './silhouette.mjs'
const specs=[
  {name:'face-with-hand-over-mouth',id:'070',head:'Head',removed:['Eyes','Reds','Shadow'],mouths:{'mouth 3':['Group 1'],'mouth-2':['Group 1','Group 4','Group 9','Group 10','zubki']},hands:['Hand 2']},
  {name:'yawning-face',id:'089',head:'body',removed:['eye1','eye2','Shadow Hand'],mouths:{mouth:['Group 1','Group 2']},hands:['hand']},
  {name:'grimacing-face',id:'082',head:'BODY',removed:['Eyes'],mouths:{Mouth:null}},
  {name:'partying-face',id:'035',head:'bodyface',removed:['brow L','brow R','eye_L','eye_R','Cheeks'],mouths:{mouth:['Group 1','Group 2','Group 3','Group 4','Group 5']},asset:'comp_0'},
  {name:'zipper-mouth-face',id:'096',head:'BODY',removed:['Eyes','Shadow Zipper'],mouths:{Mouth:['Group 1','Group 2']},hands:['Pinkie','Ring Finger','Middle Finger','Index Finger','Thumb','Palm']},
  {name:'lying-face',id:'075',head:'BODY',removed:['Eyes','Brow L','Brow R','OUTLINE','Nose SHADOW'],mouths:{Mouth:['Group 1','Group 2']},hands:['Nose']},
  {name:'forcing-smile',id:'045',head:'body',removed:['eyes 3','eyes 2','h1_s 2','h1_s'],mouths:{mouth:['Group 1','Group 2']},hands:['h1','h3']},
  {name:'melting-face',id:'074',head:'Body',removed:['Right eye','Left eye'],mouths:{Mouth:['Group 1','Group 2']}},
]
const structural=xs=>xs.filter(x=>!['fl','gf','st','gs'].includes(x.ty)).map(x=>
  x.ty==='gr'?{...x,it:structural(x.it)}:x)
const noShapes=({shapes,...rest})=>rest
const keyTimes=p=>!p.a?[]:p.k.map(({s,e,to,ti,...k})=>k)
const eng=await engine(),report=[]
for(const spec of specs) {
  const source=await read(`packs/blue/${spec.name}/source.tgs`),anim=await read(`exports/blue/${spec.name}.tgs`)
  assert.deepEqual(await readFile(join(ROOT,`packs/blue/${spec.name}/source.tgs`)),await readFile(join(ROOT,`library/emoji/${spec.id}.tgs`)))
  for(const f of ['w','h','ip','op','fr'])assert.equal(anim[f],source[f])
  const ls=spec.asset?anim.assets.find(a=>a.id===spec.asset).layers:anim.layers
  const old=spec.asset?source.assets.find(a=>a.id===spec.asset).layers:source.layers
  for(const name of spec.removed)assert.ok(!ls.some(l=>l.nm===name))
  const originals=old.filter(l=>!spec.removed.includes(l.nm))
  assert.deepEqual(ls.filter(l=>l.ind<100).map(l=>l.ind),originals.map(l=>l.ind))
  for(const l of ls.filter(l=>l.ind<100)) {
    const o=old.find(x=>x.ind===l.ind),expected=noShapes(structuredClone(o))
    if(spec.id==='070'&&['mouth-2','mouth 3'].includes(l.nm)){
      const keys=expected.ks.o.k
      keys[2].t=120;keys[2].o={x:[.333],y:[0]};keys[2].i={x:[.667],y:[1]};keys[3].t=126
    }
    if(l.nm.startsWith('Drop')||l.nm==='hat') {
      const actual=l.ks.p,previous=o.ks.p
      assert.deepEqual(keyTimes(actual),keyTimes(previous))
      const n=actual.a?actual.k.filter(k=>k.s).map(k=>k.s):[actual.k]
      const p=previous.a?previous.k.filter(k=>k.s).map(k=>k.s):[previous.k]
      for(let i=0;i<n.length;i++) {
        const wanted=l.nm==='hat'?p[i][0]+34:.054+(p[i][0]-.054)*300/378.29418
        assert.ok(Math.abs(n[i][0]-wanted)<1e-8)
        assert.deepEqual(n[i].slice(1),p[i].slice(1))
      }
      expected.ks.p=structuredClone(actual)
    }
    assert.deepEqual(noShapes(l),expected,`Changed rig: ${spec.name}/${l.nm}`)
    if(l.parent!=null)assert.ok(ls.some(p=>p.ind===l.parent))
  }
  for(const [name,groups]of Object.entries(spec.mouths)) {
    const a=ls.find(l=>l.nm===name),b=old.find(l=>l.nm===name)
    assert.deepEqual(structural(a.shapes),structural(b.shapes.filter(g=>!groups||groups.includes(g.nm))),`Changed mouth motion ${spec.name}`)
    const paints=walk(a.shapes).filter(x=>x.c)
    assert.ok(paints.some(p=>p.c.k.slice(0,3).every(c=>c===1)),'White mouth/teeth missing')
    if(spec.id!=='070'&&spec.id!=='082')for(const p of paints)assert.deepEqual(p.c.k,[1,1,1,1])
  }
  for(const name of spec.hands??[])assert.deepEqual(structural(ls.find(l=>l.nm===name).shapes),structural(old.find(l=>l.nm===name).shapes))
  if(spec.id==='035') {
    assert.deepEqual(anim.layers,source.layers)
    for(const a of source.assets)if(a.id!=='comp_0')assert.deepEqual(anim.assets.find(x=>x.id===a.id),a)
    for(const l of ls.filter(l=>!['bodyface','mouth','hat'].includes(l.nm)))assert.deepEqual(l,old.find(x=>x.ind===l.ind))
    assert.deepEqual(ls.find(l=>l.nm==='hat').shapes,old.find(l=>l.nm==='hat').shapes)
  }
  if(spec.id==='089') {
    const sleep=await read('packs/blue/yawning-face/zzz-source.tgs')
    assert.deepEqual(await readFile(join(ROOT,'packs/blue/yawning-face/zzz-source.tgs')),await readFile(join(ROOT,'library/emoji/090.tgs')))
    const zs=ls.filter(l=>l.ind>=100)
    assert.equal(zs.length,3)
    for(const z of zs) {
      const original=sleep.layers.find(l=>l.nm===z.nm)
      assert.deepEqual(structural(z.shapes),structural(original.shapes))
      for(const k of ['p','a','r','s'])assert.deepEqual(z.ks[k],original.ks[k])
      for(let f=30;f<=95;f++)assert.equal(at(z.ks.o,f)[0],0,`Z shown with closed mouth f${f}`)
      assert.ok(at(z.ks.o,150)[0]>99)
    }
  }
  if(spec.id==='096')for(const l of ls.filter(l=>l.nm==='Zipper'||l.nm.startsWith('Link ')))assert.deepEqual(l,old.find(x=>x.ind===l.ind))
  if(spec.id==='045')assert.deepEqual(ls.find(l=>l.nm==='body').shapes[0].it.find(x=>x.ty==='tr'),old.find(l=>l.nm==='body').shapes[0].it.find(x=>x.ty==='tr'))
  const h=ls.find(l=>l.nm===spec.head)
  const headPath=walk(h.shapes).find(x=>x.ty==='sh'&&(x.ks.a?x.ks.k[0].s[0]:x.ks.k).c).ks
  if(spec.id==='074') {
    const original=path(old.find(l=>l.nm==='Body'))
    assert.deepEqual(keyTimes(headPath),keyTimes(original),'Changed melt timing')
    for(let k=1;k<headPath.k.length;k++)for(let n=3;n<20;n++)for(let d=0;d<2;d++) {
      const delta=headPath.k[k].s[0].v[n+3][d]-headPath.k[0].s[0].v[n+3][d]
      const expected=(original.k[k].s[0].v[n][d]-original.k[0].s[0].v[n][d])*(d===0?300/378.29418:1)
      assert.ok(Math.abs(delta-expected)<1e-8,'Changed liquid displacement')
    }
  }
  // Isolate the head while preserving its hierarchy and all original motion.
  const mask=structuredClone(anim)
  for(const unit of [mask.layers,...(mask.assets??[]).map(a=>a.layers??[])])for(const l of unit)
    if(l.shapes&&(l.ind!==h.ind||l.nm!==h.nm))l.shapes=[]
  const player=eng.create(JSON.stringify(mask))
  let minimumMargin=512
  for(let f=0;f<180;f++) {
    const px=player.render(f,256,256).slice()
    for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(px[(y*256+x)*4+3]>0)
      minimumMargin=Math.min(minimumMargin,x,y,255-x,255-y)
  }
  player.drop()
  assert.ok(minimumMargin>0,`Head clipped: ${spec.name}`)
  report.push({name:spec.name,frames:180,originalRigAndMouthContours:true,noEyes:true,headMarginPx:minimumMargin*2})
}
await writeFile(join(ROOT,'exports/sheets/next-heads/verification.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
