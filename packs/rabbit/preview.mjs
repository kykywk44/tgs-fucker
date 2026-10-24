// Offline tlottie renders, transparent PNGs/APNGs and contact sheets.
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { gunzipSync } from 'node:zlib'
import { ROOT, Canvas, encodePng, engine } from '../../scripts/lib/sheets.mjs'

const dir = join(ROOT, 'exports/rabbit'), eng = await engine()
const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'))
const phases = [0, 24, 48, 72, 96, 120, 144, 179], size = 160
for (const item of manifest.items) {
  const a = JSON.parse(await readFile(join(dir, `${item.id}.json`), 'utf8')), inst = eng.create(JSON.stringify(a))
  const sheet = new Canvas(size * phases.length, size + 24, [221, 227, 234])
  for (const [j, f] of phases.entries()) {
    sheet.draw(inst.render(f, size, size).slice(), size, j * size, 0)
    sheet.text(String(f), j * size + 8, size + 5, [25, 31, 40], 2)
  }
  await writeFile(join(dir, `${item.id}.sheet.png`), encodePng(sheet.px, sheet.width, sheet.height))
  await writeFile(join(dir, `${item.id}.png`), encodePng(inst.render(0, 512, 512).slice(), 512, 512))
  if (!process.argv.includes('--stills')) {
    const frames = join(dir, 'frames', item.id)
    await mkdir(frames, { recursive: true })
    // Every original 60-fps frame is rendered; APNG preserves straight alpha.
    for (let f = 0; f < a.op; f++) await writeFile(join(frames, `${String(f).padStart(3, '0')}.png`), encodePng(inst.render(f, 320, 320).slice(), 320, 320))
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '60', '-i', join(frames, '%03d.png'), '-plays', '0', '-f', 'apng', join(dir, `${item.id}.apng`)], { windowsHide: true })
    // Chat preview: 30-fps GIF on a cool neutral backdrop, never in the TGS.
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '60', '-i', join(frames, '%03d.png'), '-filter_complex',
      'color=c=0xe6ebf1:s=320x320:r=60[bg];[bg][0:v]overlay=shortest=1,fps=30,split[a][b];[a]palettegen=reserve_transparent=0:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3', '-loop', '0', join(dir, `${item.id}.gif`)], { windowsHide: true })
  }
  inst.drop()
  console.log(item.id)
}
// Compact side-by-side review sheet: every neutral and four distinct emotions.
const cell = 256, titles = 22, overview = new Canvas(cell * 4, (cell + titles) * 3, [225, 230, 236])
for (const [j, item] of manifest.items.entries()) {
  const a = JSON.parse(await readFile(join(dir, `${item.id}.json`), 'utf8')), p = eng.create(JSON.stringify(a))
  const row = Math.floor(j / 4), col = j % 4, f = item.reference === '016' ? 48 : item.reference === '089' ? 85 : item.reference ? 48 : 0
  overview.draw(p.render(f, cell, cell).slice(), cell, col * cell, row * (cell + titles))
  overview.text(`${item.reference ?? '0'} ${item.mode === 'head' ? '1' : '2'}`, col * cell + 10, row * (cell + titles) + cell + 4, [20, 25, 30], 2)
  p.drop()
}
await writeFile(join(dir, 'overview.png'), encodePng(overview.px, overview.width, overview.height))

const neutral = new Canvas(768, 384, [230, 235, 241])
for (const [j, mode] of ['full', 'head'].entries()) {
  const a = JSON.parse(await readFile(join(dir, `rabbit-${mode}-neutral.json`))), p = eng.create(JSON.stringify(a))
  neutral.draw(p.render(0, 384, 384).slice(), 384, j * 384, 0); p.drop()
}
await writeFile(join(dir, 'neutral.png'), encodePng(neutral.px, neutral.width, neutral.height))

if (!process.argv.includes('--stills')) for (const ref of ['003', '016', '054', '089']) {
  const original = JSON.parse(gunzipSync(await readFile(join(ROOT, `library/emoji/${ref}.tgs`))))
  const anims = [original, ...await Promise.all(['head', 'full'].map(async (mode) => JSON.parse(await readFile(join(dir, `rabbit-${mode}-${ref}.json`)))))]
  const players = anims.map((a) => eng.create(JSON.stringify(a))), frames = join(dir, 'frames', `compare-${ref}`)
  await mkdir(frames, { recursive: true })
  const cycleSheet = new Canvas(80 * 15, 94 * 12, [230, 235, 241])
  for (let f = 0; f < 180; f++) {
    const c = new Canvas(768, 276, [230, 235, 241])
    for (const [j, p] of players.entries()) {
      const frame = j ? f : Math.min(anims[0].op - 1, f * (anims[0].op - anims[0].ip) / 180)
      c.draw(p.render(frame, 256, 256).slice(), 256, j * 256, 20)
      c.text(j ? j === 1 ? '1' : '2' : ref, j * 256 + 12, 4, [24, 30, 38], 2)
    }
    cycleSheet.draw(players[0].render(f * (anims[0].op - anims[0].ip) / 180, 80, 80).slice(), 80, (f % 15) * 80, Math.floor(f / 15) * 94)
    cycleSheet.text(String(f), (f % 15) * 80 + 3, Math.floor(f / 15) * 94 + 81, [30, 35, 42], 2)
    await writeFile(join(frames, `${String(f).padStart(3, '0')}.png`), encodePng(c.px, c.width, c.height))
  }
  await writeFile(join(dir, `references/${ref}-all-frames.png`), encodePng(cycleSheet.px, cycleSheet.width, cycleSheet.height))
  players.forEach((p) => p.drop())
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '60', '-i', join(frames, '%03d.png'), '-filter_complex', 'fps=30,split[a][b];[a]palettegen=reserve_transparent=0:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3', '-loop', '0', join(dir, `compare-${ref}.gif`)], { windowsHide: true })
}
