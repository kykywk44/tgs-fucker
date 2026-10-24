import { describe, expect, it } from 'vitest'
import { filterLibrary, groupGifts, libraryItemUrl, type LibraryItem } from './libraryCatalog'
const item = (id: string, extra: Partial<LibraryItem> = {}): LibraryItem => ({ id, file: id + '.tgs', nm: id, kb: 20, sprite: 'sheet.png', cell: 0, ...extra })
const cat = item('Scared Cat/Salem', { gift: 'Scared Cat', model: 'Salem', done: ['blue/cat'] })
const original = item('Scared Cat/Original', { gift: 'Scared Cat', model: 'Original' })
const hat = item('Santa Hat/Salem', { gift: 'Santa Hat', model: 'Salem' })
describe('library browsing', () => {
  it('finds models by gift and model together, without changing their stable source IDs', () => {
    expect(filterLibrary([hat, cat, original], { query: '  CAT   salEM ', filter: 'all' }, new Set())).toEqual([cat])
    expect(filterLibrary([cat, original], { query: 'cat', filter: 'unused' }, new Set())).toEqual([original])
    expect(filterLibrary([cat, original], { query: '', filter: 'selected' }, new Set([original.id]))).toEqual([original])
  })
  it('keeps the original main gift image when search matches only a variant', () => {
    expect(groupGifts([cat, original, hat], [cat])).toEqual([{ name: 'Scared Cat', count: 1, representative: original }])
    expect(groupGifts([cat], [cat])[0].representative).toBe(cat)
    expect(groupGifts([cat, original], [])).toEqual([])
  })
  it('filters source emoji and WebM drafts through the same controls', () => {
    const tgs = item('069', { nm: 'Peeking Face', done: ['blue/peeking-face'] }), video = item('sleep', { file: 'sleep.webm', media: 'video' })
    expect(filterLibrary([tgs, video], { query: 'peeking', filter: 'used' }, new Set())).toEqual([tgs])
    expect(filterLibrary([tgs, video], { query: '', filter: 'video' }, new Set())).toEqual([video])
    expect(filterLibrary([tgs, video], { query: '', filter: 'tgs' }, new Set())).toEqual([tgs])
  })
  it('opens nested gift files without interpreting spaces, hashes or encoded Windows names as URL syntax', () => {
    const entry = item('gift/model', { file: 'Gift Name/AC%5CDC #1.tgs' })
    expect(libraryItemUrl({ id: 'gifts', title: 'Подарки', dir: 'library/gifts/models', items: [] }, entry)).toBe('/library/gifts/models/Gift%20Name/AC%255CDC%20%231.tgs')
  })
})
