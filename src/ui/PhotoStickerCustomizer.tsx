import { useEffect, useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Job { id: string; phase: string; ready: boolean; sent: boolean; video: string | null; error?: string }
const labels: Record<string, string> = { queued: 'В очереди…', rendering: 'Создаю стикер с фотографией…', sending: 'Отправляю в бота…' }
function dataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Не удалось прочитать фото.')); reader.readAsDataURL(file) })
}
export function PhotoStickerCustomizer({ template, onVideo }: { template: string; onVideo(url: string): void }) {
  const picker = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<File | null>(null), [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState(''), [requesting, setRequesting] = useState(false), [watch, setWatch] = useState(0)
  const busy = requesting || !!(job && ['queued', 'rendering', 'sending'].includes(job.phase))
  useEffect(() => {
    if (!job?.id) return
    let cancelled = false; let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const response = await fetch(`/api/photo-stickers/jobs/${job.id}`, { cache: 'no-store' })
        const data = await response.json() as Job
        if (cancelled) return
        if (!response.ok) throw new Error(data.error ?? 'Не удалось получить результат.')
        setJob(data)
        if (data.ready && data.video) onVideo(data.video)
        if (data.phase === 'error') setError(data.error ?? 'Не удалось создать стикер.')
        else if (data.phase !== 'done') timer = setTimeout(poll, 1200)
      } catch (e) { if (!cancelled) { setError(e instanceof Error ? e.message : 'Ошибка соединения.'); setJob(null) } }
    }
    void poll()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [job?.id, watch, onVideo])

  const start = async (send: boolean) => {
    setError(''); setRequesting(true)
    try {
      const reuse = send && job?.ready
      const url = reuse ? `/api/photo-stickers/jobs/${job.id}/send` : '/api/photo-stickers/jobs'
      const payload = reuse ? {} : { template, send, ...(photo ? { photo: await dataUrl(photo) } : {}) }
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Photo-Sticker': '1' }, body: JSON.stringify(payload) })
      const data = await response.json() as Job
      if (!response.ok) throw new Error(data.error ?? 'Не удалось запустить обработку.')
      setJob(data); setWatch(n => n + 1)
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка соединения.') }
    finally { setRequesting(false) }
  }
  return <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 text-body">
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/60 p-3">
      <Button size="compact" variant="secondary" leadingIcon={ImagePlus} disabled={busy} onClick={() => picker.current?.click()}>{photo ? 'Заменить фото' : 'Выбрать фото'}</Button>
      <span className="min-w-0 flex-1 truncate text-caption text-muted-foreground" title={photo?.name}>{photo?.name ?? 'PNG, JPEG или WebP · до 15 MB'}</span>
      <input ref={picker} aria-label="Выбрать фото для стикера" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} className="hidden" onChange={e => {
        const file = e.target.files?.[0] ?? null
        if (file && file.size > 15 * 1024 * 1024) { setPhoto(null); setJob(null); setError('Выбери фото до 15 MB.'); return }
        setPhoto(file); setJob(null); setError('')
      }} />
    </div>
    <div className="flex flex-wrap gap-2">
      <Button size="compact" variant="secondary" disabled={busy || !photo} onClick={() => void start(false)}>Применить фото</Button>
      <Button size="compact" variant="primary" disabled={busy || !!job?.sent} onClick={() => void start(true)}>{photo && !job?.ready ? 'Создать и отправить в бота' : 'Отправить стикером в бота'}</Button>
    </div>
    <p role="status" className="text-caption text-muted-foreground">{job?.sent ? 'Отправлено отдельным стикером. В наборы не добавлено.' : busy ? labels[job?.phase ?? 'queued'] : 'Можно отправить текущий вариант или выбрать свою фотографию.'}</p>
    {error && <p role="alert" className="text-caption text-red-600">{error}</p>}
  </div>
}
