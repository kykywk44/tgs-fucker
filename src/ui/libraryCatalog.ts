export interface LibraryItem {
  media?: 'video'
  id: string
  file: string
  nm: string | null
  kb: number
  sprite: string
  cell: number
  done?: string[]
  from?: string
  gift?: string
  model?: string
}
// covers: gifts only — one small sprite of every gift's cover for the overview
export interface LibrarySet { id: string; title: string; dir: string; items: LibraryItem[]; covers?: Record<string, { id: string; sprite: string; cell: number }> }
export interface LibraryIndex { thumb: number; cols: number; sets: LibrarySet[] }
export const LIBRARY_FILTERS = ['all', 'selected', 'used', 'unused', 'tgs', 'video'] as const
export type LibraryFilter = typeof LIBRARY_FILTERS[number]
export interface LibrarySearch { query: string; filter: LibraryFilter }
export function filterLibrary(items: LibraryItem[], search: LibrarySearch, selected: Set<string>) {
  const terms = search.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return items.filter(item => {
    const text = [item.id, item.nm, item.gift, item.model, item.from, ...(item.done ?? [])].filter(Boolean).join(' ').toLocaleLowerCase()
    return terms.every(term => text.includes(term)) && (
      search.filter === 'all' ||
      search.filter === 'selected' && selected.has(item.id) ||
      search.filter === 'used' && !!item.done?.length ||
      search.filter === 'unused' && !item.done?.length ||
      search.filter === 'tgs' && item.media !== 'video' ||
      search.filter === 'video' && item.media === 'video')
  })
}
export function groupGifts(all: LibraryItem[], matches: LibraryItem[]) {
  const representatives = new Map<string, LibraryItem>()
  for (const item of all) if (item.gift && (!representatives.has(item.gift) || item.model === 'Original')) representatives.set(item.gift, item)
  const groups = new Map<string, number>()
  for (const item of matches) if (item.gift) groups.set(item.gift, (groups.get(item.gift) ?? 0) + 1)
  return [...groups].map(([name, count]) => ({ name, count, representative: representatives.get(name)! }))
}
export const libraryItemUrl = (set: LibrarySet, item: LibraryItem) => `/${set.dir}/${item.file.split('/').map(encodeURIComponent).join('/')}`
