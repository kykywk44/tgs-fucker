import { describe, expect, it } from 'vitest'
import { DOCUMENT_KEY, LIBRARY_KEY, WORKSPACE_KEY, emptyWorkspace, isDocument, isLibrary, isWorkspace, readStored, writeStored, type SavedDocument } from './workspaceSession'
import { completed, isTelegramSession, panelKey } from './telegramSession'

function store() {
  const entries = new Map<string, string>()
  return { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value) } }
}
const document: SavedDocument = {
  anim: { fr: 60, ip: 0, op: 180, w: 512, h: 512, layers: [{ ty: 4, nm: 'edited', shapes: [{ ty: 'fl', c: { a: 0, k: [.2, .4, .6, 1] } }] }] },
  families: [{ id: 5, name: 'Синие', neutral: false, keySite: 12, sites: [12, 19] }],
}

describe('recover the workspace after a page reload', () => {
  it('restores the open document with edits and fixed colour-family identities', () => {
    const storage = store()
    const page = { ...emptyWorkspace, view: 'editor' as const, fileName: 'identification-card.tgs', fromLibrary: true,
      origin: { set: 'drafts' as const, id: 'identification-card' }, packPanel: true, editorScroll: 390, inspectorScroll: 64 }
    writeStored(WORKSPACE_KEY, page, storage)
    writeStored(DOCUMENT_KEY, document, storage)
    expect(readStored(WORKSPACE_KEY, isWorkspace, storage)).toEqual(page)
    expect(readStored(DOCUMENT_KEY, isDocument, storage)).toEqual(document)
    expect(readStored(DOCUMENT_KEY, isDocument, storage)).not.toBe(document)
  })

  it('keeps separate tabs, selection click order and per-section scroll positions', () => {
    const a = store(), b = store()
    const library = { setId: 'drafts', selected: { drafts: ['shrug', 'family', 'loser-hand'] }, scrolls: { drafts: 640, emoji: 7230 }, telegram: true }
    writeStored(LIBRARY_KEY, library, a)
    expect(readStored(LIBRARY_KEY, isLibrary, a)).toEqual(library)
    expect(readStored(LIBRARY_KEY, isLibrary, b)).toBeNull()
  })

  it('keeps a running Telegram job across reload without replaying its POST', () => {
    const storage = store(), key = panelKey('drafts', ['family', 'shrug'])
    const session = { emoji: { family: '👨‍👩‍👧‍👦', shrug: '🤷' }, status: { running: true, status: 'Загружено 10/44', links: ['https://t.me/addemoji/example'] } }
    writeStored(key, session, storage)
    expect(readStored(key, isTelegramSession, storage)).toEqual(session)
    expect(readStored(panelKey('drafts', ['shrug', 'family']), isTelegramSession, storage)).toBeNull()
  })

  it('restores a gift model folder, searches and both levels of catalog scrolling', () => {
    const storage = store()
    const value = { setId: 'gifts', gift: 'Scared Cat', selected: { gifts: ['Scared Cat/Salem'], 'emoji-drafts': [] }, scrolls: { 'gifts:': 640, 'gifts:Scared Cat': 120 }, telegram: false, searches: { gifts: { query: 'salem', filter: 'all' }, emoji: { query: 'hand', filter: 'unused' } } }
    writeStored(LIBRARY_KEY, value, storage)
    expect(readStored(LIBRARY_KEY, isLibrary, storage)).toEqual(value)
    expect(isLibrary({ ...value, searches: { gifts: { query: 'x', filter: 'broken' } } })).toBe(false)
    expect(isLibrary({ ...value, gift: 42 })).toBe(false)
  })

  it('ignores malformed cache, invalid routes and corrupt animation documents', () => {
    const storage = store()
    storage.setItem(WORKSPACE_KEY, '{invalid')
    expect(readStored(WORKSPACE_KEY, isWorkspace, storage)).toBeNull()
    expect(isWorkspace({ ...emptyWorkspace, origin: { set: 'drafts', id: '../../secret' } })).toBe(false)
    expect(isWorkspace({ ...emptyWorkspace, editorScroll: -1 })).toBe(false)
    expect(isDocument({ anim: {}, families: [] })).toBe(false)
    expect(isDocument({ ...document, families: [null] })).toBe(false)
    expect(isLibrary({ setId: 'unknown', selected: {}, scrolls: {}, telegram: true })).toBe(false)
  })

  it('survives disabled/full browser storage without crashing the application', () => {
    const storage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('quota') } }
    expect(readStored(WORKSPACE_KEY, isWorkspace, storage)).toBeNull()
    expect(writeStored(DOCUMENT_KEY, document, storage)).toBe(false)
  })

  it('does not label a failed or unstarted bot job as successful just because it is idle', () => {
    expect(completed({ running: false, status: 'Подготавливаю загрузку…', links: [] })).toBe(false)
    expect(completed({ running: false, status: 'Загрузка приостановлена: network error', links: [] })).toBe(false)
    expect(completed({ running: false, status: 'Готово. Наборы обновлены.', links: [] })).toBe(true)
  })
})
