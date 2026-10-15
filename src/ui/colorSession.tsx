import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import type { Lottie } from '@/core/tgs'
import { ColorPicker, ColorPickerPortalContainer } from '@/components/ui/color-picker'
import { PopoverContent } from '@/components/ui/popover'
import { surfaceClasses } from '@/lib/surface-classes'

// The one colour-editing session of the inspector: every swatch that opens a
// picker (palette families and shades, sticker parts) shares it, so opening
// one commits the previous one and only one live preview exists at a time.

// What a swatch edits.
export interface ColorTarget {
  id: string // 'family:<id>' | 'shade:<id>:<hex>' | 'part:<id>'
  from: string // colour the picker starts from
  apply(committed: Lottie, picked: string): Lottie // always applied to the committed animation
  refocus?(picked: string): string[] // selectors tried in order inside rootRef after an Enter commit
}

export interface ColorSession {
  openId: string | null // the id of the target whose popover is open
  onOpenChange(target: ColorTarget, open: boolean, reason: string): void
  onPick(hex: string): void
  onPopupKeyDown(event: KeyboardEvent<HTMLElement>): void
}

// The open editing session: the target and the colour picked so far.
interface Editing {
  target: ColorTarget
  picked: string
}

// Elements inside the popover that use Enter for themselves (the format menu,
// the eyedropper); Enter on them must not close the popover. Text fields are
// not in the list: their own Enter handler applies the typed value first.
const OWN_ENTER_SELECTOR =
  "button, a[href], [role='menu'], [role='menuitem'], [role='menuitemradio'], [role='option'], [role='listbox'], [role='combobox']"

interface ColorSessionOptions {
  anim: Lottie | null // the committed animation (never the preview)
  onPreview: (next: Lottie | null) => void // live preview while picking; null = clear preview
  onCommit: (next: Lottie) => void // one history step
  rootRef: RefObject<HTMLElement | null> // where the refocus selectors are looked up
}

export function useColorSession({ anim, onPreview, onCommit, rootRef }: ColorSessionOptions): ColorSession {
  // The open popover, with the animation it was opened against: a different
  // animation (a new file loaded under an open popover) shows nothing open at
  // once, before the effect below has dropped the stale edit.
  const [opened, setOpened] = useState<{ id: string; anim: Lottie | null } | null>(null)
  const openId = opened !== null && opened.anim === anim ? opened.id : null
  // The same editing session for code that runs outside a render: the frame
  // callback, the anim-change effect, unmount.
  const session = useRef<Editing | null>(null)
  const frame = useRef<number | null>(null)
  // After an Enter commit the edited swatch may be gone (a shade whose colour
  // changed); these selectors say which element takes the keyboard focus instead.
  const pendingRefocus = useRef<string[] | null>(null)

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
    const { target, picked } = current
    preview(committed !== null && picked !== target.from ? target.apply(committed, picked) : null)
  }, [])

  const onPick = useCallback(
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
      setOpened(null)
      const { anim: committed, onPreview: preview, onCommit: commitNext } = latest.current
      const { target, picked } = current
      if (commit && picked !== target.from && committed !== null) {
        if (viaKeyboard && target.refocus) pendingRefocus.current = target.refocus(picked)
        commitNext(target.apply(committed, picked))
      }
      preview(null)
    },
    [cancelFrame],
  )

  const onOpenChange = useCallback(
    (target: ColorTarget, open: boolean, reason: string) => {
      if (open) {
        finish(true)
        session.current = { target, picked: target.from }
        setOpened({ id: target.id, anim: latest.current.anim })
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
    const selectors = pendingRefocus.current
    if (selectors === null) return
    pendingRefocus.current = null
    requestAnimationFrame(() => {
      const root = rootRef.current
      if (!root) return
      // The first selector that matches wins; a target lists fallbacks for when
      // its swatch is gone (the shades of a family can merge into one: no grid,
      // no toggle, so the family's key swatch takes the focus).
      for (const selector of selectors) {
        const next = root.querySelector<HTMLElement>(selector)
        if (next) {
          next.focus()
          return
        }
      }
    })
  }, [anim, rootRef])

  const onPopupKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Enter' || event.defaultPrevented || event.nativeEvent.isComposing) return
      if (!(event.target instanceof Element) || event.target.closest(OWN_ENTER_SELECTOR)) return
      // A typed value was already applied by the field's own Enter handler.
      event.preventDefault()
      finish(true, true)
    },
    [finish],
  )

  return useMemo(
    () => ({ openId, onOpenChange, onPick, onPopupKeyDown }),
    [openId, onOpenChange, onPick, onPopupKeyDown],
  )
}

interface PickerPopupProps {
  from: string // the colour the picker starts from
  session: ColorSession
}

// The popover body shared by every swatch that edits a colour.
export function PickerPopup({ from, session }: PickerPopupProps) {
  // The popup element: the ColorPicker's format menu portals into it, so a
  // click in that menu is not an outside click for the popover.
  const [popup, setPopup] = useState<HTMLElement | null>(null)

  return (
    <PopoverContent
      ref={setPopup}
      align="start"
      sideOffset={6}
      className="w-auto gap-0 rounded-none bg-transparent p-0 shadow-none ring-0"
      onKeyDown={session.onPopupKeyDown}
    >
      <ColorPickerPortalContainer value={popup}>
        <ColorPicker
          defaultValue={from}
          onValueChange={(_, parsed) => session.onPick(parsed.hex.slice(0, 7).toLowerCase())}
          className={surfaceClasses(3)}
        />
      </ColorPickerPortalContainer>
    </PopoverContent>
  )
}
