import { useRef, type ComponentProps } from 'react'
import { Download, FolderOpen, Redo2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { FluidHoverHighlight } from '@/components/fluid-hover-highlight'
import { useFluidHover, useRegisterFluidHoverItem, type UseFluidHoverReturn } from '@/hooks/use-fluid-hover'
import { useShape } from '@/lib/shape-context'
import { cn } from '@/lib/utils'

export interface ToolbarProps {
  fileName: string | null
  canUndo: boolean
  canRedo: boolean
  onOpen(): void
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
}

// One member of the fluid-hover group. The group's highlight replaces the ghost button's own
// hover fill (--hover is cleared locally), so the two never stack; the pressed fill stays.
function GroupButton({ index, hover, className, ...props }: GroupButtonProps) {
  const ref = useRef<HTMLButtonElement>(null)
  useRegisterFluidHoverItem(hover.registerItem, index, ref)
  const { setActiveIndex } = hover
  return (
    <Button
      {...props}
      ref={ref}
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
  fileName,
  canUndo,
  canRedo,
  onOpen,
  onUndo,
  onRedo,
  exportBlockedReasons,
  onExport,
}: ToolbarProps) {
  const shape = useShape()
  const groupRef = useRef<HTMLDivElement>(null)
  const hover = useFluidHover(groupRef, { axis: 'x', isItemDisabled: isButtonDisabled })

  const hasFile = fileName !== null
  const blocked = exportBlockedReasons.length > 0

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-background px-4">
      <div className="min-w-0 flex-1">
        <h1
          className="truncate text-body font-medium text-foreground"
          title={fileName ?? undefined}
        >
          {fileName ?? 'TGS Editor'}
        </h1>
      </div>

      <div
        ref={groupRef}
        role="group"
        aria-label="Файл и история"
        className="relative inline-flex items-center gap-0.5"
        {...hover.handlers}
      >
        <FluidHoverHighlight hover={hover} className={shape.bg} />
        <GroupButton index={0} hover={hover} leadingIcon={FolderOpen} onClick={onOpen}>
          Открыть
        </GroupButton>
        <GroupButton
          index={1}
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
          index={2}
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
        {hasFile && (
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
              <Button variant="primary" leadingIcon={Download} disabled={blocked} onClick={onExport}>
                Экспорт
              </Button>
            </span>
          </Tooltip>
        )}
      </div>
    </header>
  )
}
