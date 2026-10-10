// Preview worker: glue between the main thread and PreviewPlayer. It owns the
// OffscreenCanvas, loads the wasm, drives the render loop and reports state.
// The DOM lib is used on purpose (no WebWorker lib): addEventListener and
// postMessage are the worker-global ones at runtime.

import { loadEngine } from './engine'
import { PreviewPlayer, type FromWorker, type PlayerState, type ToWorker } from './player'
// The relative path bypasses tlottie's `exports` map; Vite turns it into an asset URL.
import wasmUrl from '../../node_modules/tlottie/dist/core/tlottie.wasm?url'

const STATE_INTERVAL_MS = 100

let canvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null
let player: PreviewPlayer | null = null
// Messages that arrive while the engine is still loading, replayed in order.
let queue: Exclude<ToWorker, { type: 'init' }>[] = []
let initError: string | null = null
let seq = 0
let force = false // post the state on the next frame regardless of the throttle
let lastPost = -Infinity
let scheduled = false

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err)
}

function post(state: PlayerState): void {
  const message: FromWorker = { type: 'state', seq, ...state }
  postMessage(message)
}

// `rgba` is a view into wasm memory: copy it onto the canvas before returning.
function blit(rgba: Uint8ClampedArray<ArrayBuffer>, width: number, height: number): void {
  if (!canvas || !ctx) return
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0)
}

function schedule(): void {
  if (scheduled) return
  scheduled = true
  const run = (now: number) => {
    scheduled = false
    frame(now)
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
  else setTimeout(() => run(performance.now()), 16)
}

function frame(now: number): void {
  if (!player) return
  let again: boolean
  try {
    again = player.step(now)
  } catch (err) {
    // The loop stops here; the next message schedules it again.
    post({ ...player.state, error: `сбой движка: ${errorMessage(err)}` })
    force = false
    lastPost = now
    return
  }
  if (force || now - lastPost >= STATE_INTERVAL_MS) {
    post(player.state)
    force = false
    lastPost = now
  }
  if (again) schedule()
}

function dispatch(target: PreviewPlayer, m: Exclude<ToWorker, { type: 'init' }>): void {
  switch (m.type) {
    case 'load':
      target.load(m.json)
      break
    case 'play':
      target.play()
      break
    case 'pause':
      target.pause()
      break
    case 'seek':
      target.seek(m.frame)
      break
    case 'resize':
      target.resize(m.size)
      break
  }
}

async function init(m: Extract<ToWorker, { type: 'init' }>): Promise<void> {
  try {
    const context = m.canvas.getContext('2d')
    if (!context) throw new Error('нет 2D-контекста OffscreenCanvas')
    canvas = m.canvas
    ctx = context

    const response = await fetch(wasmUrl)
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    const engine = await loadEngine(await response.arrayBuffer())

    const ready = new PreviewPlayer(engine, blit, m.size)
    player = ready
    const pending = queue
    queue = []
    for (const message of pending) dispatch(ready, message)
    force = true
    schedule()
  } catch (err) {
    initError = `не удалось загрузить движок: ${errorMessage(err)}`
    postMessage({ type: 'state', seq, playing: false, frame: 0, error: initError } satisfies FromWorker)
  }
}

addEventListener('message', (event: MessageEvent<ToWorker>) => {
  const m = event.data
  if (m.type === 'init') {
    void init(m)
    return
  }
  if (m.type === 'play' || m.type === 'pause' || m.type === 'seek') seq = m.seq
  force = true
  if (player) {
    dispatch(player, m)
    schedule()
  } else if (initError === null) {
    queue.push(m)
  } else {
    // The engine failed to load: keep reporting the failure for the new seq.
    postMessage({ type: 'state', seq, playing: false, frame: 0, error: initError } satisfies FromWorker)
  }
})
