import type { StickerProfile } from '../parts'

// «Глаз» (root `Eye`): every part is a handful of whole top-level layers.
export const EYE: StickerProfile = {
  id: 'eye',
  match: { nm: 'Eye' },
  parts: [
    {
      id: 'iris',
      name: 'Радужка',
      select: [{ layer: 'Group 11' }, { layer: 'Group 1' }],
      key: { select: { layer: 'Group 11', path: ['Group 4'] }, nth: 1 }, // #9c620d
    },
    {
      id: 'pupil',
      name: 'Зрачок',
      select: [{ layer: 'Zrachok' }],
      key: { select: { layer: 'Zrachok' }, nth: 0 }, // #200302 (its only site)
    },
    {
      id: 'sclera',
      name: 'Белок',
      select: [{ layer: 'Group 3' }, { layer: 'Group 2' }],
      key: { select: { layer: 'Group 3' }, nth: 0 }, // #fcfcfc
    },
    {
      id: 'lids',
      name: 'Веки',
      select: [{ layer: 'Group 8' }, { layer: 'Group 9' }, { layer: 'Слой 9' }],
      key: { select: { layer: 'Group 8' }, nth: 3 }, // #534f55
    },
  ],
}
