import type { StickerProfile } from '../parts'

// «NEW» (root `NEW_emoji_🆕`, a blue glass button rises from a cardboard box
// and a film peels off it). On the `NEW` layer, group `Group 1` holds the
// letter groups `w`, `e`, `n` (reverse reading order; each = [face group,
// shadow group, tr]) followed by the button face (`Group 3` glass gradient,
// `Group 4` lower sheen, `Group 5` base); group `Group 2` is the button frame.
// The box is `box` + `box 2` (flaps). Left out: the white foam inserts
// (`Layer 1`, `Layer 4`, `Layer 5`, `Layer 6`), the film (`Film 1`, `Film 2`),
// the shine sweeps (`Shape Layer 1/2/3`) and the matte `NEW 2`.
export const NEW: StickerProfile = {
  id: 'new',
  match: { fingerprint: '18a47746' },
  parts: [
    {
      id: 'button',
      name: 'Кнопка',
      select: [
        { layer: 'NEW', path: ['Group 1', 'Group 3'] },
        { layer: 'NEW', path: ['Group 1', 'Group 4'] },
        { layer: 'NEW', path: ['Group 1', 'Group 5'] },
        { layer: 'NEW', path: ['Group 2'] },
      ],
      key: { select: { layer: 'NEW', path: ['Group 1', 'Group 3'] }, nth: 2 }, // #87bfe3
    },
    {
      id: 'text',
      name: 'Надпись',
      select: [
        { layer: 'NEW', path: ['Group 1', 'w'] },
        { layer: 'NEW', path: ['Group 1', 'e'] },
        { layer: 'NEW', path: ['Group 1', 'n'] },
      ],
      key: { select: { layer: 'NEW', path: ['Group 1', 'n', '#0'] }, nth: 0 }, // #ffffff
    },
    {
      id: 'box',
      name: 'Коробка',
      select: [
        { layer: 'box' },
        { layer: 'box 2' },
      ],
      key: { select: { layer: 'box', path: ['#1'] }, nth: 1 }, // #d19350
    },
  ],
}
