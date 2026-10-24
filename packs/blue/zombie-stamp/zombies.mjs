// Stage 2: the blue zombie on its own → exports/blue/zombie-<n>.tgs (motion.json → zombie)
// node packs/blue/zombie-stamp/zombies.mjs
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {read,finish} from '../lib/silhouette.mjs'
import {blueZombie} from './zombie.mjs'

const cfg=JSON.parse(await readFile(join(import.meta.dirname,'motion.json'),'utf8'))
const n=cfg.zombie.n,anim=await blueZombie(n,cfg.zombie)
anim.nm=`${n} · синий зомби`
await finish(`zombie-${n}`,await read(`library/emoji/${n}.tgs`),anim,[0,24,42,60,108,150])
