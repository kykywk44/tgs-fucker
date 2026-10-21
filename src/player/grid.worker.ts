// Grid worker: glue between the «Эмодзи» tab and GridPlayer. A tile on screen hands over its
// own OffscreenCanvas (attach) and its .tgs is fetched and built; leaving the screen (detach)
// drops both. The DOM lib is used on purpose, as in player.worker.ts.

import { loadEngine } from './engine'
import { GridPlayer, type FromGrid, type ToGrid } from './grid'
import wasmUrl from '../../node_modules/tlottie/dist/core/tlottie.wasm?url'

const canvases = new Map<string, { ctx: OffscreenCanvasRenderingContext2D; url: string; ready: boolean }>()
const loading = new Set<string>()
let grid: GridPlayer | null = null
let queue: Exclude<ToGrid, { type: 'init' }>[] = []
let scheduled = false

const send = (m: FromGrid) => postMessage(m)

// .tgs is gzip; plain .json is passed through.
async function fetchJson(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes)
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

async function ensureLoaded(key: string): Promise<void> {
  const tile = canvases.get(key)
  if (!grid || !tile || grid.has(key) || loading.has(key)) return
  loading.add(key)
  try {
    const json = await fetchJson(tile.url)
    if (grid && canvases.has(key) && !grid.load(key, json)) send({ type: 'failed', key })
  } catch {
    send({ type: 'failed', key })
  } finally {
    loading.delete(key)
  }
  schedule()
}

function draw(key: string, rgba: Uint8ClampedArray<ArrayBuffer>, size: number): void {
  const tile = canvases.get(key)
  if (!tile) return
  const { ctx } = tile
  if (ctx.canvas.width !== size) {
    ctx.canvas.width = size
    ctx.canvas.height = size
  }
  ctx.putImageData(new ImageData(rgba, size, size), 0, 0)
  if (!tile.ready) {
    tile.ready = true
    send({ type: 'ready', key })
  }
}

function schedule(): void {
  if (scheduled || !grid) return
  scheduled = true
  requestAnimationFrame((now) => {
    scheduled = false
    if (!grid) return
    grid.step(now, draw)
    schedule()
  })
}

function dispatch(g: GridPlayer, m: Exclude<ToGrid, { type: 'init' }>): void {
  switch (m.type) {
    case 'attach': {
      const ctx = m.canvas.getContext('2d')
      if (!ctx) return
      canvases.set(m.key, { ctx, url: m.url, ready: false })
      g.setVisible(m.key, true)
      void ensureLoaded(m.key)
      break
    }
    case 'detach':
      canvases.delete(m.key)
      g.remove(m.key)
      break
    case 'pause':
      g.pause()
      break
    case 'resume':
      g.resume()
      break
  }
}

addEventListener('message', async (event: MessageEvent<ToGrid>) => {
  const m = event.data
  if (m.type !== 'init') {
    if (grid) dispatch(grid, m)
    else queue.push(m)
    return
  }
  const response = await fetch(wasmUrl)
  const engine = await loadEngine(await response.arrayBuffer())
  grid = new GridPlayer(engine, m.size)
  const pending = queue
  queue = []
  for (const message of pending) dispatch(grid, message)
  schedule()
})
