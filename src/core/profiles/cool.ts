import type { Mat3 } from '../homography'
import type { StickerProfile } from '../parts'

// The motion of the inscription, one row-major homography per path keyframe
// (frame t), in container coordinates: face kf 0 -> face kf k, and face kf 0
// -> shadow kf k. Fitted once with fitHomography on the original COOL letters
// (every vertex and absolute handle: 36 vertices, 108 points); largest
// reprojection error 0.108 px at t 83, where the box is edge-on (mirrored).
// Rounded to 1e-7 (linear part), 1e-5 (translation) and 1e-10 (perspective):
// each rounding moves a point of the box by less than 0.0001 px.
const FACE_MOTION: Mat3[] = [
  [1, 0, 0, 0, 1, 0, 0, 0, 1], // t 0
  [0.2752798, -0.0000021, 51.78923, -0.4549485, 0.7148611, 140.96612, -0.0011137953, -7.3e-9, 1], // t 26
  [0.2752798, -0.0000021, 51.78923, -0.4549485, 0.7148611, 140.96612, -0.0011137953, -7.3e-9, 1], // t 39
  [1, 0, 0, 0, 1, 0, 0, 0, 1], // t 44
  [1.181949, -0.31335, 82.43705, 0.5184287, 0.3756709, -31.84295, 0.0013882609, -0.0016114507, 1], // t 65
  [1.0000004, 0.0000027, -0.00043, -8e-7, 1.0000037, 39.99967, -2.7e-9, 8e-9, 1], // t 80
  [0.6109717, 0.0000419, 308.23333, 0.7402107, 1.3985779, -110.72484, 0.0019982386, -7.73e-8, 1], // t 83
  [-0.2534556, -0.0000034, 227.91795, -0.4477657, 0.6680453, 152.02009, -0.0011138447, -4.01e-8, 1], // t 84
  [1, 0, 0, 0, 1, 0, 0, 0, 1], // t 123
]
const SHADOW_MOTION: Mat3[] = [
  [1.0000007, 7e-7, -0.00019, 1e-7, 1.0000008, -3.00003, 0, 2.7e-9, 1], // t 0
  [0.278623, -0.0000048, 48.78925, -0.4549496, 0.714861, 138.82169, -0.0011137854, -2.04e-8, 1], // t 26
  [0.278623, -0.0000048, 48.78925, -0.4549496, 0.714861, 138.82169, -0.0011137854, -2.04e-8, 1], // t 39
  [1.0000007, 7e-7, -0.00019, 1e-7, 1.0000008, -3.00003, 0, 2.7e-9, 1], // t 44
  [1.1817912, -0.3182555, 86.97556, 0.5145569, 0.3754701, -33.81311, 0.0013815836, -0.0016036937, 1], // t 65
  [1.0000011, 0.0000034, -0.00062, -7e-7, 1.0000046, 36.99965, -2.7e-9, 1.07e-8, 1], // t 80
  [0.6109979, 0.0000165, 308.2249, 0.742035, 1.3985811, -114.04923, 0.0019983903, -1.47e-7, 1], // t 83
  [-0.2534366, -0.0000137, 227.91414, -0.4477523, 0.6680484, 150.01309, -0.0011137797, -8.91e-8, 1], // t 84
  [1.0000007, 7e-7, -0.00019, 1e-7, 1.0000008, -3.00003, 0, 2.7e-9, 1], // t 123
]

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
        motion: { face: FACE_MOTION, shadow: SHADOW_MOTION },
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
