import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from 'react'
import type { Lottie } from '@/core/tgs'
import { listColors, replaceColor, type ColorEntry } from '@/core/colors'
import { FluidHoverHighlight } from '@/components/fluid-hover-highlight'
import { ColorPicker, ColorPickerPortalContainer } from '@/components/ui/color-picker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  isOwnEvent,
  useFluidHover,
  useRegisterFluidHoverItem,
  type UseFluidHoverReturn,
} from '@/hooks/use-fluid-hover'
import { surfaceClasses } from '@/lib/surface-classes'

interface PaletteProps {
  anim: Lottie // the committed animation (never the preview)
  onPreview: (next: Lottie | null) => void // live preview while picking; null = clear preview
  onCommit: (next: Lottie) => void // one history step
}

// tlottie remounts on every `data` change, so the live preview is throttled.
const PREVIEW_THROTTLE_MS = 150

// One open popover: the swatch colour being edited and the colour picked so far.
interface Session {
  from: string
  picked: string
}

// Elements inside the popover that use Enter for themselves (the format menu,
// the eyedropper); Enter on them must not close the popover. Text fields are
// not in the list: their own Enter handler applies the typed value first.
const OWN_ENTER_SELECTOR =
  "button, a[href], [role='menu'], [role='menuitem'], [role='menuitemradio'], [role='option'], [role='listbox'], [role='combobox']"

export function Palette({ anim, onPreview, onCommit }: PaletteProps) {
  const titleId = useId()
  const entries = useMemo(() => listColors(anim), [anim])

  const gridRef = useRef<HTMLDivElement>(null)
  const hover = useFluidHover(gridRef, { axis: 'xy' })

  // Hex of the swatch whose popover is open (this is what makes it open).
  const [openHex, setOpenHex] = useState<string | null>(null)
  // The same editing session for code that runs outside a render: timers,
  // the anim-change effect, unmount.
  const session = useRef<Session | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // After an Enter commit the edited swatch is gone (its colour changed); the
  // swatch with the new colour takes the keyboard focus instead.
  const focusHex = useRef<string | null>(null)

  // The latest props for timer callbacks and effects.
  const latest = useRef({ anim, onPreview, onCommit })
  useEffect(() => {
    latest.current = { anim, onPreview, onCommit }
  })

  const clearTimer = useCallback(() => {
    if (timer.current === null) return
    clearTimeout(timer.current)
    timer.current = null
  }, [])

  // Trailing throttle: the first pick in a quiet period starts the timer, later
  // picks only update `session.picked`, and the timer previews the last one.
  const flushPreview = useCallback(() => {
    timer.current = null
    const current = session.current
    if (!current) return
    const { anim: committed, onPreview: preview } = latest.current
    // Always derived from the committed anim, so previews never compound.
    preview(current.picked === current.from ? null : replaceColor(committed, current.from, current.picked))
  }, [])

  const pick = useCallback(
    (hex: string) => {
      const current = session.current
      if (!current || hex === current.picked) return
      current.picked = hex
      if (timer.current === null) timer.current = setTimeout(flushPreview, PREVIEW_THROTTLE_MS)
    },
    [flushPreview],
  )

  // Ends the session. A commit happens only when the colour really changed.
  const finish = useCallback(
    (commit: boolean, viaKeyboard = false) => {
      const current = session.current
      if (!current) return
      session.current = null
      clearTimer()
      setOpenHex(null)
      const { anim: committed, onPreview: preview, onCommit: commitNext } = latest.current
      if (commit && current.picked !== current.from) {
        if (viaKeyboard) focusHex.current = current.picked
        commitNext(replaceColor(committed, current.from, current.picked))
      }
      preview(null)
    },
    [clearTimer],
  )

  const handleOpenChange = useCallback(
    (hex: string, open: boolean, reason: string) => {
      if (open) {
        finish(true)
        session.current = { from: hex, picked: hex }
        setOpenHex(hex)
      } else {
        // Esc cancels; an outside click, a second click on the swatch or focus
        // leaving the popover commit.
        finish(reason !== 'escape-key')
      }
    },
    [finish],
  )

  // The committed animation changed under an open popover (undo, redo, a new
  // file): drop the edit without committing it.
  useEffect(() => {
    if (session.current) finish(false)
  }, [anim, finish])

  useEffect(
    () => () => {
      clearTimer()
      if (session.current) {
        session.current = null
        latest.current.onPreview(null)
      }
    },
    [clearTimer],
  )

  useLayoutEffect(() => {
    const hex = focusHex.current
    if (hex === null) return
    focusHex.current = null
    gridRef.current?.querySelector<HTMLElement>(`[data-hex="${hex}"]`)?.focus()
  }, [entries])

  const handlePopupKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Enter' || event.defaultPrevented || event.nativeEvent.isComposing) return
      if (!(event.target instanceof Element) || event.target.closest(OWN_ENTER_SELECTOR)) return
      // A typed value was already applied by the field's own Enter handler.
      event.preventDefault()
      finish(true, true)
    },
    [finish],
  )

  // Keyboard focus leaving the grid clears the highlight it moved there.
  const handleGridBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!isOwnEvent(event)) return
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
    hover.setActiveIndex(null)
  }

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-body font-semibold">
        Палитра
      </h2>
      <div
        ref={gridRef}
        className="relative grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1"
        {...hover.handlers}
        onBlur={handleGridBlur}
      >
        <FluidHoverHighlight hover={hover} className="rounded-lg" />
        {entries.length === 0 ? (
          <p className="col-span-full text-caption text-muted-foreground">В стикере нет цветов</p>
        ) : (
          entries.map((entry, index) => (
            <Swatch
              key={entry.hex}
              entry={entry}
              index={index}
              hover={hover}
              open={openHex === entry.hex}
              onOpenChange={handleOpenChange}
              onPick={pick}
              onPopupKeyDown={handlePopupKeyDown}
            />
          ))
        )}
      </div>
    </section>
  )
}

interface SwatchProps {
  entry: ColorEntry
  index: number
  hover: UseFluidHoverReturn
  open: boolean
  onOpenChange: (hex: string, open: boolean, reason: string) => void
  onPick: (hex: string) => void
  onPopupKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

function Swatch({ entry, index, hover, open, onOpenChange, onPick, onPopupKeyDown }: SwatchProps) {
  const { hex, count } = entry
  const triggerRef = useRef<HTMLButtonElement>(null)
  useRegisterFluidHoverItem(hover.registerItem, index, triggerRef)
  // The popup element: the ColorPicker's format menu portals into it, so a
  // click in that menu is not an outside click for the popover.
  const [popup, setPopup] = useState<HTMLElement | null>(null)

  return (
    <Popover open={open} onOpenChange={(next, details) => onOpenChange(hex, next, details.reason)}>
      <PopoverTrigger
        ref={triggerRef}
        data-hex={hex}
        aria-label={`Цвет ${hex}, ${count} — изменить`}
        onFocus={() => hover.setActiveIndex(index)}
        className="relative z-10 flex cursor-pointer flex-col items-center gap-1.5 rounded-lg px-1 py-2 text-foreground data-popup-open:bg-hover"
      >
        <span
          aria-hidden
          className="size-10 rounded-lg ring-1 ring-inset ring-foreground/10"
          style={{ backgroundColor: hex }}
        />
        <span aria-hidden className="flex flex-col items-center">
          <span className="text-micro tabular-nums">{hex}</span>
          <span className="text-micro tabular-nums text-muted-foreground">×{count}</span>
        </span>
      </PopoverTrigger>
      <PopoverContent
        ref={setPopup}
        align="start"
        sideOffset={6}
        className="w-auto gap-0 rounded-none bg-transparent p-0 shadow-none ring-0"
        onKeyDown={onPopupKeyDown}
      >
        <ColorPickerPortalContainer value={popup}>
          <ColorPicker
            defaultValue={hex}
            onValueChange={(_, parsed) => onPick(parsed.hex.slice(0, 7).toLowerCase())}
            className={surfaceClasses(3)}
          />
        </ColorPickerPortalContainer>
      </PopoverContent>
    </Popover>
  )
}
