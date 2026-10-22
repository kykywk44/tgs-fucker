// Uploaded gold hand: original gesture with the blue pack's shading, without bow/sparkles.
// node packs/blue/gift-hand/build.mjs
import assert from 'node:assert/strict'
import { read, stroke, gradient, finish, transform, mul, inverse, point, baked, I, rgb, walk } from '../lib/silhouette.mjs'

const source = await read('packs/blue/gift-hand/source.tgs')
const anim = structuredClone(source)
anim.nm = 'Жест рукой · синий'
// The wrist layer is also the parent of the hand. Retain its original rig as a null;
// its shapes are the cuff/bow, not part of the palm.
anim.layers = anim.layers.filter(l => [16,19].includes(l.ind))
const rig = anim.layers.find(l => l.ind === 16)
assert.equal(rig.nm, 'сустав')
rig.ty = 3
delete rig.shapes
const hand = anim.layers.find(l => l.ind === 19)
assert.equal(hand.nm, 'ладонь')
const keep = {
  'два передних пальца': ['лайн','лайн 2','заливка','заливка 2'],
  'два дальних пальца': ['лайн 1','лайн 2','заливка 1','заливка 2'],
  'ладонь': ['лайн ладони','заливка'],
  'большой палец': ['Group 1','Group 5'],
}
const shading = {
  'два передних пальца': {
    light: ['свет вдоль лайна','свет вдоль контура'],
    shadow: [],
  },
  'два дальних пальца': {
    light: ['свет вдоль лайна','свет вдоль лайна 2'],
    shadow: [],
  },
  'ладонь': { light: ['рефлекс'], shadow: [] },
  'большой палец': { light: ['Group 3'], shadow: ['Shape 1'] },
}
hand.shapes = hand.shapes.filter(g => keep[g.nm])
for (const g of hand.shapes) {
  g.it = g.it.filter(x => x.ty === 'tr' || keep[g.nm].includes(x.nm) ||
    shading[g.nm].light.includes(x.nm) || shading[g.nm].shadow.includes(x.nm))
  for (const child of g.it.filter(x => x.ty === 'gr')) {
    const light = shading[g.nm].light.includes(child.nm)
    const shadow = shading[g.nm].shadow.includes(child.nm)
    if (!light && !shadow) continue
    child.nm = `${light ? 'Highlight' : 'Shadow'}: ${child.nm}`
    for (const paint of child.it.filter(x => ['gf','gs'].includes(x.ty))) {
      if (shadow) {
        // A small flat thumb crease, like the other pack hands. No soft shadows
        // between the fingers or at the bottom of the palm.
        for (const key of Object.keys(paint)) delete paint[key]
        Object.assign(paint,{ty:'fl',c:{a:0,k:[...rgb('#44688b'),1]},o:{a:0,k:100},r:1})
        continue
      }
      const color = rgb('#a5d6ea')
      const stops = paint.g.k.k
      for (let i=0;i<paint.g.p;i++) stops.splice(i*4+1,3,...color)
      // Preserve the highlights from the previous version exactly.
      paint.o = {a:0,k:paint.ty === 'gs' ? 100 : 45}
    }
  }
}

function repaint(items, parents = []) {
  for (const item of items) {
    if (item.ty === 'gr' && !/^(Highlight|Shadow):/.test(item.nm))
      repaint(item.it, [...parents,item.it.find(t => t.ty === 'tr')])
    else if (item.ty === 'gs') {
      const width = item.w
      for (const key of Object.keys(item)) delete item[key]
      Object.assign(item, stroke(), { w: width })
    } else if (item.ty === 'gf') {
      // A single gradient across all parts, expressed in each moving group's space.
      // Closed original fills overlap; the matte's open paths would leave tiny gaps.
      const matrix = f => parents.reduce((m,t) => mul(m,transform(t,f)), I)
      const position = p => baked(f => point(inverse(matrix(f)),p), anim.op-anim.ip)
      for (const key of Object.keys(item)) delete item[key]
      Object.assign(item, gradient([256,360],[256,30]), {
        s: position([256,360]), e: position([256,30]),
      })
    }
  }
}
repaint(hand.shapes)
// Keep the highlights and the thumb crease inside the original hand silhouette.
const matte = structuredClone(hand)
matte.ind = 20
matte.nm = 'Hand silhouette matte'
matte.td = 1
for (const g of matte.shapes)
  g.it = g.it.filter(x => x.ty === 'tr' || !/^(Highlight|Shadow):/.test(x.nm))
for (const paint of walk(matte.shapes)) {
  if (paint.ty === 'gf') {
    for (const key of Object.keys(paint)) delete paint[key]
    Object.assign(paint,{ty:'fl',c:{a:0,k:[1,1,1,1]},o:{a:0,k:100},r:1})
  } else if (paint.ty === 'st') paint.c = {a:0,k:[1,1,1,1]}
}
hand.tt = 1
anim.layers = [rig,matte,hand]
await finish('gift-hand',source,anim,[0,15,30,45,60,75,90,105,120,135,150,179])
