import type { StickerProfile } from '../parts'

// Astral shard (root `crystall 6`, an iridescent crystal cluster with star
// flashes): the big crystal is the `big` layer (its faces, facet outlines and
// iridescent tints), the small crystals are layers `1`–`4`, the glow around is
// the coloured gradient halos `Shape Layer 9`–`13` (the pulsing white radial
// glows `Shape Layer 37`–`41` stay out: user keeps them white), and the star flashes
// are `Shape Layer 21`–`35` (three per `Null 15`).
export const ASTRAL: StickerProfile = {
  id: 'astral',
  match: { fingerprint: '5449ac54' },
  parts: [
    {
      id: 'big',
      name: 'Большой кристалл',
      select: [{ layer: 'big' }],
      key: { select: { layer: 'big', path: ['#19'] }, nth: 0 }, // #41d4ff
    },
    {
      id: 'small',
      name: 'Малые кристаллы',
      select: [{ layer: '1' }, { layer: '2' }, { layer: '3' }, { layer: '4' }],
      key: { select: { layer: '4', path: ['#8'] }, nth: 0 }, // #4bafe4
    },
    {
      id: 'glow',
      name: 'Свечение вокруг',
      select: [
        { layer: 'Shape Layer 9' },
        { layer: 'Shape Layer 10' },
        { layer: 'Shape Layer 11' },
        { layer: 'Shape Layer 12' },
        { layer: 'Shape Layer 13' },
      ],
      key: { select: { layer: 'Shape Layer 13' }, nth: 0 },
    },
    {
      id: 'flashes',
      name: 'Вспышки-звёздочки',
      select: [
        { layer: 'Shape Layer 2*' },
        { layer: 'Shape Layer 30' },
        { layer: 'Shape Layer 31' },
        { layer: 'Shape Layer 32' },
        { layer: 'Shape Layer 33' },
        { layer: 'Shape Layer 34' },
        { layer: 'Shape Layer 35' },
      ],
      key: { select: { layer: 'Shape Layer 25' }, nth: 0 },
    },
  ],
}
