import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { Check as CheckIcon, Copy, FolderOpen, Pause, Play, Send, X as XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { FromGrid, ToGrid } from '@/player/grid'
import { TelegramPanel } from '@/ui/TelegramPanel'

// The «Эмодзи» tab: library/emoji (Telegram's animated emoji, numbered) and the blue pack.
// With «Анимация» on, tiles on screen play (grid.worker.ts, an OffscreenCanvas per visible tile);
// the static sprite shows until a tile's first frame and for everything off screen. Click selects, Shift+click selects a
// range, the bar at the bottom copies the selected ids for a batch request to Claude.
// Double-click (or «Открыть», on a phone) opens one in the editor; the tab stays mounted (selection,
// scroll) while hidden. Selected stickers of the blue pack or its drafts can be sent to Telegram
// (TelegramPanel), in the order they were clicked.
// Index and sprites come from `node scripts/library.mjs` (served by the dev server).

interface LibraryItem {
  id: string // "167" — file name without .tgs
  file: string
  nm: string | null // root name, often generic ("Comp 1")
  kb: number
  sprite: string // library/thumbs/<sprite>
  cell: number // position in the sprite, row-major
  done?: string[] // emoji: pack items made from it ("blue/middle-finger")
  from?: string // pack item: the emoji it was made from
}

interface LibrarySet {
  id: string
  title: string
  dir: string
  items: LibraryItem[]
}

interface LibraryIndex {
  thumb: number
  cols: number
  sets: LibrarySet[]
}

const TILE = 64 // css px
// Set names on a phone, where the full ones push «Анимация» off the screen.
const SHORT_TITLE: Record<string, string> = { emoji: 'Telegram', blue: 'Готово', drafts: 'Черновики' }

export interface PackOrigin {
  set: 'drafts' | 'blue'
  id: string
}

export interface LibraryProps {
  active: boolean // false while the editor is shown: playback pauses
  onOpen(file: File, origin: PackOrigin | null): void // origin: a sticker of the blue pack or its drafts
  reload?: number // changed: the index is fetched again (the pack changed elsewhere)
}

interface GridApi {
  /** Plays `url` in `slot` while it is on screen, hiding `sprite` once a frame is drawn. */
  attach(key: string, url: string, slot: HTMLElement, sprite: HTMLElement): () => void
}

// A screenful of emoji costs ~30 ms per frame at 96 px on one core, so the tiles are shared
// between a few workers (by key) and drawn at no more than 96 px (shown at 64 CSS px). A tile
// gets a canvas and an animation only while it is on screen; leaving drops both, so the cost
// stays one screenful however far the list is scrolled.
// Scrolling starts nothing and pauses playback; tiles start once the list rests this long.
const SETTLE_MS = 500
const WORKERS = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1))
const BACKING = Math.min(96, Math.round(TILE * window.devicePixelRatio))

function shard(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return Math.abs(h) % WORKERS
}

interface Slot {
  key: string
  url: string
  sprite: HTMLElement
  canvas: HTMLCanvasElement | null
}

// The grid workers of the tab, alive only while animation is on.
function useGrid(root: RefObject<HTMLElement | null>, enabled: boolean, active: boolean): GridApi | null {
  const [api, setApi] = useState<GridApi | null>(null)
  const workersRef = useRef<Worker[]>([])

  useEffect(() => {
    const rootEl = root.current
    if (!enabled || !rootEl || typeof OffscreenCanvas === 'undefined') return
    const slots = new Map<Element, Slot>()
    const byKey = new Map<string, Slot>()
    const workers = Array.from({ length: WORKERS }, () => {
      const worker = new Worker(new URL('../player/grid.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<FromGrid>) => {
        const slot = byKey.get(event.data.key)
        if (event.data.type === 'ready' && slot?.canvas) slot.sprite.style.setProperty('visibility', 'hidden')
      }
      worker.postMessage({ type: 'init', size: BACKING } satisfies ToGrid)
      return worker
    })
    workersRef.current = workers
    const post = (key: string, m: ToGrid, transfer: Transferable[] = []) => workers[shard(key)].postMessage(m, transfer)

    const show = (el: Element, slot: Slot) => {
      if (slot.canvas) return
      const canvas = document.createElement('canvas')
      canvas.className = 'absolute inset-0 size-full'
      el.append(canvas)
      const offscreen = canvas.transferControlToOffscreen()
      post(slot.key, { type: 'attach', key: slot.key, url: slot.url, canvas: offscreen }, [offscreen])
      slot.canvas = canvas
    }
    const hide = (slot: Slot) => {
      if (!slot.canvas) return
      post(slot.key, { type: 'detach', key: slot.key })
      slot.canvas.remove()
      slot.canvas = null
      slot.sprite.style.removeProperty('visibility')
    }

    // On screen but not started yet: waits for the scroll to settle.
    const waiting = new Set<Element>()
    let settle: ReturnType<typeof setTimeout> | null = null
    let scrolling = false
    const flush = () => {
      settle = null
      scrolling = false
      for (const el of waiting) {
        const slot = slots.get(el)
        if (slot) show(el, slot)
      }
      waiting.clear()
      for (const worker of workers) worker.postMessage({ type: 'resume' } satisfies ToGrid)
    }
    const onScroll = () => {
      if (!scrolling) for (const worker of workers) worker.postMessage({ type: 'pause' } satisfies ToGrid)
      scrolling = true
      if (settle) clearTimeout(settle)
      settle = setTimeout(flush, SETTLE_MS)
    }
    rootEl.addEventListener('scroll', onScroll, { passive: true })

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const slot = slots.get(entry.target)
          if (!slot) continue
          if (entry.isIntersecting) {
            if (scrolling) waiting.add(entry.target)
            else show(entry.target, slot)
          } else {
            waiting.delete(entry.target)
            hide(slot)
          }
        }
      },
      { root: rootEl, rootMargin: '32px' },
    )
    setApi({
      attach(key, url, el, sprite) {
        const slot: Slot = { key, url, sprite, canvas: null }
        slots.set(el, slot)
        byKey.set(key, slot)
        observer.observe(el)
        return () => {
          observer.unobserve(el)
          waiting.delete(el)
          hide(slot)
          slots.delete(el)
          if (byKey.get(key) === slot) byKey.delete(key)
        }
      },
    })
    return () => {
      rootEl.removeEventListener('scroll', onScroll)
      if (settle) clearTimeout(settle)
      observer.disconnect()
      for (const slot of slots.values()) {
        slot.canvas?.remove()
        slot.sprite.style.removeProperty('visibility')
      }
      for (const worker of workers) worker.terminate()
      workersRef.current = []
      setApi(null)
    }
  }, [root, enabled])

  useEffect(() => {
    for (const worker of workersRef.current) worker.postMessage({ type: active ? 'resume' : 'pause' } satisfies ToGrid)
  }, [active, api])

  return api
}

// Whether the grid plays: off by default, remembered per browser.
const ANIMATE_KEY = 'library.animate'
function useAnimateSetting(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(ANIMATE_KEY) === '1'
    } catch {
      return false
    }
  })
  const set = (next: boolean) => {
    setOn(next)
    try {
      localStorage.setItem(ANIMATE_KEY, next ? '1' : '0')
    } catch {
      // storage unavailable: the choice lasts until reload
    }
  }
  return [on, set]
}

// A tile's picture: the sprite cell under a canvas the worker draws into.
function Thumb({ api, k, url, sprite }: { api: GridApi | null; k: string; url: string; sprite: CSSProperties }) {
  const slot = useRef<HTMLSpanElement>(null)
  const still = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!api || !slot.current || !still.current) return
    return api.attach(k, url, slot.current, still.current)
  }, [api, k, url])
  return (
    <span ref={slot} aria-hidden className="relative block" style={{ width: TILE, height: TILE }}>
      <span ref={still} className="absolute inset-0" style={sprite} />
    </span>
  )
}

export function Library({ active, onOpen, reload = 0 }: LibraryProps) {
  const [index, setIndex] = useState<LibraryIndex | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [setId, setSetId] = useState('emoji')
  // Selection per set, kept while switching sets.
  const [selected, setSelected] = useState<Record<string, Set<string>>>({})
  const anchor = useRef<number | null>(null)
  const [copied, setCopied] = useState(false)
  const gridRef = useRef<HTMLUListElement>(null)
  const scrollTop = useRef(0)
  const [animate, setAnimate] = useAnimateSetting()
  const [telegram, setTelegram] = useState(false)
  // Bumped to fetch the index again (after «В Telegram» the server rebuilds it in the background).
  const [indexSeq, setIndexSeq] = useState(0)
  const api = useGrid(gridRef, animate && index !== null, active)

  // Hidden behind the editor the list may lose its scroll position; put it back on return.
  useLayoutEffect(() => {
    if (active && gridRef.current) gridRef.current.scrollTop = scrollTop.current
  }, [active])

  useEffect(() => {
    let stale = false
    fetch(`/library/index.json${indexSeq + reload ? `?v=${indexSeq}-${reload}` : ''}`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<LibraryIndex>
      })
      .then((data) => !stale && setIndex(data))
      .catch(() => !stale && setError('Нет library/index.json — запустите node scripts/library.mjs'))
    return () => {
      stale = true
    }
  }, [indexSeq, reload])

  const set = index?.sets.find((s) => s.id === setId) ?? null
  const picked = useMemo(() => selected[setId] ?? new Set<string>(), [selected, setId])
  // Ids in the set's order, not in click order.
  const pickedIds = useMemo(() => (set ? set.items.filter((it) => picked.has(it.id)).map((it) => it.id) : []), [set, picked])

  const toggle = useCallback(
    (i: number, range: boolean) => {
      if (!set) return
      const next = new Set(picked)
      if (range && anchor.current !== null) {
        const [a, b] = [anchor.current, i].sort((x, y) => x - y)
        for (let k = a; k <= b; k++) next.add(set.items[k].id)
      } else {
        const id = set.items[i].id
        if (next.has(id)) next.delete(id)
        else next.add(id)
      }
      anchor.current = i
      setSelected((all) => ({ ...all, [set.id]: next }))
    },
    [set, picked],
  )

  const single = pickedIds.length === 1 ? pickedIds[0] : null
  // The Telegram panel takes the selection of the pack or its drafts in click order (a Set keeps it).
  const packSet = setId === 'drafts' || setId === 'blue' ? setId : null
  const clicked = useMemo(() => (set ? [...picked].filter((id) => set.items.some((it) => it.id === id)) : []), [set, picked])
  const sendable = packSet !== null && clicked.length > 0
  useEffect(() => {
    if (!sendable) setTelegram(false)
  }, [sendable])

  const clear = () => {
    anchor.current = null
    setSelected((all) => ({ ...all, [setId]: new Set() }))
  }

  const copy = async () => {
    await navigator.clipboard.writeText(pickedIds.join(', '))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const open = async (item: LibraryItem) => {
    if (!set) return
    const response = await fetch(`/${set.dir}/${item.file}`)
    if (response.ok) onOpen(new File([await response.blob()], `${item.id}.tgs`), packSet ? { set: packSet, id: item.id } : null)
  }

  if (error) return <p className="m-auto p-6 text-body text-muted-foreground">{error}</p>
  if (!index || !set) return <p className="m-auto p-6 text-body text-muted-foreground">Загрузка…</p>

  const sheetPx = index.cols * TILE

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2 py-2 sm:px-4">
        {index.sets.map((s) => (
          <Button
            key={s.id}
            size="compact"
            variant={s.id === setId ? 'secondary' : 'ghost'}
            aria-pressed={s.id === setId}
            className="whitespace-nowrap"
            onClick={() => {
              anchor.current = null
              scrollTop.current = 0
              if (gridRef.current) gridRef.current.scrollTop = 0
              setSetId(s.id)
            }}
          >
            <span className="max-sm:hidden">{s.title}</span>
            <span className="sm:hidden">{SHORT_TITLE[s.id] ?? s.title}</span> · {s.items.length}
          </Button>
        ))}
        <span className="ml-auto hidden truncate text-body text-muted-foreground lg:block">
          Клик — выбрать, Shift+клик — диапазон, двойной клик — открыть в редакторе
        </span>
        <Button
          size="compact"
          variant={animate ? 'secondary' : 'ghost'}
          aria-pressed={animate}
          leadingIcon={animate ? Pause : Play}
          className="ml-auto shrink-0 whitespace-nowrap lg:ml-2"
          title="Проигрывать эмодзи, которые сейчас на экране"
          onClick={() => setAnimate(!animate)}
        >
          <span className="max-sm:sr-only">{animate ? 'Анимация: вкл' : 'Анимация: выкл'}</span>
        </Button>
      </div>

      <ul
        ref={gridRef}
        onScroll={(e) => {
          if (active) scrollTop.current = e.currentTarget.scrollTop
        }}
        aria-label={set.title}
        className="grid min-h-0 flex-1 content-start gap-1 overflow-y-auto p-2 sm:p-4"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${TILE + 16}px, 1fr))` }}
      >
        {set.items.map((item, i) => {
          const on = picked.has(item.id)
          const title = [item.id, item.nm, `${item.kb} KB`, item.done && `синий: ${item.done.join(', ')}`, item.from && `из ${item.from}`]
            .filter(Boolean)
            .join(' · ')
          return (
            <li key={item.id} className="[content-visibility:auto] [contain-intrinsic-size:80px_96px]">
              <button
                type="button"
                title={title}
                aria-pressed={on}
                onClick={(e) => toggle(i, e.shiftKey)}
                onDoubleClick={() => open(item)}
                className={cn(
                  'relative flex w-full cursor-pointer flex-col items-center gap-0.5 rounded-xl p-1.5 outline-none select-none',
                  'hover:bg-muted focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)]',
                  on && 'bg-primary/10 ring-2 ring-primary hover:bg-primary/15',
                )}
              >
                <Thumb
                  api={api}
                  k={`${set.id}/${item.id}`}
                  url={`/${set.dir}/${item.file}`}
                  sprite={{
                    backgroundImage: `url(/library/thumbs/${item.sprite})`,
                    backgroundSize: `${sheetPx}px auto`,
                    backgroundPosition: `-${(item.cell % index.cols) * TILE}px -${Math.floor(item.cell / index.cols) * TILE}px`,
                  }}
                />
                <span className="text-caption tabular-nums text-muted-foreground">{item.id}</span>
                {on && (
                  <CheckIcon className="absolute top-1 right-1 size-4 rounded-full bg-primary p-0.5 text-primary-foreground" />
                )}
                {item.done && !on && (
                  <span
                    className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-[#6086a7] ring-2 ring-background"
                    aria-label="есть синяя версия"
                  />
                )}
              </button>
            </li>
          )
        })}
      </ul>

      {telegram && sendable && packSet && (
        <TelegramPanel
          set={packSet}
          ids={clicked}
          onClose={() => setTelegram(false)}
          onAdded={() => {
            // the server rebuilds library/index.json after the archive; pick it up when it is likely done
            setTimeout(() => setIndexSeq((n) => n + 1), 20000)
          }}
        />
      )}

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-2 py-2 sm:gap-3 sm:px-4 sm:py-3">
        <span className="min-w-0 flex-1 basis-full truncate text-body text-muted-foreground tabular-nums sm:basis-auto">
          {pickedIds.length ? `Выбрано ${pickedIds.length}: ${pickedIds.join(', ')}` : 'Ничего не выбрано'}
        </span>
        <Button variant="ghost" size="compact" leadingIcon={XIcon} disabled={!pickedIds.length} onClick={clear}>
          Снять<span className="max-sm:hidden">&nbsp;выделение</span>
        </Button>
        {single && (
          <Button
            variant="secondary"
            size="compact"
            leadingIcon={FolderOpen}
            onClick={() => {
              const item = set.items.find((it) => it.id === single)
              if (item) void open(item)
            }}
          >
            Открыть
          </Button>
        )}
        {sendable && (
          <Button variant={telegram ? 'secondary' : 'ghost'} size="compact" leadingIcon={Send} aria-pressed={telegram} onClick={() => setTelegram(!telegram)}>
            В Telegram{clicked.length > 1 ? ` · ${clicked.length}` : ''}
          </Button>
        )}
        <Button variant="primary" size="compact" leadingIcon={copied ? CheckIcon : Copy} disabled={!pickedIds.length} onClick={copy}>
          {copied ? 'Скопировано' : 'Скопировать ID'}
        </Button>
      </div>
    </div>
  )
}
