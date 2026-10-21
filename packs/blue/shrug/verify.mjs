// Pixel and curve regressions for the bent wrists, including frames near 60 and 120.
// node packs/blue/shrug/build.mjs && node packs/blue/shrug/verify.mjs
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ROOT, engine } from '../../../scripts/lib/sheets.mjs'
import { read, at, world, point, walk } from '../lib/silhouette.mjs'

const anim = await read('exports/blue/shrug.tgs')
const source = await read('packs/blue/shrug/source.tgs')
const layer = (a, nm) => a.layers.find((l) => l.nm === nm)
for (const l of anim.layers) if (!['Wrist L', 'Wrist R'].includes(l.nm))
  assert.deepEqual(l.ks, layer(source, l.nm).ks, `Rig changed: ${l.nm}`)
for (const name of ['BODY', 'Arm L', 'Arm R'])
  assert.deepEqual(walk(layer(anim, name).shapes).filter((x) => x.ty === 'sh').map((x) => x.ks),
    walk(layer(source, name).shapes).filter((x) => x.ty === 'sh').map((x) => x.ks), `Body changed: ${name}`)
const bodyWidth = walk(layer(anim, 'BODY').shapes).find((x) => x.ty === 'st').w.k
for (const paint of walk(layer(anim, 'HEAD 2').shapes).filter((x) => x.ty === 'st'))
  assert.ok(Math.abs(paint.w.k * layer(anim, 'HEAD 2').ks.s.k[0] / 100 - bodyWidth) < 1e-6)

const frames = [...new Set([...Array.from({ length: 180 }, (_, i) => i),
  ...[50, 110].flatMap((start) => Array.from({ length: 21 }, (_, i) => start + i + 0.5))])].sort((a,b) => a-b)
const eng = await engine(), player = eng.create(JSON.stringify(anim))
let probes = 0, minimumAlpha = 255, maximumInwardBend = 0
const examples = {}
for (const f of frames) {
  const pixels = player.render(f, 512, 512).slice()
  for (const side of ['L', 'R']) {
    const palm = layer(anim, `Wrist ${side}`), arm = layer(anim, `Hand ${side}`)
    const contour = at(palm.shapes.find((g) => g.nm === 'Group 4').it.find((x) => x.ty === 'sh').ks, f)[0]
    const matrix = world(anim.layers, palm, f)
    const wi = point(matrix, contour.v.at(-1)), wo = point(matrix, contour.v[0])
    const delta = wo.map((x,d) => x-wi[d]), length = Math.hypot(...delta)
    const normal = [-delta[1]/length, delta[0]/length]
    for (const t of [0.2,0.35,0.5,0.65,0.8]) for (const offset of [-2,-1,0,1,2]) {
      const [x,y] = wi.map((v,d) => Math.round(v+delta[d]*t+normal[d]*offset))
      const alpha = pixels[(y*512+x)*4+3]
      probes++; minimumAlpha = Math.min(minimumAlpha, alpha)
      assert.ok(alpha >= 250, `Wrist gap: frame ${f}, ${side}, (${x},${y}), alpha ${alpha}`)
    }
    // Reverse the last outer-forearm segment: wrist → elbow. Measure any inward
    // hollow past the wrist-to-elbow chord, independently of the handle algorithm.
    const edge = at(arm.shapes.find((g) => g.nm === 'Внешний контур предплечья').it[0].ks, f)[0]
    const end = edge.v.length-1, prev = end-1, start = edge.v[end], finish = edge.v[prev]
    const c1 = start.map((x,d) => x+edge.i[end][d]), c2 = finish.map((x,d) => x+edge.o[prev][d])
    const chord = finish.map((x,d) => x-start[d]), distance = Math.hypot(...chord)
    const sign = side === 'L' ? 1 : -1
    const inward = [sign*chord[1]/distance,-sign*chord[0]/distance]
    let localMaximum = 0
    for (let n=1;n<100;n++) {
      const t=n/100
      const p=start.map((x,d) => (1-t)**3*x+3*(1-t)**2*t*c1[d]+3*(1-t)*t*t*c2[d]+t**3*finish[d])
      const hollow=p.reduce((sum,x,d) => sum+(x-start[d])*inward[d],0)
      localMaximum=Math.max(localMaximum,hollow)
    }
    maximumInwardBend=Math.max(maximumInwardBend,localMaximum)
    assert.ok(localMaximum <= 1.2, `Forearm hollow: frame ${f}, ${side}: ${localMaximum}`)
    if ([55,60,65,115,120,125].includes(f)) examples[`${f}-${side}`]=localMaximum
  }
}
player.drop()
const report={frames:frames.length,integerFrames:180,subframes:frames.length-180,probes,minimumAlpha,
  maximumInwardBend,examples,bodyAndRigPreserved:true,visibleOutlineWidth:bodyWidth}
await writeFile(join(ROOT,'exports/sheets/shrug/bend-verification.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify(report))
