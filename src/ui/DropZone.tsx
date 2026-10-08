import { useCallback, useEffect, useRef, useState, type JSX, type ReactNode } from 'react'
import { FileUp } from 'lucide-react'
import { Banner, BannerTitle } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'

// A hidden <input type="file">; `open()` shows the system file dialog. The caller renders
// `input` somewhere in its tree (it is `display: none`).
export function useFilePicker(onFile: (file: File) => void): { open(): void; input: JSX.Element } {
  const inputRef = useRef<HTMLInputElement>(null)
  const open = useCallback(() => inputRef.current?.click(), [])
  const input = (
    <input
      ref={inputRef}
      type="file"
      accept=".tgs,.json"
      className="hidden"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        const file = e.currentTarget.files?.[0]
        // Clear it, so choosing the same file again still fires a change.
        e.currentTarget.value = ''
        if (file) onFile(file)
      }}
    />
  )
  return { open, input }
}

function carriesFiles(e: DragEvent) {
  return e.dataTransfer?.types.includes('Files') ?? false
}

// Makes the whole window a drop target. Returns true while a file is dragged over it.
// dragenter / dragleave also fire for every child the pointer crosses, so a depth counter
// tells "left the window" from "moved onto a child".
function useWindowFileDrop(onFile: (file: File) => void): boolean {
  const [dragging, setDragging] = useState(false)
  const onFileRef = useRef(onFile)
  useEffect(() => {
    onFileRef.current = onFile
  })

  useEffect(() => {
    let depth = 0
    const reset = () => {
      depth = 0
      setDragging(false)
    }
    const onDragEnter = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      depth += 1
      setDragging(true)
    }
    const onDragOver = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      e.preventDefault() // without this the browser refuses the drop
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      reset()
      const file = e.dataTransfer?.files[0]
      if (file) onFileRef.current(file)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    window.addEventListener('dragend', reset)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('dragend', reset)
    }
  }, [])

  return dragging
}

export interface DropZoneProps {
  hasFile: boolean
  onFile(file: File): void
  error: string | null
  children: ReactNode
}

export function DropZone({ hasFile, onFile, error, children }: DropZoneProps) {
  const picker = useFilePicker(onFile)
  const dragging = useWindowFileDrop(onFile)

  // The banner stays mounted so it can animate shut; keep the last message while it does.
  const [shownError, setShownError] = useState(error)
  if (error !== null && error !== shownError) setShownError(error)

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <Banner status="error" contrast="high" open={error !== null} className="shrink-0">
        <BannerTitle>{shownError}</BannerTitle>
      </Banner>

      {hasFile ? (
        children
      ) : (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-3xl border border-dashed border-border px-8 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <FileUp className="size-6" strokeWidth={1.5} aria-hidden />
            </div>
            <p className="text-subtitle font-semibold text-foreground">Перетащите .tgs или .json</p>
            <Button variant="primary" onClick={picker.open}>
              Выбрать файл
            </Button>
          </div>
        </div>
      )}

      {picker.input}

      {dragging && (
        <div
          role="presentation"
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
        >
          <div className="flex size-full items-center justify-center rounded-3xl border-2 border-dashed border-foreground/30">
            <p className="text-title font-semibold text-foreground">Отпустите, чтобы открыть</p>
          </div>
        </div>
      )}
    </div>
  )
}
