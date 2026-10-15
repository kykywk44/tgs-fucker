import type { StickerProfile } from '../parts'

// «COOL» (root `COOL_emoji_🆒`): a box with an inscription on the `COOL` layer
// (group `1` > `Group 1` holds the box pieces and the letters container
// `Group 1`, each letter being [face group, shadow group, tr]), flames in the
// eight `fire` precomp layers (asset `comp_0`) and `Flame_glow_*`, sparks in
// `Ding_*`, glints in `Shine`, `blik` and `blik 3`.
export const COOL: StickerProfile = {
  id: 'cool',
  match: { nm: 'COOL_emoji_🆒' },
  parts: [
    {
      id: 'box',
      name: 'Коробка',
      select: [
        { layer: 'COOL', path: ['1', 'Group 3'] },
        { layer: 'COOL', path: ['1', 'Group 2'] },
        { layer: 'COOL', path: ['1', 'Group 1', '0'] },
        { layer: 'COOL', path: ['1', 'Group 1', '1'] },
        { layer: 'COOL', path: ['1', 'Group 1', 'Group 5'] },
        { layer: 'COOL', path: ['1', 'Group 1', 'Group 1', '*', '#1'] }, // letter shadows
      ],
      key: { select: { layer: 'COOL', path: ['1', 'Group 1', '1'] }, nth: 0 }, // #86bfe4
    },
    {
      id: 'text',
      name: 'Надпись',
      select: [{ layer: 'COOL', path: ['1', 'Group 1', 'Group 1', '*', '#0'] }], // letter faces
      key: { select: { layer: 'COOL', path: ['1', 'Group 1', 'Group 1', '#0', '#0'] }, nth: 0 }, // #ffffff
      text: {
        container: { layer: 'COOL', path: ['1', 'Group 1', 'Group 1'] },
        original: 'COOL',
        box: { x0: 78.35, y0: 198.78, x1: 433.65, y1: 313.22 },
        pop: { first: 124, step: 6 },
        maxLength: 6,
      },
    },
    {
      id: 'fire',
      name: 'Огонь',
      select: [
        { asset: 'comp_0', layer: '*' },
        { layer: 'Flame_glow_*' },
        { layer: 'COOL', path: ['1', 'Group 1', '2'] }, // fire reflection on the box
      ],
      key: { select: { asset: 'comp_0', layer: '1', path: ['Group 3'] }, nth: 0 }, // #fb9600
    },
    {
      id: 'sparks',
      name: 'Искры',
      select: [{ layer: 'Ding_*' }],
      key: { select: { layer: 'Ding_1', path: ['1'] }, nth: 0 }, // #ffc600
    },
    {
      id: 'glints',
      name: 'Блики',
      select: [{ layer: 'Shine' }, { layer: 'blik' }, { layer: 'blik 3' }],
      key: { select: { layer: 'Shine' }, nth: 1 }, // #7ff7ff
    },
  ],
}
