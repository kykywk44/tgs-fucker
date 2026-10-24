import { useEffect, useRef, useState } from 'react'
import { Check as CheckIcon, CircleAlert, Send, X as XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { readStored, writeStored } from '@/ui/workspaceSession'
import { completed, panelKey, readTelegramSession, saveTelegramSession, stringList, targetsKey, type BotStatus } from '@/ui/telegramSession'

// «В Telegram» for stickers of the blue pack (drafts or ready ones): the emoji each is bound to,
// the bot's sets to add them to, and the bot's progress. They are added in the order given, to
// each chosen set in turn. The work is done by the dev server (server/remote.ts →
// scripts/package-blue.py → the bot's local control server); the bot reports progress in its
// Telegram chat and then sends each sticker as it came out in each set.

interface BotSet {
  name: string
  title: string
  kind: string
  link: string
}

interface Info {
  id: string
  emoji: string
  inReady: boolean
  sameAsReady: boolean
}

export interface TelegramPanelProps {
  set: 'drafts' | 'blue'
  ids: string[] // in the order they are added
  className?: string
  onClose(): void
  onAdded(): void // the pack changed: the library index is rebuilt in the background
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(init?.method === 'POST' ? 45000 : 20000), ...init })
  const body = (await response.json().catch(() => { throw new Error(`Сервер вернул некорректный ответ (${response.status}).`) })) as T & { error?: string; note?: string }
  if (!response.ok) throw new Error([body.error, body.note].filter(Boolean).join(' ') || `${response.status}`)
  return body
}

const kindLabel = (kind: string) => (kind === 'custom_emoji' ? 'эмодзи' : 'стикеры')
const message = (err: unknown) => String(err instanceof Error ? err.message : err)
const setsWord = (n: number) => (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'набора' : 'наборов')

export function TelegramPanel({ set, ids, className, onClose, onAdded }: TelegramPanelProps) {
  const cacheKey = panelKey(set, ids)
  const [saved] = useState(() => readTelegramSession(cacheKey))
  const [infos, setInfos] = useState<Info[] | null>(null)
  const [sets, setSets] = useState<BotSet[] | null>(null)
  const [emoji, setEmoji] = useState<Record<string, string>>(saved?.emoji ?? {})
  const [targets, setTargets] = useState<string[]>(() => readStored(targetsKey, stringList) ?? [])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<BotStatus | null>(saved?.status ?? null)
  const submitting = useRef(false)
  const key = ids.join(',')
  useEffect(() => { saveTelegramSession(cacheKey, { emoji, status }) }, [cacheKey, emoji, status])
  useEffect(() => { writeStored(targetsKey, targets) }, [targets])

  useEffect(() => {
    let stale = false
    setInfos(null)
    setError(null)
    getJson<{ items: Info[] }>(`/api/telegram/info?set=${set}&ids=${encodeURIComponent(key)}`)
      .then((data) => {
        if (stale) return
        setInfos(data.items)
        setEmoji(current => Object.fromEntries(data.items.map((it) => [it.id, current[it.id] ?? it.emoji])))
      })
      .catch((err: unknown) => !stale && setError(message(err)))
    return () => {
      stale = true
    }
  }, [set, key])

  useEffect(() => {
    let stale = false
    getJson<{ sets: BotSet[] }>('/api/telegram/sets')
      .then((data) => {
        if (stale) return
        setSets(data.sets)
        // the emoji set first: the pack is made for it
        const preferred = data.sets.find((s) => s.kind === 'custom_emoji') ?? data.sets[0]
        setTargets((current) => {
          const available = current.filter(name => data.sets.some(s => s.name === name))
          return available.length ? available : preferred ? [preferred.name] : []
        })
      })
      .catch((err: unknown) => !stale && setError(message(err)))
    return () => {
      stale = true
    }
  }, [])

  // While the bot works, its status is polled; it also edits one message in the Telegram chat.
  const running = status?.running ?? false
  useEffect(() => {
    if (!running || busy) return
    let stale = false, inFlight = false
    const poll = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const next = await getJson<BotStatus>('/api/telegram/status')
        if (!stale) { setStatus(next); setError(null) }
      } catch (err) { if (!stale) setError(`Не удалось получить прогресс: ${message(err)}`) }
      finally { inFlight = false }
    }
    void poll()
    const timer = setInterval(() => { void poll() }, 3000)
    return () => { stale = true; clearInterval(timer) }
  }, [running, busy])

  // Another version already in the pack can't be replaced in the set: those are left out.
  const conflict = (it: Info) => set === 'drafts' && it.inReady && !it.sameAsReady
  const sending = infos?.filter((it) => !conflict(it)) ?? []
  const ready = sending.length > 0 && sending.every((it) => emoji[it.id]) && targets.length > 0

  const toggleTarget = (name: string) =>
    setTargets((current) => (current.includes(name) ? current.filter((n) => n !== name) : [...current, name]))

  const add = async () => {
    if (submitting.current || busy || running || !ready) return
    submitting.current = true
    setBusy(true)
    setError(null)
    const pending = { running: true, status: 'Подготавливаю файлы и передаю боту…', links: [] }
    saveTelegramSession(cacheKey, { emoji, status: pending })
    setStatus(pending)
    try {
      const result = await getJson<{ links?: string[] }>('/api/telegram/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          set,
          items: sending.map((it) => ({ id: it.id, emoji: emoji[it.id] })),
          // in the order of the bot's list
          names: sets?.filter((s) => targets.includes(s.name)).map((s) => s.name) ?? [],
        }),
      })
      const started = { running: true, status: 'Бот начал загрузку…', links: result.links ?? [] }
      saveTelegramSession(cacheKey, { emoji, status: started })
      setStatus(started)
      onAdded()
    } catch (err) {
      setError(message(err))
      setStatus(null)
      saveTelegramSession(cacheKey, { emoji, status: null })
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  const done = status && !status.running
  const succeeded = status && completed(status)
  const title = ids.length === 1 ? ids[0] : `${ids.length} шт.`

  return (
    <section aria-label="Добавить в Telegram" className={cn('flex shrink-0 flex-col gap-3 border-t border-border bg-muted/40 px-4 py-3', className)}>
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-body font-medium">В Telegram: {title}</h2>
        <Button type="button" size="icon-compact" variant="ghost" aria-label="Закрыть" onClick={onClose}>
          <XIcon />
        </Button>
      </div>

      {!status && (
        <>
          <ol className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {!infos && !error && <li className="text-body text-muted-foreground">Загрузка…</li>}
            {infos?.map((it, n) => (
              <li key={it.id} className="flex items-center gap-2 text-body">
                <span className="w-5 shrink-0 text-right text-caption tabular-nums text-muted-foreground">{n + 1}</span>
                <input
                  aria-label={`Эмодзи для ${it.id}`}
                  value={emoji[it.id] ?? ''}
                  onChange={(e) => setEmoji((all) => ({ ...all, [it.id]: e.target.value.trim() }))}
                  maxLength={16}
                  disabled={conflict(it)}
                  className="h-8 w-14 shrink-0 rounded-lg border border-border bg-background px-1 text-center text-[18px] text-foreground disabled:opacity-50"
                />
                <span className={cn('min-w-0 flex-1 truncate', conflict(it) && 'text-muted-foreground line-through')}>{it.id}</span>
                {conflict(it) ? (
                  <span className="shrink-0 text-caption text-destructive">другая версия в паке</span>
                ) : (
                  it.inReady && <span className="shrink-0 text-caption text-muted-foreground">уже в паке</span>
                )}
              </li>
            ))}
          </ol>

          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-caption text-muted-foreground">Наборы — по очереди</legend>
            {!sets && !error && <p className="text-body text-muted-foreground">Загрузка…</p>}
            {sets?.length === 0 && <p className="text-body text-muted-foreground">У бота нет наборов — /newpack в чате</p>}
            {sets?.map((s) => (
              <label key={s.name} className="flex min-h-8 cursor-pointer items-center gap-2 text-body">
                <input type="checkbox" className="size-4 accent-primary" checked={targets.includes(s.name)} onChange={() => toggleTarget(s.name)} />
                <span className="min-w-0 truncate">
                  {s.title} <span className="text-muted-foreground">· {kindLabel(s.kind)}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <Button type="button" variant="primary" leadingIcon={Send} disabled={busy || !ready} onClick={add} className="self-start">
            {busy ? 'Отправляю…' : `Добавить ${sending.length || ''}${targets.length > 1 ? ` в ${targets.length} ${setsWord(targets.length)}` : ''}`.trim()}
          </Button>
        </>
      )}

      {status && (
        <div role="status" aria-live="polite" className="flex flex-col gap-1 text-body">
          <p className="whitespace-pre-line text-foreground">
            {succeeded && <CheckIcon className="mr-1 inline size-4 text-primary" />}
            {done && !succeeded && <CircleAlert className="mr-1 inline size-4 text-destructive" />}
            {status.status}
          </p>
          {status.links.map((link) => (
            <a key={link} href={link} target="_blank" rel="noreferrer" className="text-primary underline">
              {link}
            </a>
          ))}
          <p className="text-caption text-muted-foreground">
            {done ? succeeded ? 'Как получилось — в чате с ботом.' : 'Загрузка не завершена. Проверь сообщение бота выше.' : 'Прогресс также в чате с ботом; потом он пришлёт, как получилось.'}
          </p>
          {done && <Button type="button" size="compact" variant="secondary" className="self-start" onClick={() => { setStatus(null); setError(null) }}>Отправить ещё</Button>}
        </div>
      )}

      {error && <p className="text-body text-destructive">{error}</p>}
    </section>
  )
}
