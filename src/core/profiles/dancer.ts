import type { StickerProfile } from '../parts'

// Dancer (root `Comp 1`, a man in a purple suit dancing): the skin is `HEAD`,
// `Ears`, `Neck`, the face details (`Nose`, `Mouth`, `Brows`, `Eyes`) and the
// hands (every `Wrist *` layer except its first group, the shirt cuff); the
// hair is `Hair`; the suit is the sleeves (`Hand *`), `Jacket *`, `BODY` (the
// lilac waistcoat with its gold buttons and the jacket front), the trousers
// (`Leg *`) and the dark lapels (`Colar` groups #1, #2); the shirt is the pink
// collar (`Colar` #0) and the cuffs (`Wrist *` #0); the shoes are `Shoe *`.
export const DANCER: StickerProfile = {
  id: 'dancer',
  match: { fingerprint: '48ed1f85' },
  parts: [
    {
      id: 'skin',
      name: 'Кожа',
      select: [
        { layer: 'HEAD' },
        { layer: 'Ears' },
        { layer: 'Neck' },
        { layer: 'Nose' },
        { layer: 'Mouth' },
        { layer: 'Brows' },
        { layer: 'Eyes' },
        { layer: 'Wrist *', path: ['#1'] },
        { layer: 'Wrist L*', path: ['#2'] },
        { layer: 'Wrist L*', path: ['#3'] },
      ],
      key: { select: { layer: 'HEAD' }, nth: 1 }, // #ffd140
    },
    {
      id: 'hair',
      name: 'Волосы',
      select: [{ layer: 'Hair' }],
      key: { select: { layer: 'Hair', path: ['#0', '#1'] }, nth: 1 }, // #e5c84e
    },
    {
      id: 'suit',
      name: 'Костюм',
      select: [
        { layer: 'Hand *' },
        { layer: 'Jacket *' },
        { layer: 'BODY' },
        { layer: 'Leg *' },
        { layer: 'Colar', path: ['#1'] },
        { layer: 'Colar', path: ['#2'] },
      ],
      key: { select: { layer: 'Hand L', path: ['#2'] }, nth: 1 }, // #9740ac
    },
    {
      id: 'shirt',
      name: 'Рубашка',
      select: [{ layer: 'Colar', path: ['#0'] }, { layer: 'Wrist *', path: ['#0'] }],
      key: { select: { layer: 'Colar', path: ['#0'] }, nth: 0 }, // #ce2489
    },
    {
      id: 'shoes',
      name: 'Туфли',
      select: [{ layer: 'Shoe *' }],
      key: { select: { layer: 'Shoe L 2', path: ['#1'] }, nth: 1 }, // #1c2d2c
    },
  ],
}
