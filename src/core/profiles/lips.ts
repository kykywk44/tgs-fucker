import type { StickerProfile } from '../parts'

// Lips (root `biting lips`, lips biting and licking): the lips are `Top Lip`,
// `Down LIp` and `D Line` (the dark-red inner lip edges); the teeth are
// `T Teeth`; the tongue is `Tongue` plus `Black`, the dark mouth interior,
// so that recolouring the tongue carries the interior along (it keeps its
// offset from the tongue's key). The translucent `T Light` glint is left out.
export const LIPS: StickerProfile = {
  id: 'lips',
  match: { fingerprint: '98784fc1' },
  parts: [
    {
      id: 'lips',
      name: 'Губы',
      select: [{ layer: 'Top Lip' }, { layer: 'Down LIp' }, { layer: 'D Line' }],
      key: { select: { layer: 'Top Lip', path: ['#2'] }, nth: 1 }, // #fe5782
    },
    {
      id: 'teeth',
      name: 'Зубы',
      select: [{ layer: 'T Teeth' }],
      key: { select: { layer: 'T Teeth', path: ['#2'] }, nth: 0 }, // #ffffff
    },
    {
      id: 'tongue',
      name: 'Язык',
      select: [{ layer: 'Tongue' }, { layer: 'Black' }],
      key: { select: { layer: 'Tongue', path: ['#5'] }, nth: 1 }, // #eb90b8
    },
  ],
}
