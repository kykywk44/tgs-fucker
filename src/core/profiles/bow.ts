import type { StickerProfile } from '../parts'

// Bow (root `Reminder Ribbon`, a bow whose arrow flies off and comes back):
// the bow is the wooden limbs `Konci LUKA` + the golden grip wrap `Ruchka LUKA`
// + the grey string caps on the limb tips `KREPEZ tetevi 1`/`2`, the string is
// `Teteva 1` + `Teteva 2`, the shaft is `Strela`, and the head and fletching
// are `Nakonechnik streli` + `Operenie streli`. The white motion streaks
// (`Shape Layer 1`–`4`) are left out.
export const BOW: StickerProfile = {
  id: 'bow',
  match: { fingerprint: 'bc009fe7' },
  parts: [
    {
      id: 'bow',
      name: 'Лук и обмотка',
      select: [
        { layer: 'Konci LUKA' },
        { layer: 'Ruchka LUKA' },
        { layer: 'KREPEZ tetevi 1' },
        { layer: 'KREPEZ tetevi 2' },
      ],
      key: { select: { layer: 'Konci LUKA', path: ['#5'] }, nth: 0 }, // #6d4238
    },
    {
      id: 'string',
      name: 'Тетива',
      select: [{ layer: 'Teteva 1' }, { layer: 'Teteva 2' }],
      key: { select: { layer: 'Teteva 1', path: ['#0'] }, nth: 0 }, // #d3d3d3
    },
    {
      id: 'shaft',
      name: 'Древко стрелы',
      select: [{ layer: 'Strela' }],
      key: { select: { layer: 'Strela', path: ['#1'] }, nth: 0 }, // #7e7062
    },
    {
      id: 'head',
      name: 'Наконечник и оперение',
      select: [{ layer: 'Nakonechnik streli' }, { layer: 'Operenie streli' }],
      key: { select: { layer: 'Nakonechnik streli', path: ['#0'] }, nth: 0 }, // #7e868e
    },
  ],
}
