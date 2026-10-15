import { useId, useMemo } from 'react'
import type { Lottie } from '@/core/tgs'
import { readColorSites } from '@/core/colors'
import { recolorFamily, viewFamily, type FamilyView } from '@/core/families'
import type { Part } from '@/core/parts'
import { Popover, PopoverTrigger } from '@/components/ui/popover'
import { PickerPopup, type ColorSession } from '@/ui/colorSession'

interface PartsProps {
  anim: Lottie // the committed animation (never the preview)
  parts: Part[] // the resolved parts of a known sticker, in profile order
  session: ColorSession // the inspector's one colour-editing session
}

// The named parts of a known sticker (iris, pupil, ...): one key swatch each,
// recolouring the whole part. No shade grid; the palette below has the shades.
export function Parts({ anim, parts, session }: PartsProps) {
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
          <PartCard key={part.id} part={part} view={views[index]} session={session} />
        ))}
      </ul>
    </section>
  )
}

interface PartCardProps {
  part: Part
  view: FamilyView
  session: ColorSession
}

function PartCard({ part, view, session }: PartCardProps) {
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
    </li>
  )
}
