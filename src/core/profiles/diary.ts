import type { StickerProfile } from '../parts'

// Diary (root `notebook 2`, a brown notebook with a star; a teal pen writes
// "You're the best!"): the cover is `closed` (front cover with the embossed
// star and stitching) + `open` (the cover swung open) + the brown back-cover
// edges of `book` (#1-#3); the elastic and pages are `lenta_front`,
// `lenta_front 2`, `lenta_back` and the page block of `book` (#0, #4); the pen
// is `pen`; the handwriting is `text2`.
export const DIARY: StickerProfile = {
  id: 'diary',
  match: { fingerprint: '85007f44' },
  parts: [
    {
      id: 'cover',
      name: 'Обложка со звездой',
      select: [
        { layer: 'closed' },
        { layer: 'open' },
        { layer: 'book', path: ['#1'] },
        { layer: 'book', path: ['#2'] },
        { layer: 'book', path: ['#3'] },
      ],
      key: { select: { layer: 'closed', path: ['#7'] }, nth: 1 }, // #884137
    },
    {
      id: 'band-pages',
      name: 'Резинка и страницы',
      select: [
        { layer: 'lenta_front' },
        { layer: 'lenta_front 2' },
        { layer: 'lenta_back' },
        { layer: 'book', path: ['#0'] },
        { layer: 'book', path: ['#4'] },
      ],
      key: { select: { layer: 'book', path: ['#0', '#2'] }, nth: 4 }, // #f3eee1
    },
    {
      id: 'pen',
      name: 'Ручка',
      select: [{ layer: 'pen' }],
      key: { select: { layer: 'pen', path: ['#12'] }, nth: 1 }, // #04c1ca
    },
    {
      id: 'writing',
      name: 'Надпись от руки',
      select: [{ layer: 'text2' }],
      key: { select: { layer: 'text2', path: ['#3'] }, nth: 0 }, // #1467a3
    },
  ],
}
