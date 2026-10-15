import type { StickerProfile } from '../parts'

// «Сердце» (root `HEART RED`): the whole heart lives in the `comp_0` asset; its
// body is the layers `base` and `base 4` and their volume strokes.
export const HEART: StickerProfile = {
  id: 'heart',
  match: { nm: 'HEART RED' },
  parts: [
    {
      id: 'heart',
      name: 'Сердце',
      select: [
        { asset: 'comp_0', layer: 'base' },
        { asset: 'comp_0', layer: 'base 4' },
        { asset: 'comp_0', layer: 'volume stroke' },
        { asset: 'comp_0', layer: 'volume stroke 2' },
      ],
      key: { select: { asset: 'comp_0', layer: 'base', path: ['fill'] }, nth: 0 }, // #fe1512
    },
  ],
}
