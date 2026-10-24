import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Preview } from '@/preview/Preview'
import { readTgs, type Lottie } from '@/core/tgs'

interface Job { id: string; phase: string; ready: boolean; sent: boolean; video: string | null; error?: string }
export function TextStickerCustomizer({ template, url, onClose }: { template: string; url: string; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [text, setText] = useState(template === '569' ? 'СЕМЯ' : 'СТАС')
  const [animation, setAnimation] = useState<Lottie | null>(null), [playback, setPlayback] = useState(url)
  const [job, setJob] = useState<Job | null>(null), [error, setError] = useState(''), [requesting, setRequesting] = useState(false), [watch, setWatch] = useState(0)
  const busy = requesting || !!(job && ['queued', 'rendering', 'sending'].includes(job.phase))
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => el?.close() }, [])
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(playback, { signal: controller.signal })
        if (!response.ok) throw Error('Не удалось загрузить предпросмотр.')
        const data = await readTgs(new Uint8Array(await response.arrayBuffer()))
        if (!controller.signal.aborted) setAnimation(data)
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Ошибка предпросмотра.') }
    })()
    return () => controller.abort()
  }, [playback])
  useEffect(() => {
    if (!job?.id) return
    let cancelled = false; let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const response = await fetch(`/api/photo-stickers/jobs/${job.id}`, { cache: 'no-store' })
        const data = await response.json() as Job
        if (cancelled) return
        if (!response.ok) throw Error(data.error ?? 'Не удалось получить результат.')
        setJob(data)
        if (data.ready && data.video) setPlayback(data.video)
        if (data.phase === 'error') setError(data.error ?? 'Не удалось создать стикер.')
        else if (data.phase !== 'done') timer = setTimeout(poll, 900)
      } catch (e) { if (!cancelled) { setError(e instanceof Error ? e.message : 'Ошибка соединения.'); setJob(null) } }
    }
    void poll()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [job?.id, watch])
  const start = async (send: boolean) => {
    setRequesting(true); setError('')
    try {
      const reuse = send && job?.ready
      const response = await fetch(reuse ? `/api/photo-stickers/jobs/${job.id}/send` : '/api/photo-stickers/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Photo-Sticker': '1' }, body: JSON.stringify(reuse ? {} : { template, text, send }),
      })
      const data = await response.json() as Job
      if (!response.ok) throw Error(data.error ?? 'Не удалось создать стикер.')
      setJob(data); setWatch(n => n + 1)
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка соединения.') }
    finally { setRequesting(false) }
  }
  return <dialog ref={dialog} onCancel={onClose} aria-label="Стикер со своим текстом" className="m-auto max-h-[95vh] w-[544px] max-w-[95vw] overflow-y-auto rounded-2xl border border-border bg-background p-4 text-foreground shadow-xl backdrop:bg-black/50">
    {animation && <Preview json={JSON.stringify(animation)} totalFrames={animation.op - animation.ip} />}
    <label className="mt-3 flex flex-col gap-2 text-body">Текст на стикере
      <input value={text} maxLength={32} disabled={busy} onChange={e => { setText(e.target.value); setJob(null); setError('') }} className="w-full rounded-lg border border-border bg-background px-3 py-2 uppercase outline-none focus:ring-2 focus:ring-ring" placeholder="Введи свой текст" />
    </label>
    <p className="mt-1 text-caption text-muted-foreground">До 32 символов. Кириллица, латиница, цифры и знаки. Надпись будет заглавными буквами.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <Button size="compact" variant="secondary" disabled={busy || !text.trim()} onClick={() => void start(false)}>Применить текст</Button>
      <Button size="compact" variant="primary" disabled={busy || !text.trim() || !!job?.sent} onClick={() => void start(true)}>{job?.ready ? 'Отправить стикером в бота' : 'Создать и отправить в бота'}</Button>
    </div>
    <p role="status" className="mt-2 text-caption text-muted-foreground">{job?.sent ? 'Отправлено отдельным стикером.' : busy ? job?.phase === 'sending' ? 'Отправляю в бота…' : 'Создаю стикер…' : job?.ready ? 'Готово. В предпросмотре новый текст.' : 'Введи текст и нажми «Применить текст».'}</p>
    {error && <p role="alert" className="mt-2 text-caption text-red-600">{error}</p>}
    <div className="mt-3 flex items-center justify-between gap-4">
      <a href={playback} download="text-sticker.tgs" className="text-body underline">Скачать TGS</a>
      <Button size="compact" variant="secondary" onClick={onClose}>Закрыть</Button>
    </div>
  </dialog>
}
