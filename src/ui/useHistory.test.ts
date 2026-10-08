import { describe, expect, it } from 'vitest'
import {
  historyReducer,
  isTextEntryTarget,
  type HistoryAction,
  type HistoryState,
} from './useHistory'

const EMPTY: HistoryState<number> = { past: [], present: null, future: [] }

function run(state: HistoryState<number>, ...actions: HistoryAction<number>[]) {
  return actions.reduce(historyReducer, state)
}

// Freezes the state and its arrays, so any in-place mutation throws (modules are strict).
function frozen<T>(state: HistoryState<T>): HistoryState<T> {
  Object.freeze(state.past)
  Object.freeze(state.future)
  return Object.freeze(state)
}

describe('historyReducer: set', () => {
  it('pushes the current present onto past and clears future', () => {
    const state: HistoryState<number> = { past: [1], present: 2, future: [8, 9] }
    expect(historyReducer(state, { type: 'set', value: 3 })).toEqual({
      past: [1, 2],
      present: 3,
      future: [],
    })
  })

  it('makes the first value the present without pushing the empty present', () => {
    expect(historyReducer(EMPTY, { type: 'set', value: 1 })).toEqual({
      past: [],
      present: 1,
      future: [],
    })
  })

  it('stores the value by reference', () => {
    const value = { a: 1 }
    const next = historyReducer<{ a: number }>(
      { past: [], present: { a: 0 }, future: [] },
      { type: 'set', value },
    )
    expect(next.present).toBe(value)
  })
})

describe('historyReducer: reset', () => {
  it('clears past and future and makes the value the present', () => {
    const state: HistoryState<number> = { past: [1, 2], present: 3, future: [4] }
    expect(historyReducer(state, { type: 'reset', value: 10 })).toEqual({
      past: [],
      present: 10,
      future: [],
    })
  })

  it('works on the empty state', () => {
    expect(historyReducer(EMPTY, { type: 'reset', value: 5 })).toEqual({
      past: [],
      present: 5,
      future: [],
    })
  })
})

describe('historyReducer: undo', () => {
  it('moves one step back and puts the present at the front of future', () => {
    const state: HistoryState<number> = { past: [1, 2], present: 3, future: [4] }
    expect(historyReducer(state, { type: 'undo' })).toEqual({
      past: [1],
      present: 2,
      future: [3, 4],
    })
  })

  it('is a no-op at the start of history (same state returned)', () => {
    const state: HistoryState<number> = { past: [], present: 1, future: [2] }
    expect(historyReducer(state, { type: 'undo' })).toBe(state)
  })

  it('is a no-op on the empty state', () => {
    expect(historyReducer(EMPTY, { type: 'undo' })).toBe(EMPTY)
  })
})

describe('historyReducer: redo', () => {
  it('moves one step forward and pushes the present onto past', () => {
    const state: HistoryState<number> = { past: [1], present: 2, future: [3, 4] }
    expect(historyReducer(state, { type: 'redo' })).toEqual({
      past: [1, 2],
      present: 3,
      future: [4],
    })
  })

  it('is a no-op at the end of history (same state returned)', () => {
    const state: HistoryState<number> = { past: [1], present: 2, future: [] }
    expect(historyReducer(state, { type: 'redo' })).toBe(state)
  })

  it('is a no-op on the empty state', () => {
    expect(historyReducer(EMPTY, { type: 'redo' })).toBe(EMPTY)
  })
})

describe('historyReducer: sequences', () => {
  it('walks back and forth through several steps', () => {
    let state = run(EMPTY, { type: 'reset', value: 1 }, { type: 'set', value: 2 }, { type: 'set', value: 3 })
    expect(state).toEqual({ past: [1, 2], present: 3, future: [] })

    state = run(state, { type: 'undo' }, { type: 'undo' })
    expect(state).toEqual({ past: [], present: 1, future: [2, 3] })

    state = run(state, { type: 'undo' }) // no-op at the start
    expect(state).toEqual({ past: [], present: 1, future: [2, 3] })

    state = run(state, { type: 'redo' }, { type: 'redo' }, { type: 'redo' }) // last is a no-op
    expect(state).toEqual({ past: [1, 2], present: 3, future: [] })
  })

  it('discards the redo branch when a new value is set after undo', () => {
    const state = run(
      EMPTY,
      { type: 'reset', value: 1 },
      { type: 'set', value: 2 },
      { type: 'undo' },
      { type: 'set', value: 9 },
    )
    expect(state).toEqual({ past: [1], present: 9, future: [] })
  })

  it('reset after edits drops all earlier history', () => {
    const state = run(
      EMPTY,
      { type: 'reset', value: 1 },
      { type: 'set', value: 2 },
      { type: 'undo' },
      { type: 'reset', value: 7 },
    )
    expect(state).toEqual({ past: [], present: 7, future: [] })
  })
})

describe('historyReducer: purity', () => {
  const actions: HistoryAction<number>[] = [
    { type: 'set', value: 99 },
    { type: 'reset', value: 99 },
    { type: 'undo' },
    { type: 'redo' },
  ]

  it.each(actions)('does not mutate the input state for $type', (action) => {
    const state = frozen<number>({ past: [1, 2], present: 3, future: [4, 5] })
    const snapshot = structuredClone(state)
    expect(() => historyReducer(state, action)).not.toThrow()
    expect(state).toEqual(snapshot)
  })

  it('returns new arrays, not the input ones, when it changes state', () => {
    const state = frozen<number>({ past: [1], present: 2, future: [3] })
    const next = historyReducer(state, { type: 'undo' })
    expect(next.past).not.toBe(state.past)
    expect(next.future).not.toBe(state.future)
  })
})

describe('isTextEntryTarget', () => {
  const input = (type?: string) => ({ tagName: 'INPUT', type })

  it('is false when there is no target', () => {
    expect(isTextEntryTarget(null)).toBe(false)
  })

  it.each(['text', 'search', 'email', 'password', 'number', 'url', 'tel', 'date', 'time'])(
    'is true for <input type="%s">',
    (type) => {
      expect(isTextEntryTarget(input(type))).toBe(true)
    },
  )

  it('treats an input with no type as text', () => {
    expect(isTextEntryTarget(input(undefined))).toBe(true)
  })

  it.each(['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image'])(
    'is false for <input type="%s"> so the shortcuts pass through',
    (type) => {
      expect(isTextEntryTarget(input(type))).toBe(false)
    },
  )

  it('ignores the case of the input type', () => {
    expect(isTextEntryTarget(input('RANGE'))).toBe(false)
    expect(isTextEntryTarget(input('Text'))).toBe(true)
  })

  it('is true for textarea and select', () => {
    expect(isTextEntryTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isTextEntryTarget({ tagName: 'SELECT' })).toBe(true)
  })

  it('is true for contenteditable elements, whatever their tag', () => {
    expect(isTextEntryTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('is false for other elements', () => {
    expect(isTextEntryTarget({ tagName: 'DIV', isContentEditable: false })).toBe(false)
    expect(isTextEntryTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isTextEntryTarget({ tagName: 'BODY' })).toBe(false)
  })

  it('does not depend on the tag name case', () => {
    expect(isTextEntryTarget({ tagName: 'textarea' })).toBe(true)
    expect(isTextEntryTarget({ tagName: 'input', type: 'range' })).toBe(false)
  })
})
