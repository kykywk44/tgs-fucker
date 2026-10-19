import type { StickerProfile } from '../parts'

// Case (root `BRIEFCASE MAIN`, a brown leather briefcase that opens with papers
// inside; Suitcase shares the root name, so matched by fingerprint): the body
// is the leather shell `BODY BRIEFCASE` + `BACK BRIEFCASE` + `Inside Briefcase`,
// the flap `HEAD BRIEFCASE` + `HEAD BRIEFCASE BACK` + `Head BACK`, the strap
// `Belt` and its tab `Reed` (the stitching lives inside these layers); the
// clasp and handle are `Clasp TOP` + `Clasp BOTTOM` + `Handle` + `Handle Parts`;
// the papers are `1`/`2`/`3` and their line layers `1.1`/`2.2`/`3,3`. The white
// ripple `Wave` is left out.
export const CASE: StickerProfile = {
  id: 'case',
  match: { fingerprint: '7b20c195' },
  parts: [
    {
      id: 'body',
      name: 'Корпус',
      select: [
        { layer: 'BODY BRIEFCASE' },
        { layer: 'BACK BRIEFCASE' },
        { layer: 'Inside Briefcase' },
        { layer: 'HEAD BRIEFCASE' },
        { layer: 'HEAD BRIEFCASE BACK' },
        { layer: 'Head BACK' },
        { layer: 'Belt' },
        { layer: 'Reed' },
      ],
      key: { select: { layer: 'BODY BRIEFCASE', path: ['#2'] }, nth: 5 }, // #82614f
    },
    {
      id: 'clasp',
      name: 'Замок и ручка',
      select: [{ layer: 'Clasp TOP' }, { layer: 'Clasp BOTTOM' }, { layer: 'Handle' }, { layer: 'Handle Parts' }],
      key: { select: { layer: 'Clasp TOP', path: ['#1'] }, nth: 0 }, // #aaa7a5
    },
    {
      id: 'papers',
      name: 'Бумаги внутри',
      select: [{ layer: '1' }, { layer: '2' }, { layer: '3' }, { layer: '1.1' }, { layer: '2.2' }, { layer: '3,3' }],
      key: { select: { layer: '3' }, nth: 2 }, // #fffcf0
    },
  ],
}
