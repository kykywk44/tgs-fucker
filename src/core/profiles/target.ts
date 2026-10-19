import type { StickerProfile } from '../parts'

// Target (no root `nm`, no layer names: everything is picked by `ind`; a
// red/white target hit by a dart). Layer 14 is the target: its group #0 holds
// the face rings (#0 highlight, #1/#3/#5 red rings, #2/#4 white rings), groups
// #1–#3 the dark red rim seen when it tilts. The dart is layers 9 and 10 (the
// flights) and 11 (the body with its yellow tip). Left out: the dart's dark
// shadow on the face (layer 12), the yellow impact flash (layer 13) and the
// impact lines (layers 15–48).
export const TARGET: StickerProfile = {
  id: 'target',
  match: { fingerprint: 'c63a1b9f' },
  parts: [
    {
      id: 'red',
      name: 'Красные кольца',
      select: [
        { layer: '*', ind: 14, path: ['#0', '#0'] },
        { layer: '*', ind: 14, path: ['#0', '#1'] },
        { layer: '*', ind: 14, path: ['#0', '#3'] },
        { layer: '*', ind: 14, path: ['#0', '#5'] },
        { layer: '*', ind: 14, path: ['#1'] },
        { layer: '*', ind: 14, path: ['#2'] },
        { layer: '*', ind: 14, path: ['#3'] },
      ],
      key: { select: { layer: '*', ind: 14, path: ['#0', '#3'] }, nth: 0 }, // #ff1315
    },
    {
      id: 'white',
      name: 'Белые кольца',
      select: [
        { layer: '*', ind: 14, path: ['#0', '#2'] },
        { layer: '*', ind: 14, path: ['#0', '#4'] },
      ],
      key: { select: { layer: '*', ind: 14, path: ['#0', '#4'] }, nth: 0 }, // #ffffff
    },
    {
      id: 'dart',
      name: 'Дротик',
      select: [{ layer: '*', ind: 9 }, { layer: '*', ind: 10 }, { layer: '*', ind: 11 }],
      key: { select: { layer: '*', ind: 11, path: ['#0', '#0', '#4'] }, nth: 0 }, // #41e1e5
    },
  ],
}
