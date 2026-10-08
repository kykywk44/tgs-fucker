import type { Lottie } from './tgs'

export type CheckId = 'canvas' | 'fps' | 'duration' | 'size'
export interface Check { id: CheckId; label: string; value: string; limit: string; ok: boolean }

// Telegram sticker limits: 512×512 canvas, 60 fps, at most 3 s, at most 64 KB.
const CANVAS = 512
const FPS = 60
const MAX_SECONDS = 3
const MAX_KB = 64

// Evaluates the four Telegram sticker checks, always in the order canvas, fps,
// duration, size. Reads `anim` and `exportBytes` only; never mutates them.
export function telegramChecks(anim: Lottie, exportBytes: number): Check[] {
  const { w, h, fr, ip, op } = anim
  const frames = op - ip
  const durationKnown = Number.isFinite(fr) && fr > 0 && Number.isFinite(frames)
  const seconds = durationKnown ? frames / fr : NaN

  return [
    {
      id: 'canvas',
      label: 'Размер холста',
      value: `${w}×${h}`,
      limit: `${CANVAS}×${CANVAS}`,
      ok: w === CANVAS && h === CANVAS,
    },
    {
      id: 'fps',
      label: 'Частота кадров',
      value: `${fr} fps`,
      limit: `${FPS} fps`,
      ok: fr === FPS,
    },
    {
      id: 'duration',
      label: 'Длительность',
      value: durationKnown ? `${seconds.toFixed(1)} с` : '—',
      limit: `${MAX_SECONDS} с`,
      ok: durationKnown && frames <= MAX_SECONDS * fr,
    },
    {
      id: 'size',
      label: 'Размер файла',
      value: `${(exportBytes / 1024).toFixed(1)} KB`,
      limit: `${MAX_KB} KB`,
      ok: exportBytes <= MAX_KB * 1024,
    },
  ]
}
