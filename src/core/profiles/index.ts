import type { StickerProfile } from '../parts'
import { ASTRAL } from './astral'
import { BOW } from './bow'
import { CAP } from './cap'
import { CASE } from './case'
import { COOL } from './cool'
import { DANCER } from './dancer'
import { DIARY } from './diary'
import { EVIL_EYE } from './evil-eye'
import { EYE } from './eye'
import { HEART } from './heart'
import { HUGS } from './hugs'
import { LAPTOP } from './laptop'
import { LIPS } from './lips'
import { NEW } from './new'
import { NEWSPAPER } from './newspaper'
import { SUITCASE } from './suitcase'
import { TARGET } from './target'

// Known stickers, tried in this order by matchProfile. Eye, Heart, Cool and NEW
// match by root `nm` (an inscription edit changes the fingerprint); the rest by
// fingerprint (root names repeat or are missing).
export const PROFILES: readonly StickerProfile[] = [
  EYE, HEART, COOL, CAP, ASTRAL, BOW, CASE, DANCER, DIARY, EVIL_EYE, HUGS, LAPTOP, LIPS, NEW, NEWSPAPER, SUITCASE, TARGET,
]
