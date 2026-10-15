import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Lottie } from '@/core/tgs'
import { readColorSites } from '@/core/colors'
import { recolorFamily, viewFamily, type FamilyView } from '@/core/families'
import type { GlyphSet } from '@/core/glyphs'
import type { Part, TextSpec } from '@/core/parts'
import { readText, replaceText, validateText } from '@/core/text'
import { Popover, PopoverTrigger } from '@/components/ui/popover'
import { PickerPopup, type ColorSession } from '@/ui/colorSession'

interface PartsProps {
  anim: Lottie // the committed animation (never the preview)
  parts: Part[] // the resolved parts of a known sticker, in profile order
  session: ColorSession // the inspector's one colour-editing session
  onTextCommit: (next: Lottie, siteOrigin: number[]) => void // a new inscription, with where its colour sites come from
}

// The named parts of a known sticker (iris, pupil, ...): one key swatch each,
// recolouring the whole part. No shade grid; the palette below has the shades.
// A part holding an inscription also gets its text field.
export function Parts({ anim, parts, session, onTextCommit }: PartsProps) {
  const titleId = useId()
  const sites = useMemo(() => readColorSites(anim), [anim])
  const views = useMemo(() => parts.map((part) => viewFamily(sites, part)), [sites, parts])

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-body font-semibold">
        Части
      </h2>
      <ul className="flex flex-col gap-2">
        {parts.map((part, index) => (
          <PartCard
            key={part.id}
            anim={anim}
            part={part}
            view={views[index]}
            session={session}
            onTextCommit={onTextCommit}
          />
        ))}
      </ul>
    </section>
  )
}

interface PartCardProps {
  anim: Lottie
  part: Part
  view: FamilyView
  session: ColorSession
  onTextCommit: PartsProps['onTextCommit']
}

function PartCard({ anim, part, view, session, onTextCommit }: PartCardProps) {
  const { key, shades } = view
  const keyId = `part:${part.id}`

  return (
    <li className="flex flex-col gap-1 rounded-xl p-2 ring-1 ring-inset ring-foreground/10">
      <div className="flex items-center gap-3">
        <Popover
          open={session.openId === keyId}
          onOpenChange={(next, details) =>
            session.onOpenChange(
              { id: keyId, from: key, apply: (committed, picked) => recolorFamily(committed, part, picked) },
              next,
              details.reason,
            )
          }
        >
          <PopoverTrigger
            data-part-key={part.id}
            aria-label={`«${part.name}»: ${key} — изменить`}
            className="size-10 shrink-0 cursor-pointer rounded-lg ring-1 ring-inset ring-foreground/10 data-popup-open:ring-2 data-popup-open:ring-foreground/40"
            style={{ backgroundColor: key }}
          />
          <PickerPopup from={key} session={session} />
        </Popover>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="truncate text-body font-medium">{part.name}</span>
          <span aria-hidden className="flex h-1.5 overflow-hidden rounded-full ring-1 ring-inset ring-foreground/10">
            {shades.map((shade) => (
              <span key={shade.hex} className="flex-1" style={{ backgroundColor: shade.hex }} />
            ))}
          </span>
        </div>
      </div>
      {part.text && <TextField anim={anim} spec={part.text} onCommit={onTextCommit} />}
    </li>
  )
}

type GlyphState = { status: 'loading' } | { status: 'ready'; set: GlyphSet } | { status: 'failed' }

let glyphPromise: Promise<GlyphSet> | null = null

// The bundled letter outlines: fetched on first use (a chunk of their own, so
// stickers without an inscription never load them) and kept. A failed load is
// forgotten, so the next field that mounts tries again.
function loadGlyphs(): Promise<GlyphSet> {
  if (!glyphPromise) {
    // TS types the JSON as number[][]; the file is generated in GlyphSet's shape.
    const promise = import('@/core/glyphs/roboto-900.json').then((module) => module.default as unknown as GlyphSet)
    glyphPromise = promise
    promise.catch(() => {
      if (glyphPromise === promise) glyphPromise = null
    })
  }
  return glyphPromise
}

function useGlyphs(): GlyphState {
  const [state, setState] = useState<GlyphState>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    loadGlyphs().then(
      (set) => {
        if (!cancelled) setState({ status: 'ready', set })
      },
      () => {
        if (!cancelled) setState({ status: 'failed' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [])
  return state
}

interface TextFieldProps {
  anim: Lottie // the committed animation
  spec: TextSpec
  onCommit: PartsProps['onTextCommit']
}

// The inscription as a text input. The draft is what is typed; Enter or leaving the
// field validates it: an invalid text shows its message and changes nothing, a valid
// one is normalised (upper case, trimmed) and, when it differs, replaces the letters.
function TextField({ anim, spec, onCommit }: TextFieldProps) {
  const inputId = useId()
  const messageId = useId()
  const glyphs = useGlyphs()
  const current = useMemo(() => readText(anim, spec), [anim, spec])
  const [draft, setDraft] = useState(current)
  const [error, setError] = useState<string | null>(null)
  // Whenever the committed animation changes (a commit here, undo, redo, a colour edit)
  // the field shows what the animation says and forgets any message about the old draft.
  const [syncedAnim, setSyncedAnim] = useState(anim)
  if (anim !== syncedAnim) {
    setSyncedAnim(anim)
    setDraft(current)
    setError(null)
  }
  // Set while Enter blurs the field, whose blur must not commit a second time.
  const committedByEnter = useRef(false)

  // Returns whether the field now holds a valid text (committed or unchanged).
  function commit(): boolean {
    if (glyphs.status !== 'ready') return false
    const check = validateText(draft, spec, glyphs.set)
    if (!check.ok) {
      setError(check.error)
      return false
    }
    setError(null)
    setDraft(check.text)
    if (check.text === current) return true
    try {
      const next = replaceText(anim, spec, check.text, glyphs.set)
      onCommit(next.anim, next.siteOrigin)
      return true
    } catch (err) {
      console.error(err)
      setError('Не удалось заменить надпись')
      return false
    }
  }

  const loading = glyphs.status === 'loading'
  const message = glyphs.status === 'failed' ? 'Не удалось загрузить шрифт' : error

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-caption text-muted-foreground">
        Текст
      </label>
      <input
        id={inputId}
        type="text"
        // While the font loads the placeholder says so; the text appears with the font.
        value={loading ? '' : draft}
        placeholder={loading ? 'Загрузка шрифта…' : undefined}
        disabled={glyphs.status !== 'ready'}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={error !== null}
        aria-describedby={message ? messageId : undefined}
        onChange={(e) => {
          setDraft(e.target.value)
          setError(null)
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter') {
            e.preventDefault()
            // A valid text leaves the field, so that ⌘Z reaches the document history.
            if (commit()) {
              committedByEnter.current = true
              e.currentTarget.blur()
              committedByEnter.current = false
            }
          } else if (e.key === 'Escape') {
            setDraft(current)
            setError(null)
          }
        }}
        onBlur={() => {
          if (!committedByEnter.current) commit()
        }}
        className="h-9 w-full min-w-0 rounded-lg bg-transparent px-3 text-body text-foreground outline-none ring-1 ring-inset ring-foreground/10 placeholder:text-muted-foreground focus-visible:ring-[color:var(--focus-ring,#6B97FF)] disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:ring-destructive"
      />
      {message && (
        <p id={messageId} role="alert" className="text-caption text-destructive">
          {message}
        </p>
      )}
    </div>
  )
}
