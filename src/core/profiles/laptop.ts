import type { StickerProfile } from '../parts'

// Laptop guy (root `Boy`, a blond guy peeking over a grey laptop): the skin is
// `HEAD`, `Ears`, `Nose`, `Mouth`, the hands (`Wrist *`), the neck
// (`BODY R` #2) and, of `Eyes`, each eye's lash line and lids (#0 and #1 in
// either eye group, the lids close for the wink); the eyes are each eye's
// iris (#2) and white (#3); the hair is `Hair` + `Hair Back` + `Brows` (user: brows follow the hair); the laptop is
// `Laptop` without its translucent glare (#2, left out) and logo (#3); the
// logo is the translucent plane on the lid (`Laptop` #3); the sweater is the
// blue shoulders (`BODY L`, `BODY R` #0–#1).
export const LAPTOP: StickerProfile = {
  id: 'laptop',
  match: { fingerprint: '7f56e3f7' },
  parts: [
    {
      id: 'skin',
      name: 'Кожа',
      select: [
        { layer: 'HEAD' },
        { layer: 'Ears' },
        { layer: 'Nose' },
        { layer: 'Mouth' },
        { layer: 'Wrist *' },
        { layer: 'BODY R', path: ['#2'] },
        { layer: 'Eyes', path: ['*', '#0'] },
        { layer: 'Eyes', path: ['*', '#1'] },
      ],
      key: { select: { layer: 'HEAD', path: ['#0', '#0'] }, nth: 0 }, // #ffcf00
    },
    {
      id: 'hair',
      name: 'Волосы',
      select: [{ layer: 'Hair' }, { layer: 'Hair Back' }, { layer: 'Brows' }],
      key: { select: { layer: 'Hair', path: ['#4'] }, nth: 0 }, // #ffcf00
    },
    {
      id: 'eyes',
      name: 'Глаза',
      select: [{ layer: 'Eyes', path: ['*', '#2'] }, { layer: 'Eyes', path: ['*', '#3'] }],
      key: { select: { layer: 'Eyes', path: ['#0', '#2', '#3'] }, nth: 1 }, // #683002
    },
    {
      id: 'laptop',
      name: 'Ноутбук',
      select: [{ layer: 'Laptop', path: ['#0'] }, { layer: 'Laptop', path: ['#1'] }, { layer: 'Laptop', path: ['#4'] }],
      key: { select: { layer: 'Laptop', path: ['#4'] }, nth: 1 }, // #929093
    },
    {
      id: 'logo',
      name: 'Логотип',
      select: [{ layer: 'Laptop', path: ['#3'] }],
      key: { select: { layer: 'Laptop', path: ['#3'] }, nth: 1 }, // #5c5763
    },
    {
      id: 'sweater',
      name: 'Кофта',
      select: [
        { layer: 'BODY L' },
        { layer: 'BODY R', path: ['#0'] },
        { layer: 'BODY R', path: ['#1'] },
      ],
      key: { select: { layer: 'BODY L', path: ['#1', '#1'] }, nth: 0 }, // #4e64ff
    },
  ],
}
