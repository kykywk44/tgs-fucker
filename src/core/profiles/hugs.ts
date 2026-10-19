import type { StickerProfile } from '../parts'

// Hugs (root `People-hugging`, two blue silhouettes hugging): everything lives
// in the precomp asset `comp_0`, whose layer names start with the person's
// number — `1-*` is the left person (`1-BODY`, its outlines `1-Body+`, the
// hands `1-Hand*`), `2-*` the right one (`2-Head`, `2-Body`, `2-Hand*` with
// their light/dark outlines). `2-Hand-down` (the hand on the left person's
// back, parented to `1-BODY`) goes with the right person by its name. The
// root `border` layer (white, never visible) is left out.
export const HUGS: StickerProfile = {
  id: 'hugs',
  match: { fingerprint: '2d07c01b' },
  parts: [
    {
      id: 'left',
      name: 'Левый человек',
      select: [{ asset: 'comp_0', layer: '1-*' }],
      key: { select: { asset: 'comp_0', layer: '1-BODY' }, nth: 1 }, // #6086a7
    },
    {
      id: 'right',
      name: 'Правый человек',
      select: [{ asset: 'comp_0', layer: '2-*' }],
      key: { select: { asset: 'comp_0', layer: '2-Body' }, nth: 1 }, // #5b83a4
    },
  ],
}
