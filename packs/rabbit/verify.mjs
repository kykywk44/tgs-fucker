// Independent structural + pixel checks. All 180 frames and all 179 half frames,
// overscan outside the canvas, transparent-hole/component detection, loop seam,
// common head geometry, and the project's pinned python-lottie Telegram validator.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { ROOT, engine, Canvas, encodePng } from '../../scripts/lib/sheets.mjs'

const dir = join(ROOT, 'exports/rabbit'), eng = await engine()
const rig = JSON.parse(await readFile(join(ROOT, 'packs/rabbit/rig.json')))
const manifest = JSON.parse(await readFile(join(dir, 'manifest.json')))
const report = { sourceSha256: manifest.sourceSha256, minimumMarginRequired: rig.minimumMargin, items: [] }
const source = await readFile(join(ROOT, 'packs/rabbit/source/original.svg'))
assert.equal(createHash('sha256').update(source).digest('hex'), manifest.sourceSha256)
const external = process.argv.find((x) => x.startsWith('--source='))?.slice(9)
if (external) assert.deepEqual(source, await readFile(external), 'Original SVG changed')
const walk = (x, fn) => { if (!x || typeof x !== 'object') return; fn(x); for (const v of Object.values(x)) if (typeof v === 'object') walk(v, fn) }
const forbiddenShapes = new Set(['mm', 'sr', 'gs', 'rp'])

function overscan(a) {
  const out = structuredClone(a), root = out.layers.find((l) => l.nm === 'root')
  const shift = (p) => p.map((x, d) => x + (d < 2 ? 64 : 0))
  if (root.ks.p.a) for (const key of root.ks.p.k) { key.s = shift(key.s); if (key.e) key.e = shift(key.e) }
  else root.ks.p.k = shift(root.ks.p.k)
  out.w = out.h = 640
  return out
}
function bounds(px, width, alpha = 20) {
  let x0 = width, y0 = width, x1 = -1, y1 = -1, pixels = 0
  for (let i = 3; i < px.length; i += 4) if (px[i] > alpha) {
    const index = (i - 3) / 4, x = index % width, y = Math.floor(index / width)
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); pixels++
  }
  return { box: [x0, y0, x1, y1], pixels }
}
// Empty regions enclosed by opaque geometry are genuine holes, including cracks
// at a joint. The intentionally separate round paws are foreground components.
function topology(px, size) {
  const visited = new Uint8Array(size * size), queue = new Int32Array(size * size)
  let holes = 0, components = 0
  for (let seed = 0; seed < visited.length; seed++) {
    if (visited[seed]) continue
    const solid = px[seed * 4 + 3] > 100
    let begin = 0, end = 1, edge = false; queue[0] = seed; visited[seed] = 1
    while (begin < end) {
      const i = queue[begin++], x = i % size, y = Math.floor(i / size)
      if (!x || !y || x === size - 1 || y === size - 1) edge = true
      for (const j of [x ? i - 1 : -1, x < size - 1 ? i + 1 : -1, y ? i - size : -1, y < size - 1 ? i + size : -1]) {
        if (j < 0 || visited[j] || (px[j * 4 + 3] > 100) !== solid) continue
        visited[j] = 1; queue[end++] = j
      }
    }
    if (solid && end >= 8) components++
    if (!solid && !edge && end >= 3) holes += end
  }
  return { holes, components }
}
for (const item of manifest.items) {
  const file = join(dir, `${item.id}.tgs`), bytes = await readFile(file), a = JSON.parse(gunzipSync(bytes))
  assert.deepEqual([a.w, a.h, a.fr, a.ip, a.op, a.tgs], [512, 512, 60, 0, 180, 1])
  assert.ok(bytes.length <= 65536)
  assert.equal(a.assets.length, 0)
  assert.ok(a.layers.every((l) => l.ty === 3 || l.ty === 4))
  assert.ok(!a.layers.some((l) => /mouth|brow|teeth/i.test(l.nm)), 'Mouth/eyebrows are forbidden by the user')
  const ids = new Set(a.layers.map((l) => l.ind))
  assert.equal(ids.size, a.layers.length, 'Duplicate layer id')
  for (const l of a.layers) {
    assert.ok(l.parent == null || ids.has(l.parent), `Missing parent ${l.nm}`)
    assert.ok(l.ddd === 0 && l.sr === 1 && !l.tm && !l.masksProperties && !l.ef && !l.tt)
  }
  walk(a, (x) => {
    assert.ok(!forbiddenShapes.has(x.ty), `Forbidden shape ${x.ty}`)
    assert.ok(typeof x.x !== 'string', 'Expressions are forbidden')
    if (x.ty === 'st') assert.equal(x.w.a, 0, 'Animated outline width')
    if (x.v && x.i && x.o && Array.isArray(x.v)) assert.ok(x.v.length === x.i.length && x.v.length === x.o.length, 'Broken curve topology')
    if (x.ty === 'fl' || x.ty === 'st') {
      assert.equal(x.c.a, 0)
      assert.ok(x.c.k.every((n) => Math.abs(n - 1) < 0.0001) || x.c.k.every((n) => Math.abs(n - 1 / 255) < 0.0001), 'Unexpected colour')
    }
  })
  const player = eng.create(JSON.stringify(a)), pad = eng.create(JSON.stringify(overscan(a)))
  assert.ok(player && pad)
  let minimumMargin = 512, maxHoles = 0, maxComponents = 0, maxStepMean = 0, previous = null
  const all = new Canvas(80 * 15, 94 * 12, [225, 230, 237]), union = [512, 512, 0, 0]
  const seam0 = player.render(0, 512, 512).slice()
  for (let n = 0; n < 359; n++) {
    const f = n / 2
    const px = pad.render(f, 640, 640), b = bounds(px, 640)
    assert.ok(b.pixels > 0, `${item.id}: empty frame ${f}`)
    const [x0, y0, x1, y1] = b.box.map((x) => x - 64)
    const margin = Math.min(x0, y0, 511 - x1, 511 - y1)
    minimumMargin = Math.min(minimumMargin, margin)
    assert.ok(margin >= rig.minimumMargin, `${item.id}: frame ${f} margin ${margin}`)
    union[0] = Math.min(union[0], x0); union[1] = Math.min(union[1], y0); union[2] = Math.max(union[2], x1); union[3] = Math.max(union[3], y1)
    if (n % 2) continue
    const rgba = player.render(f, 512, 512).slice(), topologyResult = topology(rgba, 512)
    maxHoles = Math.max(maxHoles, topologyResult.holes); maxComponents = Math.max(maxComponents, topologyResult.components)
    assert.equal(topologyResult.holes, 0, `${item.id}: transparent hole at ${f}`)
    assert.ok(topologyResult.components <= (item.mode === 'head' ? 1 : 3), `${item.id}: detached part at ${f}`)
    if (previous) {
      let delta = 0
      for (let i = 0; i < rgba.length; i++) delta += Math.abs(rgba[i] - previous[i])
      maxStepMean = Math.max(maxStepMean, delta / rgba.length)
    }
    previous = rgba
    all.draw(player.render(f, 80, 80).slice(), 80, (f % 15) * 80, Math.floor(f / 15) * 94)
    all.text(String(f), (f % 15) * 80 + 3, Math.floor(f / 15) * 94 + 81, [25, 30, 35], 2)
  }
  const seam179 = player.render(179, 512, 512).slice()
  const seamMean = seam0.reduce((s, v, i) => s + Math.abs(v - seam179[i]), 0) / seam0.length
  assert.ok(seamMean < 0.05, `Loop seam ${item.id}: ${seamMean}`)
  assert.ok(maxStepMean < 4, `Frame jump ${item.id}: ${maxStepMean}`)
  player.drop(); pad.drop()
  await writeFile(join(dir, `${item.id}.all-frames.png`), encodePng(all.px, all.width, all.height))
  const validator = execFileSync(join(ROOT, '.venv/Scripts/python.exe'), [join(ROOT, '.venv/Scripts/tgs_check.py'), '--level', 'Warning', file], { encoding: 'utf8', windowsHide: true })
  report.items.push({ id: item.id, bytes: bytes.length, telegramValidator: 'PASS', validatorOutput: validator.trim(), integerFrames: 180, subframes: 179, minimumMargin, unionBounds: union, maxTransparentHolePixels: maxHoles, maxComponents, maxAdjacentFrameMean: +maxStepMean.toFixed(5), loopMean: +seamMean.toFixed(6) })
  console.log(`${item.id}: PASS, ${bytes.length} bytes, margin ${minimumMargin}px, loop ${seamMean.toFixed(6)}`)
}
for (const ref of [null, '003', '016', '054', '089']) {
  const head = JSON.parse(await readFile(join(dir, `rabbit-head-${ref ?? 'neutral'}.json`))), full = JSON.parse(await readFile(join(dir, `rabbit-full-${ref ?? 'neutral'}.json`)))
  const fullByName = new Map(full.layers.map((l) => [l.nm, l]))
  const parentByIndex = new Map(head.layers.map((l) => [l.ind, l]))
  for (const l of head.layers.filter((l) => l.shapes)) {
    let parent = parentByIndex.get(l.parent), inHead = false
    while (parent) { if (parent.nm === 'head') inHead = true; parent = parentByIndex.get(parent.parent) }
    assert.ok(inHead)
    assert.deepEqual(l.shapes, fullByName.get(l.nm).shapes, `Shared head drift: ${l.nm}`)
  }
}
report.sharedHeadGeometry = 'identical for both versions, all five clips'
await writeFile(join(dir, 'verification.json'), JSON.stringify(report, null, 2))
console.log('All frame, overscan, topology, shared-head and Telegram checks passed.')
