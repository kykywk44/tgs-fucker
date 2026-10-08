import { useCallback, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { LottiePlayer, type TLottie, type TLottieEventPayload } from 'tlottie/react'
import 'tlottie/react/style.css'
import { Button } from '@/components/ui/button'
import { Slider, type SliderValue } from '@/components/ui/slider'

export interface PreviewProps {
  json: string // Lottie JSON string
  totalFrames: number // op - ip
}

export function Preview({ json, totalFrames }: PreviewProps) {
  const [playing, setPlaying] = useState(true) // autoplay is on
  const [frame, setFrame] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const playerRef = useRef<TLottie | null>(null)
  const detachRef = useRef<(() => void) | null>(null)

  // Called by LottiePlayer with the new instance, and with null before the old
  // instance is destroyed (instance change or unmount). Listeners are attached
  // synchronously here so no worker event can slip in before they exist.
  const handlePlayer = useCallback((player: TLottie | null) => {
    detachRef.current?.()
    detachRef.current = null
    playerRef.current = player
    if (!player) return

    setPlaying(true)
    setFrame(0)
    setError(null)

    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onStop = () => setPlaying(false)
    const onComplete = () => setPlaying(false)
    // The engine reports fractional frames during playback; show the whole frame being drawn.
    const onFrame = (payload: TLottieEventPayload) => {
      if (payload.frames) setFrame(Math.floor(payload.frames.current))
    }
    const onError = (payload: TLottieEventPayload) => {
      const reason = payload.error?.reason ?? 'unknown'
      const message = payload.error?.message ?? 'unknown error'
      setError(`${reason}: ${message}`)
    }

    player.on('play', onPlay)
    player.on('pause', onPause)
    player.on('stop', onStop)
    player.on('complete', onComplete)
    player.on('frame', onFrame)
    player.on('error', onError)

    detachRef.current = () => {
      player.off('play', onPlay)
      player.off('pause', onPause)
      player.off('stop', onStop)
      player.off('complete', onComplete)
      player.off('frame', onFrame)
      player.off('error', onError)
    }
  }, [])

  const togglePlay = () => {
    const player = playerRef.current
    if (!player) return
    if (playing) player.pause()
    else player.play()
  }

  // The worker throttles 'frame' events while paused, so the slider position is
  // set locally as well as sent to the player.
  const seek = (value: SliderValue) => {
    const target = typeof value === 'number' ? value : value[0]
    setFrame(target)
    const player = playerRef.current
    if (!player) return
    player.pause()
    player.seek(target)
  }

  return (
    // Children are centred with auto margins; when the pane is narrower than 512px they
    // overflow to the right (scrollable) instead of off the left edge (unreachable).
    <div className="flex flex-col items-start gap-3">
      {/* 512x512 CSS px stage: the ring is a box-shadow, so the canvas keeps its full 512px. */}
      <div className="checkerboard mx-auto size-[512px] overflow-hidden rounded-2xl ring-1 ring-border">
        <LottiePlayer
          className="size-full"
          data={json}
          loop
          autoplay
          reportFrames
          lottieRefCallback={handlePlayer}
        />
      </div>
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
