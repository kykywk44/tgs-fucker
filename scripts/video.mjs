// Renders a .tgs to video on white with ffmpeg (libopenh264), to send an animation to look at:
// node scripts/video.mjs <file.tgs> <out.mp4> [size=512] [loops=2]
import { readFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
const { encodePng, engine: loadEngine, load } = await import(pathToFileURL(join(process.cwd(), 'scripts/lib/sheets.mjs')).href)
const { readTgs } = await load('src/core/tgs.ts')
const [file, out, size = '512', loops = '2'] = process.argv.slice(2)
const N = +size
const anim = await readTgs(new Uint8Array(await readFile(file)))
const inst = (await loadEngine()).create(JSON.stringify(anim))
const dir = out + '.frames'
await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true })
const n = anim.op - anim.ip
for (let f = 0; f < n; f++) {
  const px = inst.render(f, N, N), rgba = new Uint8ClampedArray(N * N * 4)
  for (let i = 0; i < N * N; i++) { const a = px[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.round(px[i * 4 + c] * a + 255 * (1 - a)); rgba[i * 4 + 3] = 255 }
  await writeFile(join(dir, `f${String(f).padStart(4, '0')}.png`), encodePng(rgba, N, N))
}
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-stream_loop', String(+loops - 1), '-framerate', String(anim.fr), '-i', join(dir, 'f%04d.png'), '-c:v', 'libopenh264', '-pix_fmt', 'yuv420p', '-b:v', '6M', out])
await rm(dir, { recursive: true, force: true })
console.log(out)
