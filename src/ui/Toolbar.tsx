import { useRef, useState, type ComponentProps, type Ref } from 'react'
import { ArrowLeft, ChevronDown, Download, FolderOpen, Redo2, Sticker, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip } from '@/components/ui/tooltip'
import { FluidHoverHighlight } from '@/components/fluid-hover-highlight'
import { useFluidHover, useRegisterFluidHoverItem, type UseFluidHoverReturn } from '@/hooks/use-fluid-hover'
import { useShape } from '@/lib/shape-context'
import { cn } from '@/lib/utils'
import type { Sample } from '@/ui/samples'

export type View = 'editor' | 'library'

export interface ToolbarProps {
  view: View
  onView(view: View): void
  onBack?(): void // the open file came from the «Эмодзи» tab
  fileName: string | null
  canUndo: boolean
  canRedo: boolean
  onOpen(): void
  samples: readonly Sample[] // empty: no «Образцы» menu
  onSample(sample: Sample): void
  onUndo(): void
  onRedo(): void
  exportBlockedReasons: string[]
  onExport(): void
}

// Disabled buttons stay in the group but the fluid highlight skips them.
function isButtonDisabled(el: HTMLElement) {
  return el instanceof HTMLButtonElement && el.disabled
}

interface GroupButtonProps extends Omit<ComponentProps<typeof Button>, 'ref' | 'variant'> {
  index: number
  hover: UseFluidHoverReturn
  ref?: Ref<HTMLButtonElement> // e.g. a popover trigger's, kept alongside the group's own
}

// One member of the fluid-hover group. The group's highlight replaces the ghost button's own
// hover fill (--hover is cleared locally), so the two never stack; the pressed fill stays.
function GroupButton({ index, hover, className, ref: outerRef, ...props }: GroupButtonProps) {
  const ref = useRef<HTMLButtonElement>(null)
  useRegisterFluidHoverItem(hover.registerItem, index, ref)
  const { setActiveIndex } = hover
  return (
    <Button
      {...props}
      ref={(el: HTMLButtonElement | null) => {
        ref.current = el
        if (typeof outerRef === 'function') outerRef(el)
        else if (outerRef) outerRef.current = el
      }}
      variant="ghost"
      className={cn('relative z-10 text-foreground [--hover:transparent]', className)}
      // Keyboard focus moves the highlight; a mouse click must not light a stale item.
      onFocus={(e) => {
        if (e.currentTarget.matches(':focus-visible')) setActiveIndex(index)
      }}
      onBlur={() => setActiveIndex((current) => (current === index ? null : current))}
    />
  )
}

export function Toolbar({
  view,
  onView,
  onBack,
  fileName,
  canUndo,
  canRedo,
  onOpen,
  samples,
  onSample,
  onUndo,
  onRedo,
  exportBlockedReasons,
  onExport,
}: ToolbarProps) {
  const shape = useShape()
  const groupRef = useRef<HTMLDivElement>(null)
  // gapClick off: a click on a greyed-out (pointer-events-none) item lands on the group, and
  // the default gap-click routing would re-fire it on the nearest enabled item instead.
  const hover = useFluidHover(groupRef, {
    axis: 'x',
    isItemDisabled: isButtonDisabled,
    gapClick: false,
  })

  const [samplesOpen, setSamplesOpen] = useState(false)
  const hasSamples = samples.length > 0
  const undoIndex = hasSamples ? 2 : 1

  const hasFile = fileName !== null
  const blocked = exportBlockedReasons.length > 0

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-2 sm:gap-4 sm:px-4">
      <div className="flex min-w-0 shrink-0 items-center gap-1 sm:flex-1 sm:shrink sm:gap-3">
        <div role="group" aria-label="Вкладка" className="inline-flex shrink-0 gap-0.5">
          {(
            [
              ['editor', 'Редактор'],
              ['library', 'Эмодзи'],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              size="compact"
              variant={view === id ? 'secondary' : 'ghost'}
              aria-pressed={view === id}
              onClick={() => onView(id)}
            >
              {label}
            </Button>
          ))}
        </div>
        {view === 'editor' && onBack && (
          <Button size="compact" variant="ghost" leadingIcon={ArrowLeft} className="shrink-0" onClick={onBack} title="Вернуться к сетке эмодзи">
            <span className="max-sm:sr-only">Назад</span>
          </Button>
        )}
        {view === 'editor' && (
          <h1 className="truncate text-body font-medium text-foreground max-sm:hidden" title={fileName ?? undefined}>
            {fileName ?? 'TGS Editor'}
          </h1>
        )}
      </div>

      <div
        ref={groupRef}
        role="group"
        aria-label="Файл и история"
        hidden={view !== 'editor'}
        className="relative inline-flex items-center gap-0.5"
        {...hover.handlers}
      >
        <FluidHoverHighlight hover={hover} className={shape.bg} />
        <GroupButton index={0} hover={hover} leadingIcon={FolderOpen} onClick={onOpen} className="max-sm:px-2.5" aria-label="Открыть">
          <span className="max-sm:sr-only">Открыть</span>
        </GroupButton>
        {hasSamples && (
          <Popover open={samplesOpen} onOpenChange={setSamplesOpen}>
            <PopoverTrigger
              render={<GroupButton index={1} hover={hover} leadingIcon={Sticker} trailingIcon={ChevronDown} className="max-sm:hidden" />}
              title="Открыть стикер из папки samples"
            >
              Образцы
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 gap-0 p-1.5">
              <ul className="flex max-h-[60vh] flex-col overflow-y-auto" aria-label="Образцы">
                {samples.map((sample) => (
                  <li key={sample.file}>
                    <button
                      type="button"
                      aria-current={sample.file === fileName || undefined}
                      className="w-full cursor-pointer truncate rounded-xl px-3 py-2 text-left text-body text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none aria-[current]:font-medium"
                      onClick={() => {
                        setSamplesOpen(false)
                        onSample(sample)
                      }}
                    >
                      {sample.name}
                    </button>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        )}
        <GroupButton
          index={undoIndex}
          hover={hover}
          size="icon"
          aria-label="Отменить"
          title="Отменить (⌘Z)"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Undo2 />
        </GroupButton>
        <GroupButton
          index={undoIndex + 1}
          hover={hover}
          size="icon"
          aria-label="Повторить"
          title="Повторить (⇧⌘Z)"
          disabled={!canRedo}
          onClick={onRedo}
        >
          <Redo2 />
        </GroupButton>
      </div>

      <div className="flex min-w-0 flex-1 justify-end">
        {hasFile && view === 'editor' && (
          // A disabled Button ignores the pointer, so the tooltip hangs on a focusable wrapper
          // that stays hoverable. The wrapper is only a tab stop while Export is blocked.
          <Tooltip
            side="bottom"
            content={`Экспорт недоступен: ${exportBlockedReasons.join('; ')}`}
            forceOpen={blocked ? undefined : false}
          >
            <span
              tabIndex={blocked ? 0 : undefined}
              role={blocked ? 'button' : undefined}
              aria-disabled={blocked || undefined}
              className={cn(
                'inline-flex outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)]',
                shape.button,
              )}
            >
              <Button variant="primary" leadingIcon={Download} disabled={blocked} onClick={onExport} className="max-sm:px-2.5" aria-label="Экспорт">
                <span className="max-sm:sr-only">Экспорт</span>
              </Button>
            </span>
          </Tooltip>
        )}
      </div>
    </header>
  )
}
