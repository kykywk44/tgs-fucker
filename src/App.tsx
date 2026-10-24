import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { telegramChecks, type Check } from '@/core/checks'
import { findFamilies, remapFamilies, type ColorFamily } from '@/core/families'
import { matchProfile, resolveParts, type StickerProfile } from '@/core/parts'
import { readTgs, writeTgs, type Lottie } from '@/core/tgs'
import { Preview } from '@/preview/Preview'
import { Checks } from '@/ui/Checks'
import { DropZone, useFilePicker } from '@/ui/DropZone'
import { Library, type PackOrigin } from '@/ui/Library'
import { useColorSession } from '@/ui/colorSession'
import { Palette } from '@/ui/Palette'
import { Parts } from '@/ui/Parts'
import { TelegramPanel } from '@/ui/TelegramPanel'
import { fetchSample, SAMPLES, type Sample } from '@/ui/samples'
import { Toolbar, type View } from '@/ui/Toolbar'
import { useHistory, useUndoShortcuts } from '@/ui/useHistory'
import { DOCUMENT_KEY, WORKSPACE_KEY, emptyWorkspace, isDocument, isWorkspace, readStored, writeStored, type SavedWorkspace } from '@/ui/workspaceSession'

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
  // WebKit starts the download asynchronously after click(); revoking at once can fail it.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// One history step: the animation and the colour families it was opened with. The
// families are fixed per file (D14), so every edit carries them over unchanged.
interface Doc {
  anim: Lottie
  families: ColorFamily[]
}

function App() {
  const [savedDoc] = useState(() => readStored(DOCUMENT_KEY, isDocument))
  const [saved] = useState(() => {
    const page = readStored(WORKSPACE_KEY, isWorkspace) ?? emptyWorkspace
    // A failed/quota-limited later save must not label an older document as a new file.
    if (!savedDoc?.workspace) return page
    const { fileName, fromLibrary, origin } = savedDoc.workspace
    return { ...page, fileName, fromLibrary, origin }
  })
  const history = useHistory<Doc>(savedDoc)
  const { present, set, reset } = history
  const [fileName, setFileName] = useState<string | null>(saved.fileName)
  // Bumped on every successful load: keys the preview so a new file restarts at frame 0,
  // while edits of the same file keep the same preview and swap the animation in place.
  const [fileSeq, setFileSeq] = useState(0)
  // The known sticker profile of the opened file, or null for an unknown one: fixed until the next.
  const [profile, setProfile] = useState<StickerProfile | null>(() => savedDoc ? matchProfile(savedDoc.anim)?.profile ?? null : null)
  const [error, setError] = useState<string | null>(null)
  // The live preview while a swatch popover is open; null when nothing is being picked.
  const [previewAnim, setPreviewAnim] = useState<Lottie | null>(null)
  const [checks, setChecks] = useState<Check[]>([])
  const [view, setView] = useState<View>(saved.view)
  // The open file came from the «Эмодзи» tab: the toolbar offers the way back.
  const [fromLibrary, setFromLibrary] = useState(saved.fromLibrary)
  // …and was a sticker of the blue pack or its drafts: the inspector offers «В пак» for it.
  const [origin, setOrigin] = useState<PackOrigin | null>(saved.origin)
  const [packPanel, setPackPanel] = useState(saved.packPanel)
  // Bumped when the pack changed from here: the library fetches its index again.
  const [packSeq, setPackSeq] = useState(0)
  const editorPaneRef = useRef<HTMLDivElement>(null)
  const workspaceRef = useRef<SavedWorkspace>(saved)
  const editorScroll = useRef(saved.editorScroll)
  const inspectorScroll = useRef(saved.inspectorScroll)

  useLayoutEffect(() => {
    workspaceRef.current = { view, fileName, fromLibrary, origin, packPanel, editorScroll: editorScroll.current, inspectorScroll: inspectorScroll.current }
    writeStored(WORKSPACE_KEY, workspaceRef.current)
  }, [view, fileName, fromLibrary, origin, packPanel])
  useLayoutEffect(() => {
    if (!writeStored(DOCUMENT_KEY, present ? { ...present, workspace: workspaceRef.current } : null)) {
      setError('Не удалось сохранить файл в браузере. Экспортируй его перед обновлением страницы.')
    }
  }, [present, fileName, fromLibrary, origin])

  // A library rebuild changes data, not the route or the open document.
  useEffect(() => {
    const update = () => setPackSeq(n => n + 1)
    import.meta.hot?.on('tgs:library-updated', update)
    return () => { import.meta.hot?.off('tgs:library-updated', update) }
  }, [])

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
        // Both before any state changes, so a failure leaves the old file intact.
        const families = findFamilies(anim)
        const matched = matchProfile(anim)
        reset({ anim, families })
        setProfile(matched?.profile ?? null)
        setFileName(file.name)
        setFileSeq((n) => n + 1)
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
  // A file from anywhere but the «Эмодзи» tab.
  const openFile = useCallback(
    (file: File) => {
      editorScroll.current = inspectorScroll.current = 0
      setFromLibrary(false)
      setOrigin(null)
      void handleFile(file)
    },
    [handleFile],
  )
  const picker = useFilePicker(openFile)

  // If browser storage couldn't keep a large document, its library location still recovers.
  useEffect(() => {
    if (savedDoc || !saved.fromLibrary || !saved.fileName) return
    const id = saved.origin?.id ?? saved.fileName.replace(/\.tgs$/i, '')
    if (!/^[a-z0-9-]+$/.test(id)) return
    const dir = saved.origin?.set === 'drafts' ? 'exports/blue' : saved.origin?.set === 'blue' ? 'packs/blue/ready' : 'library/emoji'
    const controller = new AbortController(), seq = loadSeq.current
    fetch(`/${dir}/${id}.tgs`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(`${response.status}`)
        const blob = await response.blob()
        if (!controller.signal.aborted && seq === loadSeq.current) await handleFile(new File([blob], saved.fileName!))
      })
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(`Не удалось восстановить файл: ${errorMessage(err)}`) })
    return () => controller.abort()
  }, [saved, savedDoc, handleFile])

  const handleSample = useCallback(
    async (sample: Sample) => {
      try {
        openFile(await fetchSample(sample))
      } catch (err) {
        setError(`Не удалось открыть образец: ${errorMessage(err)}`)
      }
    },
    [openFile],
  )

  // The banner is not dismissible, so a successful edit clears a stale error.
  const handleCommit = useCallback(
    (next: Lottie) => {
      if (!present) return
      setError(null)
      set({ anim: next, families: present.families })
    },
    [set, present],
  )

  // A new inscription: the letters (and so the colour sites) change, so the families the file
  // was opened with are carried over to the new sites.
  const handleTextCommit = useCallback(
    (next: Lottie, siteOrigin: number[]) => {
      if (!present) return
      setError(null)
      set({ anim: next, families: remapFamilies(present.families, siteOrigin) })
    },
    [set, present],
  )

  // Checks follow the committed animation, never the preview. The size check needs the real
  // exported bytes, so every change gzips again; a result for an older animation is dropped.
  useEffect(() => {
    if (!present) return
    let stale = false
    writeTgs(present.anim).then(
      (bytes) => {
        if (!stale) setChecks(telegramChecks(present.anim, bytes.length))
      },
      (err: unknown) => {
        if (!stale) setError(`Не удалось проверить файл: ${errorMessage(err)}`)
      },
    )
    return () => {
      stale = true
    }
  }, [present])

  // The parts of the opened sticker as they are now (the key colour decides `neutral`).
  const presentAnim = present?.anim ?? null
  const parts = useMemo(
    () => (profile && presentAnim ? resolveParts(presentAnim, profile) : null),
    [profile, presentAnim],
  )

  // The one colour-editing session of the inspector; its refocus selectors are looked up inside it.
  const inspectorRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (view !== 'editor') return
    if (editorPaneRef.current) editorPaneRef.current.scrollTop = editorScroll.current
    if (inspectorRef.current) inspectorRef.current.scrollTop = inspectorScroll.current
  }, [view, fileSeq])
  const colorSession = useColorSession({
    anim: presentAnim,
    onPreview: setPreviewAnim,
    onCommit: handleCommit,
    rootRef: inspectorRef,
  })

  const reasons = useMemo(() => blockedReasons(checks), [checks])

  const handleExport = useCallback(async () => {
    if (!present || fileName === null || reasons.length > 0) return
    try {
      const bytes = await writeTgs(present.anim)
      // `checks` can lag one gzip behind a fresh edit; the bytes in hand are the truth.
      if (blockedReasons(telegramChecks(present.anim, bytes.length)).length > 0) return
      download(bytes, exportName(fileName))
    } catch (err) {
      setError(`Не удалось экспортировать файл: ${errorMessage(err)}`)
    }
  }, [present, fileName, reasons])

  const shown = previewAnim ?? presentAnim
  const json = useMemo(() => (shown ? JSON.stringify(shown) : ''), [shown])

  return (
    <div className="flex h-svh flex-col bg-background text-foreground">
      <Toolbar
        view={view}
        onView={setView}
        onBack={fromLibrary ? () => setView('library') : undefined}
        fileName={fileName}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onOpen={picker.open}
        samples={SAMPLES}
        onSample={handleSample}
        onUndo={history.undo}
        onRedo={history.redo}
        exportBlockedReasons={reasons}
        onExport={handleExport}
      />
      {picker.input}

      <div hidden={view !== 'library'} className="flex min-h-0 flex-1 flex-col">
        <Library
          active={view === 'library'}
          reload={packSeq}
          onOpen={(file, from) => {
            editorScroll.current = inspectorScroll.current = 0
            setView('editor')
            setFromLibrary(true)
            setOrigin(from)
            setPackPanel(false)
            void handleFile(file)
          }}
        />
      </div>
      {view === 'editor' && (
        <DropZone hasFile={present !== null} onFile={openFile} error={error}>
          {present && shown && (
            // Below 1024 px the whole area scrolls and the inspector sits under the canvas; from
            // 1024 px the canvas and the inspector scroll on their own.
            <div ref={editorPaneRef} onScroll={e => {
              editorScroll.current = e.currentTarget.scrollTop
              writeStored(WORKSPACE_KEY, { ...workspaceRef.current, editorScroll: editorScroll.current, inspectorScroll: inspectorScroll.current })
            }} className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
              {/* m-auto centres the preview and, unlike justify-center, never pushes it off the
                  left edge when the pane is narrower than the 512 px stage. */}
              <main className="flex flex-none overflow-auto p-3 sm:p-6 lg:min-w-0 lg:flex-1">
                <div className="m-auto flex w-full max-w-[512px] justify-center">
                  <Preview key={fileSeq} json={json} totalFrames={shown.op - shown.ip} />
                </div>
              </main>
              <aside
                ref={inspectorRef}
                onScroll={e => {
                  inspectorScroll.current = e.currentTarget.scrollTop
                  writeStored(WORKSPACE_KEY, { ...workspaceRef.current, editorScroll: editorScroll.current, inspectorScroll: inspectorScroll.current })
                }}
                aria-label="Инспектор"
                className="flex shrink-0 flex-col gap-6 border-t border-border p-4 lg:w-80 lg:overflow-y-auto lg:border-t-0 lg:border-l"
              >
                {origin && (
                  <div className="flex flex-col gap-2">
                    <Button
                      variant={packPanel ? 'secondary' : 'primary'}
                      leadingIcon={Send}
                      aria-pressed={packPanel}
                      className="self-start"
                      onClick={() => setPackPanel(!packPanel)}
                    >
                      Добавить в пак
                    </Button>
                    {packPanel && (
                      <>
                        {history.canUndo && (
                          <p className="text-caption text-muted-foreground">Добавится файл {origin.id} как он есть, без правок редактора.</p>
                        )}
                        <TelegramPanel
                          key={`${origin.set}/${origin.id}`}
                          set={origin.set}
                          ids={[origin.id]}
                          className="rounded-xl border"
                          onClose={() => setPackPanel(false)}
                          onAdded={() => setPackSeq((n) => n + 1)}
                        />
                      </>
                    )}
                  </div>
                )}
                {parts && parts.length > 0 && (
                  <Parts
                    key={`parts-${fileSeq}`}
                    anim={present.anim}
                    parts={parts}
                    session={colorSession}
                    onTextCommit={handleTextCommit}
                  />
                )}
                <Palette
                  key={`palette-${fileSeq}`}
                  anim={present.anim}
                  families={present.families}
                  session={colorSession}
                />
                <Checks checks={checks} />
              </aside>
            </div>
          )}
        </DropZone>
      )}
    </div>
  )
}

export default App
