import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider, type SliderValue } from '@/components/ui/slider'
import type { FromWorker, ToWorker } from '@/player/player'

export interface PreviewProps {
  json: string // Lottie JSON string
  totalFrames: number // op - ip
}

const STAGE_PX = 512

// Backing-store size of the canvas: the 512 CSS px stage at the device pixel ratio, capped at 2x.
function backingSize(): number {
  return Math.round(STAGE_PX * Math.min(2, window.devicePixelRatio || 1))
}

export function Preview({ json, totalFrames }: PreviewProps) {
  const [playing, setPlaying] = useState(true) // autoplay is on
  const [frame, setFrame] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const workerRef = useRef<Worker | null>(null)
  // The last JSON handed to the current worker; null until this worker has been sent one.
  const sentJson = useRef<string | null>(null)
  // Bumped before every play / pause / seek. The worker echoes the last seq it saw, and a state
  // carrying an older one is a stale echo that must not overwrite what the user just did.
  const seqRef = useRef(0)

  // The worker and its canvas live and die with this component. The canvas is created here
  // rather than in JSX because transferControlToOffscreen works once per canvas, and
  // StrictMode runs this effect twice: every run needs a fresh canvas.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const canvas = document.createElement('canvas')
    if (typeof canvas.transferControlToOffscreen !== 'function') {
      setError('браузер не поддерживает OffscreenCanvas')
      return
    }
    canvas.className = 'block size-full'
    stage.append(canvas)
    const offscreen = canvas.transferControlToOffscreen()

    const worker = new Worker(new URL('../player/player.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      const m = event.data
      if (m.type !== 'state' || m.seq !== seqRef.current) return
      setPlaying(m.playing)
      setFrame(m.frame)
      setError(m.error)
    }
    worker.onerror = () => setError('сбой потока предпросмотра')

    const init: ToWorker = { type: 'init', canvas: offscreen, size: backingSize() }
    worker.postMessage(init, [offscreen])

    // A move to a screen with another pixel ratio changes the wanted backing size. The query is
    // tied to one ratio and fires once, so it is re-created after every change.
    let query: MediaQueryList | null = null
    const watchRatio = () => {
      query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      query.addEventListener('change', onRatioChange, { once: true })
    }
    const onRatioChange = () => {
      const resize: ToWorker = { type: 'resize', size: backingSize() }
      worker.postMessage(resize)
      watchRatio()
    }
    watchRatio()

    return () => {
      query?.removeEventListener('change', onRatioChange)
      worker.terminate()
      canvas.remove()
      workerRef.current = null
      sentJson.current = null
    }
  }, [])

  // Declared after the mount effect so that, on the first run and after a StrictMode re-mount,
  // the worker already exists. An edit swaps the animation in place (the worker keeps the frame).
  useEffect(() => {
    const worker = workerRef.current
    if (!worker || json === sentJson.current) return
    sentJson.current = json
    const load: ToWorker = { type: 'load', json }
    worker.postMessage(load)
  }, [json])

  const togglePlay = () => {
    const worker = workerRef.current
    if (!worker) return
    const next = !playing
    setPlaying(next)
    const message: ToWorker = { type: next ? 'play' : 'pause', seq: ++seqRef.current }
    worker.postMessage(message)
  }

  // The worker only reports state every 100 ms and never while paused, so the slider
  // position and the play state are set locally as well as sent.
  const seek = (value: SliderValue) => {
    const target = typeof value === 'number' ? value : value[0]
    setFrame(target)
    setPlaying(false)
    const worker = workerRef.current
    if (!worker) return
    const message: ToWorker = { type: 'seek', seq: ++seqRef.current, frame: target }
    worker.postMessage(message)
  }

  return (
    // Children are centred with auto margins; when the pane is narrower than 512px they
    // overflow to the right (scrollable) instead of off the left edge (unreachable).
    <div className="flex flex-col items-start gap-3">
      {/* 512x512 CSS px stage: the ring is a box-shadow, so the canvas keeps its full 512px. */}
      <div
        ref={stageRef}
        className="checkerboard mx-auto size-[512px] overflow-hidden rounded-2xl ring-1 ring-border"
      />
      <div className="mx-auto flex w-[512px] items-center gap-3">
        <Button
          variant="secondary"
          size="icon"
          aria-label={playing ? 'Пауза' : 'Воспроизвести'}
          onClick={togglePlay}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <Slider
          className="min-w-0 flex-1"
          label="Кадр"
          showValue={false}
          min={0}
          max={Math.max(0, totalFrames - 1)}
          value={frame}
          onChange={seek}
        />
        <span className="min-w-[12ch] text-right text-body tabular-nums whitespace-nowrap text-muted-foreground">
          кадр {frame} / {totalFrames}
        </span>
      </div>
      {error !== null && (
        <p className="mx-auto text-body text-destructive" role="alert">
          Ошибка предпросмотра: {error}
        </p>
      )}
    </div>
  )
}
