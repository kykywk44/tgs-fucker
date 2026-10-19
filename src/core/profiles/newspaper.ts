import type { StickerProfile } from '../parts'

// Newspaper (root `newspaper`, «The Apple Times» flips over). The front page
// before the flip is the `* 2` / `* F*` layer set (t 0–40), the page after it
// the plain-named set (t 40–179); every part takes both. The sheet is `Paper*`
// + `Back`, `Back 2`, `Back 3` (its reverse; each name is used twice) +
// `UGOL` (the curled corner). The text lines are `top lines`, `left lines`,
// `right lines` and `Top News`. The masthead is the letters `The`, `Apple`,
// `TIMES` with the rules `Title Lines Top` / `Title Lines Down`. Left out: the
// eagle (`EAGLE`, `E *`) and the volcano picture (`Picture Frame *`,
// `Volcano*`, `Smoke*`, `Back 4`, `Back 5`).
export const NEWSPAPER: StickerProfile = {
  id: 'newspaper',
  match: { fingerprint: 'c7a55dfb' },
  parts: [
    {
      id: 'paper',
      name: 'Лист',
      select: [
        { layer: 'Paper' },
        { layer: 'Paper 2' },
        { layer: 'Paper 3' },
        { layer: 'Paper F' },
        { layer: 'Paper F2' },
        { layer: 'Paper F3' },
        { layer: 'Back' },
        { layer: 'Back 2' },
        { layer: 'Back 3' },
        { layer: 'UGOL' },
      ],
      key: { select: { layer: 'Paper', path: ['#4'] }, nth: 2 }, // #dcdcdc
    },
    {
      id: 'lines',
      name: 'Строки',
      select: [
        { layer: 'top lines' },
        { layer: 'left lines' },
        { layer: 'right lines' },
        { layer: 'Top News' },
        { layer: 'top lines 2' },
        { layer: 'left lines 2' },
        { layer: 'right lines 2' },
        { layer: 'Top News 2' },
      ],
      key: { select: { layer: 'top lines', path: ['#0'] }, nth: 0 }, // #8f8f8f
    },
    {
      id: 'title',
      name: 'Заголовок',
      select: [
        { layer: 'The' },
        { layer: 'Apple' },
        { layer: 'TIMES' },
        { layer: 'Title Lines Top' },
        { layer: 'Title Lines Down' },
        { layer: 'The 2' },
        { layer: 'Apple 2' },
        { layer: 'TIMES 2' },
        { layer: 'Title Lines Top 2' },
        { layer: 'Title Lines Down 2' },
      ],
      key: { select: { layer: 'The' }, nth: 0 }, // #4d4d4d
    },
  ],
}
