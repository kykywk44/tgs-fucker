import type { Mat3 } from '../homography'
import type { StickerProfile } from '../parts'

// «NEW» (root `NEW_emoji_🆕`, a blue glass button rises from a cardboard box
// and a film peels off it). On the `NEW` layer, group `Group 1` holds the
// letter groups `w`, `e`, `n` (reverse reading order; each = [face group,
// shadow group, tr]) followed by the button face (`Group 3` glass gradient,
// `Group 4` lower sheen, `Group 5` base); group `Group 2` is the button frame.
// The box is `box` + `box 2` (flaps). Left out: the white foam inserts
// (`Layer 1`, `Layer 4`, `Layer 5`, `Layer 6`), the film (`Film 1`, `Film 2`),
// the shine sweeps (`Shape Layer 1/2/3`) and the matte `NEW 2`.
//
// Inscription: each letter = [face group, shadow group, tr], and the face and
// shadow each wrap one inner group (path + fill) placed by a static
// translation. Paths have 6 keyframes (t 0, 25, 30, 47, 56, 75; kf 0 and 5 face
// the viewer, kf 2 is edge-on, kf 3–4 squashed); one homography per keyframe
// maps all faces at kf 0 onto it (residual ≤ 0.002 px), another onto the
// shadows. Measured with scripts/text-motion.mjs (the box is the faces at kf 0).
// The pop scales 100 → 127 → 100, letters starting at t 118, 124, 130.
const FACE_MOTION: Mat3[] = [
  [1, 9.72551482425e-16, -2.46139223857e-12, 4.90586904578e-15, 1, -2.26448085949e-12, 9.62406265873e-18, 2.1044208835e-18, 1], // t 0
  [-0.185557933513, 0.00000370788021477, 329.013514569, -0.465554131416, 0.514686078561, 248.862815399, -0.000909285891203, 7.70016238178e-9, 1], // t 25
  [-0.406394350651, -0.0000174090553182, 447.26848468, -0.465912854098, 0.514650457694, 249.277148855, -0.000909260302239, -4.03147949187e-8, 1], // t 30
  [0.0016825384621, 0.00194072809996, -0.890567987544, 1.41674170973e-8, 0.00302104872119, -0.454832861848, 3.34861404305e-11, 0.00000379048825475, -0.0000568711841049], // t 47
  [0.0016825384621, 0.00194072809996, -0.890567987544, 1.41674170973e-8, 0.00302104872119, -0.454832861848, 3.34861404305e-11, 0.00000379048825475, -0.0000568711841049], // t 56
  [1, 9.72551482425e-16, -2.46139223857e-12, 4.90586904578e-15, 1, -2.26448085949e-12, 9.62406265873e-18, 2.1044208835e-18, 1], // t 75
]
const SHADOW_MOTION: Mat3[] = [
  [1.00003428353, -0.00000136867417224, -0.00769173923737, 0.0000192794391146, 1.00001833958, -3.87286155766, 3.5537983952e-8, -2.51663139945e-9, 1], // t 0
  [-0.182538085721, -0.00000238411786714, 325.701373427, -0.468555818156, 0.514680504244, 250.185766638, -0.000909267816736, -6.72567070141e-9, 1], // t 25
  [-0.406391740684, -0.00000528387785577, 447.261114141, -0.468927524052, 0.514674256746, 250.595946322, -0.00090926893997, -1.19473826329e-8, 1], // t 30
  [0.00166217527456, 0.00191721122603, -0.887201000801, 6.41873605467e-8, 0.00301042568093, -0.461366316475, 1.07721128721e-10, 0.00000374455442381, -0.0000706973678117], // t 47
  [0.00166217527456, 0.00191721122603, -0.887201000801, 6.41873605467e-8, 0.00301042568093, -0.461366316475, 1.07721128721e-10, 0.00000374455442381, -0.0000706973678117], // t 56
  [1.00003428353, -0.00000136867417224, -0.00769173923737, 0.0000192794391146, 1.00001833958, -3.87286155766, 3.5537983952e-8, -2.51663139945e-9, 1], // t 75
]

export const NEW: StickerProfile = {
  id: 'new',
  // By root name, not fingerprint: an inscription edit changes the structure, so the fingerprint.
  match: { nm: 'NEW_emoji_🆕' },
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
      select: [{ layer: 'NEW', path: ['Group 1', '@letter'] }], // letters (faces + shadows), before and after an edit
      key: { select: { layer: 'NEW', path: ['Group 1', '@letter', '#0'] }, nth: 0 }, // #ffffff
      text: {
        container: { layer: 'NEW', path: ['Group 1'] },
        original: 'NEW',
        box: { x0: 366.38, y0: 458.84, x1: 657.62, y1: 571.41 },
        pop: { first: 118, step: 6 },
        maxLength: 6,
        motion: { face: FACE_MOTION, shadow: SHADOW_MOTION },
      },
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
