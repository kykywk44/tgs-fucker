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

// Text fields keep their own undo; leave ⌘Z alone while one has focus.
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
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
      if (e.key.toLowerCase() !== 'z') return
      if (isEditableTarget(e.target)) return
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
