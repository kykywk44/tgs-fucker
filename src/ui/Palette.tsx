import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Lottie } from '@/core/tgs'
import { readColorSites } from '@/core/colors'
import { recolorFamily, recolorShade, viewFamily, type ColorFamily, type FamilyView } from '@/core/families'
import { FluidHoverHighlight } from '@/components/fluid-hover-highlight'
import { Button } from '@/components/ui/button'
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
  families: ColorFamily[] // computed once per opened file, fixed until the next file
  onPreview: (next: Lottie | null) => void // live preview while picking; null = clear preview
  onCommit: (next: Lottie) => void // one history step
}

// What a popover edits: a whole family (shade === null: its key swatch) or one
// shade of it, and the colour it started from.
interface Target {
  family: ColorFamily
  shade: string | null
  from: string
}

// The one open editing session: the target and the colour picked so far.
interface Session extends Target {
  picked: string
}

// Which popover is open (this is what makes it open).
interface OpenSwatch {
  family: number
  shade: string | null
}

// Elements inside the popover that use Enter for themselves (the format menu,
// the eyedropper); Enter on them must not close the popover. Text fields are
// not in the list: their own Enter handler applies the typed value first.
const OWN_ENTER_SELECTOR =
  "button, a[href], [role='menu'], [role='menuitem'], [role='menuitemradio'], [role='option'], [role='listbox'], [role='combobox']"

// Always applied to the committed animation, so previews never compound.
function applyEdit(committed: Lottie, edit: Session): Lottie {
  return edit.shade === null
    ? recolorFamily(committed, edit.family, edit.picked)
    : recolorShade(committed, edit.family, edit.from, edit.picked)
}

// What the cards and swatches need to take part in the one editing session.
interface Editing {
  open: OpenSwatch | null
  onOpenChange: (target: Target, open: boolean, reason: string) => void
  onPick: (hex: string) => void
  onPopupKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

export function Palette({ anim, families, onPreview, onCommit }: PaletteProps) {
  const titleId = useId()
  const rootRef = useRef<HTMLElement>(null)
  const sites = useMemo(() => readColorSites(anim), [anim])
  const views = useMemo(() => families.map((family) => viewFamily(sites, family)), [sites, families])

  const [open, setOpen] = useState<OpenSwatch | null>(null)
  // The same editing session for code that runs outside a render: the frame
  // callback, the anim-change effect, unmount.
  const session = useRef<Session | null>(null)
  const frame = useRef<number | null>(null)
  // After an Enter commit the edited shade is gone (its colour changed); the
  // shade with the new colour takes the keyboard focus instead.
  const focusShade = useRef<{ family: number; hex: string } | null>(null)

  // The latest props for the frame callback and effects.
  const latest = useRef({ anim, onPreview, onCommit })
  useEffect(() => {
    latest.current = { anim, onPreview, onCommit }
  })

  const cancelFrame = useCallback(() => {
    if (frame.current === null) return
    cancelAnimationFrame(frame.current)
    frame.current = null
  }, [])

  // Previews the latest picked colour; runs at most once per animation frame.
  const flushPreview = useCallback(() => {
    frame.current = null
    const current = session.current
    if (!current) return
    const { anim: committed, onPreview: preview } = latest.current
    preview(current.picked === current.from ? null : applyEdit(committed, current))
  }, [])

  const pick = useCallback(
    (hex: string) => {
      const current = session.current
      if (!current || hex === current.picked) return
      current.picked = hex
      if (frame.current === null) frame.current = requestAnimationFrame(flushPreview)
    },
    [flushPreview],
  )

  // Ends the session. A commit happens only when the colour really changed.
  const finish = useCallback(
    (commit: boolean, viaKeyboard = false) => {
      const current = session.current
      if (!current) return
      session.current = null
      cancelFrame()
      setOpen(null)
      const { anim: committed, onPreview: preview, onCommit: commitNext } = latest.current
      if (commit && current.picked !== current.from) {
        if (viaKeyboard && current.shade !== null) {
          focusShade.current = { family: current.family.id, hex: current.picked }
        }
        commitNext(applyEdit(committed, current))
      }
      preview(null)
    },
    [cancelFrame],
  )

  const handleOpenChange = useCallback(
    (target: Target, next: boolean, reason: string) => {
      if (next) {
        finish(true)
        session.current = { ...target, picked: target.from }
        setOpen({ family: target.family.id, shade: target.shade })
      } else {
        // Esc cancels; an outside click, a second click on the swatch or focus
        // leaving the popover commit.
        finish(reason !== 'escape-key')
      }
    },
    [finish],
  )

  // The committed animation changed under an open popover (undo, redo): drop
  // the edit without committing it.
  useEffect(() => {
    if (session.current) finish(false)
  }, [anim, finish])

  useEffect(
    () => () => {
      cancelFrame()
      if (session.current) {
        session.current = null
        latest.current.onPreview(null)
      }
    },
    [cancelFrame],
  )

  // Runs a frame late on purpose: the closed popover's own return-focus runs when
  // its swatch unmounts (a passive effect, then a microtask) and would take focus
  // back from anything focused earlier in the same commit.
  useEffect(() => {
    const target = focusShade.current
    if (target === null) return
    focusShade.current = null
    requestAnimationFrame(() => {
      const root = rootRef.current
      // The shades of a family can merge into one (no grid, no toggle): then its key swatch takes the focus.
      const next =
        root?.querySelector<HTMLElement>(`[data-family="${target.family}"][data-hex="${target.hex}"]`) ??
        root?.querySelector<HTMLElement>(`[data-family-key="${target.family}"]`)
      next?.focus()
    })
  }, [sites])

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

  const editing: Editing = { open, onOpenChange: handleOpenChange, onPick: pick, onPopupKeyDown: handlePopupKeyDown }

  return (
    <section ref={rootRef} aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-body font-semibold">
        Палитра
      </h2>
      {families.length === 0 ? (
        <p className="text-caption text-muted-foreground">В стикере нет цветов</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {families.map((family, index) => (
            <FamilyCard key={family.id} family={family} view={views[index]} editing={editing} />
          ))}
        </ul>
      )}
    </section>
  )
}

interface FamilyCardProps {
  family: ColorFamily
  view: FamilyView
  editing: Editing
}

function FamilyCard({ family, view, editing }: FamilyCardProps) {
  const gridId = useId()
  // Collapsed by default; local to the card.
  const [expanded, setExpanded] = useState(false)
  const { key, shades } = view
  const keyOpen = editing.open?.family === family.id && editing.open.shade === null

  return (
    <li className="flex flex-col gap-1 rounded-xl p-2 ring-1 ring-inset ring-foreground/10">
      <div className="flex items-center gap-3">
        <Popover
          open={keyOpen}
          onOpenChange={(next, details) =>
            editing.onOpenChange({ family, shade: null, from: key }, next, details.reason)
          }
        >
          <PopoverTrigger
            data-family-key={family.id}
            aria-label={`«${family.name}»: ${key} — изменить всё семейство`}
            className="size-10 shrink-0 cursor-pointer rounded-lg ring-1 ring-inset ring-foreground/10 data-popup-open:ring-2 data-popup-open:ring-foreground/40"
            style={{ backgroundColor: key }}
          />
          <PickerPopup from={key} editing={editing} />
        </Popover>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="truncate text-body font-medium">{family.name}</span>
          <span aria-hidden className="flex h-1.5 overflow-hidden rounded-full ring-1 ring-inset ring-foreground/10">
            {shades.map((shade) => (
              <span key={shade.hex} className="flex-1" style={{ backgroundColor: shade.hex }} />
            ))}
          </span>
        </div>
      </div>
      {shades.length > 1 && (
        <Button
          variant="ghost"
          size="compact"
          leadingIcon={expanded ? ChevronDown : ChevronRight}
          aria-expanded={expanded}
          aria-controls={gridId}
          onClick={() => setExpanded((value) => !value)}
          className="self-start"
        >
          Оттенки · {shades.length}
        </Button>
      )}
      {expanded && shades.length > 1 && (
        <ShadeGrid id={gridId} family={family} shades={shades} editing={editing} />
      )}
    </li>
  )
}

interface ShadeGridProps {
  id: string
  family: ColorFamily
  shades: FamilyView['shades']
  editing: Editing
}

// Today's swatch grid, scoped to one family.
function ShadeGrid({ id, family, shades, editing }: ShadeGridProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const hover = useFluidHover(gridRef, { axis: 'xy', gapClick: false })

  // Keyboard focus leaving the grid clears the highlight it moved there.
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!isOwnEvent(event)) return
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
    hover.setActiveIndex(null)
  }

  return (
    <div
      id={id}
      ref={gridRef}
      className="relative grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1"
      {...hover.handlers}
      onBlur={handleBlur}
    >
      <FluidHoverHighlight hover={hover} className="rounded-lg" />
      {shades.map((shade, index) => (
        <ShadeSwatch
          key={shade.hex}
          family={family}
          hex={shade.hex}
          count={shade.count}
          index={index}
          hover={hover}
          editing={editing}
        />
      ))}
    </div>
  )
}

interface ShadeSwatchProps {
  family: ColorFamily
  hex: string
  count: number
  index: number
  hover: UseFluidHoverReturn
  editing: Editing
}

function ShadeSwatch({ family, hex, count, index, hover, editing }: ShadeSwatchProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  useRegisterFluidHoverItem(hover.registerItem, index, triggerRef)
  const open = editing.open?.family === family.id && editing.open.shade === hex

  return (
    <Popover
      open={open}
      onOpenChange={(next, details) =>
        editing.onOpenChange({ family, shade: hex, from: hex }, next, details.reason)
      }
    >
      <PopoverTrigger
        ref={triggerRef}
        data-family={family.id}
        data-hex={hex}
        aria-label={`Оттенок ${hex}, ${count} — изменить`}
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
      <PickerPopup from={hex} editing={editing} />
    </Popover>
  )
}

interface PickerPopupProps {
  from: string // the colour the picker starts from
  editing: Editing
}

// The popover body shared by key swatches and shade swatches.
function PickerPopup({ from, editing }: PickerPopupProps) {
  // The popup element: the ColorPicker's format menu portals into it, so a
  // click in that menu is not an outside click for the popover.
  const [popup, setPopup] = useState<HTMLElement | null>(null)

  return (
    <PopoverContent
      ref={setPopup}
      align="start"
      sideOffset={6}
      className="w-auto gap-0 rounded-none bg-transparent p-0 shadow-none ring-0"
      onKeyDown={editing.onPopupKeyDown}
    >
      <ColorPickerPortalContainer value={popup}>
        <ColorPicker
          defaultValue={from}
          onValueChange={(_, parsed) => editing.onPick(parsed.hex.slice(0, 7).toLowerCase())}
          className={surfaceClasses(3)}
        />
      </ColorPickerPortalContainer>
    </PopoverContent>
  )
}
