import type { StickerProfile } from '../parts'

// Suitcase (root `BRIEFCASE MAIN`, a navy attaché case that opens with books,
// papers, a laptop and a pen inside; Case shares the root name, so matched by
// fingerprint). The shell is `COVER` + `Cover close` + `BODY bottom` + the grey
// lining `Inside` / `Stroke inside*` / `COVER INSIDE*` / `Pocket 1-3`, plus
// the dark grip of `Handle` (#2) and its outline (#5). The gold hardware is
// `Lock top L/R` + `Locks bottom` + the hinges `Loop L/R` + the handle mounts
// (`Handle` #0 #1 #3 #4) + the gold studs and zip of the pockets (`Pocket 1`
// #0 #1, `Pocket 2` #0, `Pocket 3` #0 #0 #0, `COVER INSIDE` #0 #2 #0-1).
// Contents: `Book red`, `Book green` + `Book green back`, `Note`, `Laptop`,
// the papers `1` / `2` / `1.1` / `1.2`, `Pen`. Cast shadows go with the
// surface they fall on: `Book green shadow` → red book, `Pen shadow` → note,
// `Shadow laptop` → shell. The translucent `Shadow` and the white `Splash L/R`
// are left out.
export const SUITCASE: StickerProfile = {
  id: 'suitcase',
  match: { fingerprint: 'e3f4d2b2' },
  parts: [
    {
      id: 'shell',
      name: 'Корпус и отделка',
      select: [
        { layer: 'COVER' },
        { layer: 'Cover close' },
        { layer: 'BODY bottom' },
        { layer: 'Inside' },
        { layer: 'Stroke inside' },
        { layer: 'Stroke inside piece' },
        { layer: 'COVER INSIDE STROKE' },
        { layer: 'COVER INSIDE', path: ['#0', '#0'] },
        { layer: 'COVER INSIDE', path: ['#0', '#1'] },
        { layer: 'COVER INSIDE', path: ['#0', '#2', '#2'] },
        { layer: 'COVER INSIDE', path: ['#0', '#2', '#3'] },
        { layer: 'COVER INSIDE', path: ['#0', '#2', '#4'] },
        { layer: 'COVER INSIDE', path: ['#0', '#2', '#5'] },
        { layer: 'COVER INSIDE', path: ['#0', '#3'] },
        { layer: 'COVER INSIDE', path: ['#0', '#4'] },
        { layer: 'COVER INSIDE', path: ['#0', '#5'] },
        { layer: 'COVER INSIDE', path: ['#0', '#6'] },
        { layer: 'Pocket 1', path: ['#2'] },
        { layer: 'Pocket 1', path: ['#3'] },
        { layer: 'Pocket 1', path: ['#4'] },
        { layer: 'Pocket 1', path: ['#5'] },
        { layer: 'Pocket 1', path: ['#6'] },
        { layer: 'Pocket 1', path: ['#7'] },
        { layer: 'Pocket 2', path: ['#1'] },
        { layer: 'Pocket 2', path: ['#2'] },
        { layer: 'Pocket 2', path: ['#3'] },
        { layer: 'Pocket 2', path: ['#4'] },
        { layer: 'Pocket 2', path: ['#5'] },
        { layer: 'Pocket 3', path: ['#0', '#0', '#1'] },
        { layer: 'Pocket 3', path: ['#0', '#0', '#2'] },
        { layer: 'Pocket 3', path: ['#0', '#0', '#3'] },
        { layer: 'Handle', path: ['#2'] },
        { layer: 'Handle', path: ['#5'] },
        { layer: 'Shadow laptop' },
      ],
      key: { select: { layer: 'COVER', path: ['#1'] }, nth: 4 }, // #2e5979
    },
    {
      id: 'hardware',
      name: 'Замки и фурнитура',
      select: [
        { layer: 'Lock top L' },
        { layer: 'Lock top R' },
        { layer: 'Locks bottom' },
        { layer: 'Loop L' },
        { layer: 'Loop R' },
        { layer: 'Handle', path: ['#0'] },
        { layer: 'Handle', path: ['#1'] },
        { layer: 'Handle', path: ['#3'] },
        { layer: 'Handle', path: ['#4'] },
        { layer: 'Pocket 1', path: ['#0'] },
        { layer: 'Pocket 1', path: ['#1'] },
        { layer: 'Pocket 2', path: ['#0'] },
        { layer: 'Pocket 3', path: ['#0', '#0', '#0'] },
        { layer: 'COVER INSIDE', path: ['#0', '#2', '#0'] },
        { layer: 'COVER INSIDE', path: ['#0', '#2', '#1'] },
      ],
      key: { select: { layer: 'Locks bottom', path: ['#0', '#7'] }, nth: 0 }, // #ea961c
    },
    {
      id: 'red-book',
      name: 'Красная книга',
      select: [{ layer: 'Book red' }, { layer: 'Book green shadow' }],
      key: { select: { layer: 'Book red', path: ['#3'] }, nth: 1 }, // #da331d
    },
    {
      id: 'green-book',
      name: 'Зелёная книга',
      select: [{ layer: 'Book green' }, { layer: 'Book green back' }],
      key: { select: { layer: 'Book green', path: ['#3'] }, nth: 1 }, // #27af34
    },
    {
      id: 'notebook',
      name: 'Оранжевый блокнот',
      select: [{ layer: 'Note' }, { layer: 'Note Shadow' }, { layer: 'Pen shadow' }],
      key: { select: { layer: 'Note', path: ['#2'] }, nth: 1 }, // #ff9827
    },
    {
      id: 'laptop',
      name: 'Ноутбук',
      select: [{ layer: 'Laptop' }],
      key: { select: { layer: 'Laptop', path: ['#5'] }, nth: 1 }, // #a3abb4
    },
    {
      id: 'papers',
      name: 'Бумаги',
      select: [{ layer: '1' }, { layer: '2' }, { layer: '1.1' }, { layer: '1.2' }],
      key: { select: { layer: '1.1', path: ['#1'] }, nth: 2 }, // #fffcf0
    },
    {
      id: 'pen',
      name: 'Перо',
      select: [{ layer: 'Pen' }],
      key: { select: { layer: 'Pen', path: ['#0', '#6'] }, nth: 1 }, // #15394b
    },
  ],
}
