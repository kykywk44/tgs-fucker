import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { telegramChecks, type Check } from '@/core/checks'
import { readTgs, writeTgs, type Lottie } from '@/core/tgs'
import { Preview } from '@/preview/Preview'
import { Checks } from '@/ui/Checks'
import { DropZone, useFilePicker } from '@/ui/DropZone'
import { Palette } from '@/ui/Palette'
import { Toolbar } from '@/ui/Toolbar'
import { useHistory, useUndoShortcuts } from '@/ui/useHistory'

// readTgs only parses JSON, so a valid JSON file that is not an animation gets through.
// Everything the preview, the palette and the checks read must exist and be sane.
function assertLottie(value: unknown): asserts value is Lottie {
  const anim = value as Partial<Record<keyof Lottie, unknown>> | null
  const isFiniteNumber = (n: unknown) => typeof n === 'number' && Number.isFinite(n)
  const ok =
    typeof anim === 'object' &&
    anim !== null &&
    Array.isArray(anim.layers) &&
    isFiniteNumber(anim.fr) &&
    isFiniteNumber(anim.ip) &&
    isFiniteNumber(anim.op) &&
    isFiniteNumber(anim.w) &&
    isFiniteNumber(anim.h)
  if (!ok) throw new Error('файл не похож на анимацию Lottie')
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'неизвестная ошибка'
}

// «<label>: <value> (нужно <limit>)» for every failing check.
function blockedReasons(checks: Check[]): string[] {
  return checks
    .filter((check) => !check.ok)
    .map((check) => `${check.label}: ${check.value} (нужно ${check.limit})`)
}

// "cat.tgs" / "cat.JSON" -> "cat-edited.tgs"
function exportName(fileName: string): string {
  return `${fileName.replace(/\.(tgs|json)$/i, '')}-edited.tgs`
}

function download(bytes: Uint8Array, name: string) {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/gzip' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function App() {
  const history = useHistory<Lottie>()
  const { present, set, reset } = history
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The live preview while a swatch popover is open; null when nothing is being picked.
  const [previewAnim, setPreviewAnim] = useState<Lottie | null>(null)
  const [checks, setChecks] = useState<Check[]>([])

  useUndoShortcuts(history)

  // Last file chosen wins: a slow earlier read must not replace a later one.
  const loadSeq = useRef(0)
  const handleFile = useCallback(
    async (file: File) => {
      const seq = ++loadSeq.current
      try {
        const anim: unknown = await readTgs(new Uint8Array(await file.arrayBuffer()))
        assertLottie(anim)
        if (seq !== loadSeq.current) return
        reset(anim)
        setFileName(file.name)
        setError(null)
        setPreviewAnim(null)
        setChecks([]) // the effect below fills in the new file's checks
      } catch (err) {
        if (seq !== loadSeq.current) return
        setError(`Не удалось открыть файл: ${errorMessage(err)}`)
      }
    },
    [reset],
  )
  const picker = useFilePicker(handleFile)

  // The banner is not dismissible, so a successful edit clears a stale error.
  const handleCommit = useCallback(
    (next: Lottie) => {
      setError(null)
      set(next)
    },
    [set],
  )

  // Checks follow the committed animation, never the preview. The size check needs the real
  // exported bytes, so every change gzips again; a result for an older animation is dropped.
  useEffect(() => {
    if (!present) return
    let stale = false
    writeTgs(present).then(
      (bytes) => {
        if (!stale) setChecks(telegramChecks(present, bytes.length))
      },
      (err: unknown) => {
        if (!stale) setError(`Не удалось проверить файл: ${errorMessage(err)}`)
      },
    )
    return () => {
      stale = true
    }
  }, [present])

  const reasons = useMemo(() => blockedReasons(checks), [checks])

  const handleExport = useCallback(async () => {
    if (!present || fileName === null || reasons.length > 0) return
    try {
      const bytes = await writeTgs(present)
      // `checks` can lag one gzip behind a fresh edit; the bytes in hand are the truth.
      if (blockedReasons(telegramChecks(present, bytes.length)).length > 0) return
      download(bytes, exportName(fileName))
    } catch (err) {
      setError(`Не удалось экспортировать файл: ${errorMessage(err)}`)
    }
  }, [present, fileName, reasons])

  const shown = previewAnim ?? present
  const json = useMemo(() => (shown ? JSON.stringify(shown) : ''), [shown])

  return (
    <div className="flex h-svh flex-col bg-background text-foreground">
      <Toolbar
        fileName={fileName}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onOpen={picker.open}
        onUndo={history.undo}
        onRedo={history.redo}
        exportBlockedReasons={reasons}
        onExport={handleExport}
      />
      {picker.input}

      <DropZone hasFile={present !== null} onFile={handleFile} error={error}>
        {present && shown && (
          // Below 1024 px the whole area scrolls and the inspector sits under the canvas; from
          // 1024 px the canvas and the inspector scroll on their own.
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
            {/* m-auto centres the preview and, unlike justify-center, never pushes it off the
                left edge when the pane is narrower than the 512 px stage. */}
            <main className="flex flex-none overflow-auto p-6 lg:min-w-0 lg:flex-1">
              <div className="m-auto">
                <Preview json={json} totalFrames={shown.op - shown.ip} />
              </div>
            </main>
            <aside
              aria-label="Инспектор"
              className="flex shrink-0 flex-col gap-6 border-t border-border p-4 lg:w-80 lg:overflow-y-auto lg:border-t-0 lg:border-l"
            >
              <Palette anim={present} onPreview={setPreviewAnim} onCommit={handleCommit} />
              <Checks checks={checks} />
            </aside>
          </div>
        )}
      </DropZone>
    </div>
  )
}

export default App
