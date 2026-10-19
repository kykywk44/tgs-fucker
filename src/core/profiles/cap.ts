import type { StickerProfile } from '../parts'

// Cap (root `Cap 5`, a Telegram-logo baseball cap turning around): the crown is
// `CAP` + `Cap Side R` + `Back` (the inner band seen when it tilts) + `Top`
// (the button, kept in the crown), the visor is the three `Visor *` layers,
// the logo is `Logo`.
export const CAP: StickerProfile = {
  id: 'cap',
  match: { fingerprint: 'ebef5157' },
  parts: [
    {
      id: 'crown',
      name: 'Купол',
      select: [{ layer: 'CAP' }, { layer: 'Cap Side R' }, { layer: 'Back' }, { layer: 'Top' }],
      key: { select: { layer: 'CAP', path: ['#5'] }, nth: 1 }, // #5e5c6b
    },
    {
      id: 'visor',
      name: 'Козырёк',
      select: [{ layer: 'Visor Front' }, { layer: 'Visor Main' }, { layer: 'Visor Bottom' }],
      key: { select: { layer: 'Visor Main', path: ['#4'] }, nth: 1 }, // #3e3b47
    },
    {
      id: 'logo',
      name: 'Логотип',
      select: [{ layer: 'Logo' }],
      key: { select: { layer: 'Logo' }, nth: 0 }, // #ffffff
    },
  ],
}
