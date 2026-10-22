import { useEffect, useState } from 'react'
import { Check as CheckIcon, Send, X as XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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

interface BotStatus {
  running: boolean
  status: string
  links: string[]
}

export interface TelegramPanelProps {
  set: 'drafts' | 'blue'
  ids: string[] // in the order they are added
  className?: string
  onClose(): void
  onAdded(): void // the pack changed: the library index is rebuilt in the background
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body = (await response.json()) as T & { error?: string; note?: string }
  if (!response.ok) throw new Error([body.error, body.note].filter(Boolean).join(' ') || `${response.status}`)
  return body
}

const kindLabel = (kind: string) => (kind === 'custom_emoji' ? 'эмодзи' : 'стикеры')
const message = (err: unknown) => String(err instanceof Error ? err.message : err)
const setsWord = (n: number) => (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'набора' : 'наборов')

export function TelegramPanel({ set, ids, className, onClose, onAdded }: TelegramPanelProps) {
  const [infos, setInfos] = useState<Info[] | null>(null)
  const [sets, setSets] = useState<BotSet[] | null>(null)
  const [emoji, setEmoji] = useState<Record<string, string>>({})
  const [targets, setTargets] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<BotStatus | null>(null)
  const key = ids.join(',')

  useEffect(() => {
    let stale = false
    setInfos(null)
    setError(null)
    setStatus(null)
    getJson<{ items: Info[] }>(`/api/telegram/info?set=${set}&ids=${encodeURIComponent(key)}`)
      .then((data) => {
        if (stale) return
        setInfos(data.items)
        setEmoji(Object.fromEntries(data.items.map((it) => [it.id, it.emoji])))
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
        setTargets((current) => (current.length ? current : preferred ? [preferred.name] : []))
      })
      .catch((err: unknown) => !stale && setError(message(err)))
    return () => {
      stale = true
    }
  }, [])

  // While the bot works, its status is polled; it also edits one message in the Telegram chat.
  const running = status?.running ?? false
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      getJson<BotStatus>('/api/telegram/status').then(setStatus, () => {})
    }, 3000)
    return () => clearInterval(timer)
  }, [running])

  // Another version already in the pack can't be replaced in the set: those are left out.
  const conflict = (it: Info) => set === 'drafts' && it.inReady && !it.sameAsReady
  const sending = infos?.filter((it) => !conflict(it)) ?? []
  const ready = sending.length > 0 && sending.every((it) => emoji[it.id]) && targets.length > 0

  const toggleTarget = (name: string) =>
    setTargets((current) => (current.includes(name) ? current.filter((n) => n !== name) : [...current, name]))

  const add = async () => {
    setBusy(true)
    setError(null)
    try {
      await getJson('/api/telegram/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          set,
          items: sending.map((it) => ({ id: it.id, emoji: emoji[it.id] })),
          // in the order of the bot's list
          names: sets?.filter((s) => targets.includes(s.name)).map((s) => s.name) ?? [],
        }),
      })
      setStatus({ running: true, status: 'Бот начал загрузку…', links: [] })
      onAdded()
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  const done = status && !status.running
  const title = ids.length === 1 ? ids[0] : `${ids.length} шт.`

  return (
    <section aria-label="Добавить в Telegram" className={cn('flex shrink-0 flex-col gap-3 border-t border-border bg-muted/40 px-4 py-3', className)}>
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-body font-medium">В Telegram: {title}</h2>
        <Button size="icon-compact" variant="ghost" aria-label="Закрыть" onClick={onClose}>
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

          <Button variant="primary" leadingIcon={Send} disabled={busy || !ready} onClick={add} className="self-start">
            {busy ? 'Отправляю…' : `Добавить ${sending.length || ''}${targets.length > 1 ? ` в ${targets.length} ${setsWord(targets.length)}` : ''}`.trim()}
          </Button>
        </>
      )}

      {status && (
        <div className="flex flex-col gap-1 text-body">
          <p className="whitespace-pre-line text-foreground">
            {done && <CheckIcon className="mr-1 inline size-4 text-primary" />}
            {status.status}
          </p>
          {status.links.map((link) => (
            <a key={link} href={link} target="_blank" rel="noreferrer" className="text-primary underline">
              {link}
            </a>
          ))}
          <p className="text-caption text-muted-foreground">
            {done ? 'Как получилось — в чате с ботом.' : 'Прогресс также в чате с ботом; потом он пришлёт, как получилось.'}
          </p>
        </div>
      )}

      {error && <p className="text-body text-destructive">{error}</p>}
    </section>
  )
}
