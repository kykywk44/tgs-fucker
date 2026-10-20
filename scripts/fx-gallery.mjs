// Muzzle steam candidates side by side: each one on the baseline pistol (exports/pistol.sketch.base.json,
// written by `node scripts/motion.mjs pistol`) with a single shot of the baseline motion, in a short loop.
// Candidates come from stickers/pistol/fx/steam.json (node stickers/pistol/fx/build_fx.mjs) and gun_refs/.
// → exports/fx/<id>.tgs, exports/sheets/fx-gallery.png (one row per candidate), Telegram checks on stdout.
// Usage: node scripts/fx-gallery.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Canvas, ROOT, encodePng, engine, load } from './lib/sheets.mjs'

const { compileMotion } = await load('src/core/motion/compile.ts')
const { readTgs, writeTgs, sizeKb } = await load('src/core/tgs.ts')
const { telegramChecks } = await load('src/core/checks.ts')

const base = JSON.parse(await readFile(join(ROOT, 'exports', 'pistol.sketch.base.json'), 'utf8'))
const motion = JSON.parse(await readFile(join(ROOT, 'stickers', 'pistol', 'motion.json'), 'utf8'))
const sources = {
  meteor: await readTgs(await readFile(join(ROOT, 'gun_refs/MeteorSticker.tgs'))),
  fire: await readTgs(await readFile(join(ROOT, 'gun_refs/FireEffectsSticker.tgs'))),
  steam: JSON.parse(await readFile(join(ROOT, 'stickers/pistol/fx/steam.json'), 'utf8')),
}

const SHOT = 0.2, MUZZLE = [490, 136], TIP = [482, 124] // TIP: the top of the muzzle end (gun coordinates)
const shot = [
  { part: 'trigger', preset: 'kick', r: 16, attack: 0.05, release: 0.12, at: SHOT - 0.05 },
  { part: 'slide', preset: 'kick', x: -44, attack: 0.034, hold: 0.034, release: 0.067, releaseEase: 'backOut', at: SHOT },
  { part: 'gun_light', preset: 'kick', show: 100, attack: 0.0167, release: 0.0167, at: SHOT + 0.0167 },
  { part: 'gun', preset: 'kick', r: -18, x: -14, y: -5, attack: 0.025, release: 0.18, at: SHOT + 0.0167 },
  { part: 'port_open', preset: 'kick', show: 100, attack: 0.0167, hold: 0.067, release: 0.0167, at: SHOT },
  { part: 'port_case', preset: 'kick', show: 100, attack: 0.0167, hold: 0.025, release: 0.0167, at: SHOT },
  { part: 'shell_1', preset: 'eject', launch: { part: 'gun', point: [206, 136] }, vx: -170, vy: -560, gravity: 2400, spin: -900, len: 0.7, at: SHOT + 0.05 },
]
const flash = motion.effects.find((e) => e.source === 'meteor')
// steam starts as the gun comes back from recoil and keeps to the muzzle while it settles
const steamAt = { at: SHOT + 0.1, anchor: { part: 'gun', point: MUZZLE }, follow: true }
const own = (comp, extra = {}) => ({ source: 'steam', comp, ...steamAt, origin: [100, 220], scale: 42, ...extra })

// id → [label, steam effects]
const CANDIDATES = {
  now: ['сейчас: кремовый дым (как в исходнике)', motion.effects.filter((e) => e.source === 'fire').map((e) => ({ ...e, at: e.at[0] - 0.5 + SHOT, scale: Array.isArray(e.scale) ? e.scale[0] : e.scale, rotate: Array.isArray(e.rotate) ? e.rotate[0] : e.rotate }))],
  f1g: ['F1 (было): вырастает снизу вверх', [own('coffee_one_grow', { origin: [256, 420], scale: 50, anchor: { part: 'gun', point: TIP } })]],
  f1r: ['F1 — вытягивается вверх и тает снизу', [own('coffee_one_rise', { origin: [256, 420], scale: 50, anchor: { part: 'gun', point: TIP } })]],
}

const eng = await engine()
await mkdir(join(ROOT, 'exports', 'fx'), { recursive: true })
const C = 160, frames = Array.from({ length: 12 }, (_, k) => 18 + k * 5)
const sheet = new Canvas(C * frames.length, (C + 18) * Object.keys(CANDIDATES).length)
const meta = {}
let row = 0, failed = false
for (const [id, [label, steam]] of Object.entries(CANDIDATES)) {
  const anim = compileMotion(base, { duration: 1.2, rig: motion.rig, tracks: shot, effects: [{ ...flash, at: SHOT }, ...steam] }, sources)
  const bytes = await writeTgs(anim)
  await writeFile(join(ROOT, 'exports', 'fx', `${id}.tgs`), bytes)
  const checks = telegramChecks(anim, bytes.length), ok = checks.every((c) => c.ok)
  if (!ok) failed = true
  meta[id] = { label, kb: sizeKb(bytes) }
  console.log(`${id}: exports/fx/${id}.tgs ${sizeKb(bytes)} KB${ok ? ', проверки Telegram ✓' : ''} — ${label}`)
  for (const c of checks) if (!c.ok) console.log(`  ✕ ${c.label} — ${c.value} / ${c.limit}`)
  const inst = eng.create(JSON.stringify(anim)), oy = row * (C + 18)
  sheet.text(`${row + 1}`, 4, oy + 3, [200, 0, 0])
  frames.forEach((f, i) => {
    // the muzzle region, magnified: canvas x 300–512, y 10–250 (x past the canvas edge stays empty)
    const px = inst.render(f, 512, 512).slice(), crop = new Uint8Array(240 * 240 * 4)
    for (let y = 0; y < 240; y++) crop.set(px.subarray(((10 + y) * 512 + 272) * 4, ((10 + y) * 512 + 512) * 4), y * 240 * 4)
    const small = new Uint8Array(C * C * 4)
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      const s = (Math.floor((y * 240) / C) * 240 + Math.floor((x * 240) / C)) * 4
      // composed over a dark chat blue: white steam is invisible on a light checker
      const al = crop[s + 3] / 255
      small.set([crop[s] * al + 44 * (1 - al), crop[s + 1] * al + 58 * (1 - al), crop[s + 2] * al + 76 * (1 - al), 255], (y * C + x) * 4)
    }
    sheet.draw(small, C, i * C, oy + 18)
    if (row === 0) sheet.text(`f ${f}`, i * C + 40, 3, [90, 90, 90])
  })
  inst.drop()
  row++
}
await writeFile(join(ROOT, 'exports', 'sheets', 'fx-gallery.png'), encodePng(sheet.px, sheet.width, sheet.height))
await writeFile(join(ROOT, 'exports', 'fx', 'gallery.json'), JSON.stringify(meta, null, 1))
console.log('exports/sheets/fx-gallery.png:', Object.keys(CANDIDATES).map((id, n) => `${n + 1} ${id}`).join(', '))
process.exit(failed ? 1 : 0)
