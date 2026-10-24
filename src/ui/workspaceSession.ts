import type { Lottie } from '@/core/tgs'
import type { ColorFamily } from '@/core/families'
import { LIBRARY_FILTERS, type LibrarySearch } from './libraryCatalog'

// Per-tab recovery. No tokens, files from other tabs, or network writes are involved.
export interface SavedDocument { anim: Lottie; families: ColorFamily[]; workspace?: SavedWorkspace }
export interface SavedWorkspace {
  view: 'editor' | 'library'
  fileName: string | null
  fromLibrary: boolean
  origin: { set: 'blue' | 'drafts'; id: string } | null
  packPanel: boolean
  editorScroll: number
  inspectorScroll: number
}
export interface SavedLibrary {
  setId: string
  selected: Record<string, string[]>
  scrolls: Record<string, number>
  telegram: boolean
  searches?: Record<string, LibrarySearch>
  gift?: string | null
}
export const WORKSPACE_KEY = 'tgs.workspace.v1'
export const DOCUMENT_KEY = 'tgs.document.v1'
export const LIBRARY_KEY = 'tgs.library.v1'

type Store = Pick<Storage, 'getItem' | 'setItem'>
export function readStored<T>(key: string, valid: (value: unknown) => value is T, storage?: Store): T | null {
  try {
    const value: unknown = JSON.parse((storage ?? window.sessionStorage).getItem(key) ?? 'null')
    return valid(value) ? value : null
  } catch { return null }
}
export function writeStored(key: string, value: unknown, storage?: Store): boolean {
  try {
    ;(storage ?? window.sessionStorage).setItem(key, JSON.stringify(value))
    return true
  } catch { return false }
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const scroll = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const sets = new Set(['emoji', 'gifts', 'blue', 'drafts', 'emoji-drafts'])
export function isDocument(v: unknown): v is SavedDocument {
  if (!record(v) || !record(v.anim) || !Array.isArray(v.anim.layers) || !Array.isArray(v.families) ||
    (v.workspace !== undefined && !isWorkspace(v.workspace))) return false
  const a = v.anim
  return ['fr', 'ip', 'op', 'w', 'h'].every(k => typeof a[k] === 'number' && Number.isFinite(a[k])) &&
    v.families.every(f => record(f) && typeof f.id === 'number' && typeof f.name === 'string' &&
      typeof f.neutral === 'boolean' && typeof f.keySite === 'number' && Array.isArray(f.sites) && f.sites.every(Number.isInteger))
}
export function isWorkspace(v: unknown): v is SavedWorkspace {
  if (!record(v)) return false
  const origin = v.origin
  return (v.view === 'editor' || v.view === 'library') && (v.fileName === null || typeof v.fileName === 'string') &&
    typeof v.fromLibrary === 'boolean' && typeof v.packPanel === 'boolean' && scroll(v.editorScroll) && scroll(v.inspectorScroll) &&
    (origin === null || (record(origin) && (origin.set === 'blue' || origin.set === 'drafts') && typeof origin.id === 'string' && /^[a-z0-9-]+$/.test(origin.id)))
}
export function isLibrary(v: unknown): v is SavedLibrary {
  return record(v) && typeof v.setId === 'string' && sets.has(v.setId) && typeof v.telegram === 'boolean' &&
    record(v.selected) && Object.entries(v.selected).every(([set, ids]) => sets.has(set) && Array.isArray(ids) && ids.every(id => typeof id === 'string')) &&
    record(v.scrolls) && Object.entries(v.scrolls).every(([set, value]) => (sets.has(set) || set.startsWith('gifts:')) && scroll(value)) &&
    (v.gift === undefined || v.gift === null || typeof v.gift === 'string') &&
    (v.searches === undefined || record(v.searches) && Object.entries(v.searches).every(([set, s]) => sets.has(set) && record(s) && typeof s.query === 'string' && LIBRARY_FILTERS.some(f => f === s.filter)))
}
export const emptyWorkspace: SavedWorkspace = { view: 'editor', fileName: null, fromLibrary: false, origin: null, packPanel: false, editorScroll: 0, inspectorScroll: 0 }
export const emptyLibrary: SavedLibrary = { setId: 'emoji', selected: {}, scrolls: {}, telegram: false }
