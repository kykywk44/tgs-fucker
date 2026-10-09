import { useCallback, useEffect, useReducer, useRef } from 'react'

export interface HistoryState<T> {
  past: T[]
  present: T | null
  future: T[]
}

export type HistoryAction<T> =
  | { type: 'set'; value: T }
  | { type: 'reset'; value: T }
  | { type: 'undo' }
  | { type: 'redo' }

// Pure. `set` records a new step (the first value after a reset has no earlier present to
// push); `reset` starts a fresh history; `undo` / `redo` move one step and return the same
// state object at the ends, so React skips the re-render.
export function historyReducer<T>(
  state: HistoryState<T>,
  action: HistoryAction<T>,
): HistoryState<T> {
  switch (action.type) {
    case 'set':
      return {
        past: state.present === null ? state.past : [...state.past, state.present],
        present: action.value,
        future: [],
      }
    case 'reset':
      return { past: [], present: action.value, future: [] }
    case 'undo': {
      if (state.past.length === 0 || state.present === null) return state
      return {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
        future: [state.present, ...state.future],
      }
    }
    case 'redo': {
      if (state.future.length === 0 || state.present === null) return state
      return {
        past: [...state.past, state.present],
        present: state.future[0],
        future: state.future.slice(1),
      }
    }
  }
}

export interface History<T> {
  present: T | null
  set(v: T): void
  reset(v: T): void
  undo(): void
  redo(): void
  canUndo: boolean
  canRedo: boolean
}

export function useHistory<T>(): History<T> {
  const [state, dispatch] = useReducer<HistoryState<T>, [HistoryAction<T>]>(historyReducer, {
    past: [],
    present: null,
    future: [],
  })
  const set = useCallback((value: T) => dispatch({ type: 'set', value }), [])
  const reset = useCallback((value: T) => dispatch({ type: 'reset', value }), [])
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])
  return {
    present: state.present,
    set,
    reset,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}

// <input> types that take no typed text and so have no undo of their own. A focused range
// slider (the timeline scrubber) must not swallow ⌘Z.
const NON_TEXT_INPUT_TYPES = new Set([
  'range',
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'color',
  'file',
  'image',
])

// True for elements the user types into (they keep their own ⌘Z): textarea, select,
// contenteditable, and any <input> whose type is not in NON_TEXT_INPUT_TYPES.
// Takes a plain shape so it can be tested without a DOM.
export function isTextEntryTarget(
  el: { tagName: string; type?: string; isContentEditable?: boolean } | null,
): boolean {
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName.toUpperCase()
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') return !NON_TEXT_INPUT_TYPES.has((el.type ?? 'text').toLowerCase())
  return false
}

// True for the Z key. A Latin «z» matches by `key`; on a non-Latin layout (Russian: «я»)
// `key` is not a letter a-z, so the physical position (`code`) decides. A Latin letter
// other than z never matches: on AZERTY the physical Z key is labelled «w».
export function isUndoKey(e: { key: string; code: string }): boolean {
  if (e.key.toLowerCase() === 'z') return true
  return !/^[a-z]$/i.test(e.key) && e.code === 'KeyZ'
}

// ⌘Z undoes and ⇧⌘Z redoes (Ctrl instead of ⌘ on other OS; either modifier is accepted
// everywhere). preventDefault only when an action actually ran.
export function useUndoShortcuts(h: {
  undo(): void
  redo(): void
  canUndo: boolean
  canRedo: boolean
}): void {
  const latest = useRef(h)
  useEffect(() => {
    latest.current = h
  })

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.isComposing) return
      if (!isUndoKey(e)) return
      if (e.target instanceof HTMLElement && isTextEntryTarget(e.target)) return
      const { undo, redo, canUndo, canRedo } = latest.current
      if (e.shiftKey) {
        if (!canRedo) return
        redo()
      } else {
        if (!canUndo) return
        undo()
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
