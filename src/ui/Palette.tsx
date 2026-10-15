import { useId, useMemo, useRef, useState, type FocusEvent } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Lottie } from '@/core/tgs'
import { readColorSites } from '@/core/colors'
import { recolorFamily, recolorShade, viewFamily, type ColorFamily, type FamilyView } from '@/core/families'
import { FluidHoverHighlight } from '@/components/fluid-hover-highlight'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger } from '@/components/ui/popover'
import {
  isOwnEvent,
  useFluidHover,
  useRegisterFluidHoverItem,
  type UseFluidHoverReturn,
} from '@/hooks/use-fluid-hover'
import { PickerPopup, type ColorSession } from '@/ui/colorSession'

interface PaletteProps {
  anim: Lottie // the committed animation (never the preview)
  families: ColorFamily[] // computed once per opened file, fixed until the next file
  session: ColorSession // the inspector's one colour-editing session
}

export function Palette({ anim, families, session }: PaletteProps) {
  const titleId = useId()
  const sites = useMemo(() => readColorSites(anim), [anim])
  const views = useMemo(() => families.map((family) => viewFamily(sites, family)), [sites, families])

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-body font-semibold">
        Палитра
      </h2>
      {families.length === 0 ? (
        <p className="text-caption text-muted-foreground">В стикере нет цветов</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {families.map((family, index) => (
            <FamilyCard key={family.id} family={family} view={views[index]} session={session} />
          ))}
        </ul>
      )}
    </section>
  )
}

interface FamilyCardProps {
  family: ColorFamily
  view: FamilyView
  session: ColorSession
}

function FamilyCard({ family, view, session }: FamilyCardProps) {
  const gridId = useId()
  // Collapsed by default; local to the card.
  const [expanded, setExpanded] = useState(false)
  const { key, shades } = view
  const keyId = `family:${family.id}`

  return (
    <li className="flex flex-col gap-1 rounded-xl p-2 ring-1 ring-inset ring-foreground/10">
      <div className="flex items-center gap-3">
        <Popover
          open={session.openId === keyId}
          onOpenChange={(next, details) =>
            session.onOpenChange(
              { id: keyId, from: key, apply: (committed, picked) => recolorFamily(committed, family, picked) },
              next,
              details.reason,
            )
          }
        >
          <PopoverTrigger
            data-family-key={family.id}
            aria-label={`«${family.name}»: ${key} — изменить всё семейство`}
            className="size-10 shrink-0 cursor-pointer rounded-lg ring-1 ring-inset ring-foreground/10 data-popup-open:ring-2 data-popup-open:ring-foreground/40"
            style={{ backgroundColor: key }}
          />
          <PickerPopup from={key} session={session} />
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
        <ShadeGrid id={gridId} family={family} shades={shades} session={session} />
      )}
    </li>
  )
}

interface ShadeGridProps {
  id: string
  family: ColorFamily
  shades: FamilyView['shades']
  session: ColorSession
}

// Today's swatch grid, scoped to one family.
function ShadeGrid({ id, family, shades, session }: ShadeGridProps) {
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
          session={session}
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
  session: ColorSession
}

function ShadeSwatch({ family, hex, count, index, hover, session }: ShadeSwatchProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  useRegisterFluidHoverItem(hover.registerItem, index, triggerRef)
  const id = `shade:${family.id}:${hex}`

  return (
    <Popover
      open={session.openId === id}
      onOpenChange={(next, details) =>
        session.onOpenChange(
          {
            id,
            from: hex,
            apply: (committed, picked) => recolorShade(committed, family, hex, picked),
            // After an Enter commit this shade is gone (its colour changed): the shade
            // with the new colour takes the keyboard focus, else the family's key swatch.
            refocus: (picked) => [
              `[data-family="${family.id}"][data-hex="${picked}"]`,
              `[data-family-key="${family.id}"]`,
            ],
          },
          next,
          details.reason,
        )
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
      <PickerPopup from={hex} session={session} />
    </Popover>
  )
}
