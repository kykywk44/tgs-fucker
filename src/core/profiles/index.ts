import type { StickerProfile } from '../parts'
import { COOL } from './cool'
import { EYE } from './eye'
import { HEART } from './heart'

// Known stickers, tried in this order by matchProfile.
export const PROFILES: readonly StickerProfile[] = [EYE, HEART, COOL]
