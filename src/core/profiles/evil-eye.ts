import type { StickerProfile } from '../parts'

// Evil eye (root `04`, a yellow eyeball turns into a red snake eye and back).
// The eyeball is shared by both phases: `body` (sclera gradient) and
// `outlayer` (rim stroke, inner stroke, shading, small highlights) hold
// colour keyframes that redden it at t 87–140, so the reddened eyeball cannot
// be split from the yellow one (a site belongs to its fill node, not to a
// keyframe) and stays in Белок. The irises are separate layers: `basebasic`
// (yellow iris + dark pupil, hidden 68–146) and `basered` (red iris + slit
// pupil, shown 75–146); the red phase also owns `redglow` and `veins 2` (veins
// that exist only in the red phase). Veins are `veins` (colour keyframes
// beige -> dark red). The
// translucent sheen `outlayer` #2 is left out.
export const EVIL_EYE: StickerProfile = {
  id: 'evil-eye',
  match: { fingerprint: '4a3c2840' },
  parts: [
    {
      id: 'eyeball',
      name: 'Белок',
      select: [
        { layer: 'body' },
        { layer: 'outlayer', path: ['#0'] },
        { layer: 'outlayer', path: ['#1'] },
        { layer: 'outlayer', path: ['#3'] },
        { layer: 'outlayer', path: ['#4'] },
        { layer: 'outlayer', path: ['#5'] },
      ],
      key: { select: { layer: 'body' }, nth: 2 }, // #ffffff (t 64)
    },
    {
      id: 'iris',
      name: 'Радужка и зрачок',
      select: [{ layer: 'basebasic' }],
      key: { select: { layer: 'basebasic', path: ['#3'] }, nth: 1 }, // #ffd816
    },
    {
      id: 'veins',
      name: 'Прожилки',
      select: [{ layer: 'veins' }],
      key: { select: { layer: 'veins' }, nth: 0 }, // #efc3a5
    },
    {
      id: 'red',
      name: 'Красная фаза',
      select: [{ layer: 'basered' }, { layer: 'redglow' }, { layer: 'veins 2' }],
      key: { select: { layer: 'basered', path: ['#3'] }, nth: 1 }, // #db3000
    },
  ],
}
