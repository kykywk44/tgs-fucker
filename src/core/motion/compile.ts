import type { Lottie } from '../tgs'
import { EASES, easeAt, valueAt, type EaseName } from './easing'
import { CHANNELS, MULTIPLIER, PRESETS, presetNames, restOf, type Channel, type Curves, type Key, type PivotName } from './presets'

// Motion compiler: a static sticker (named groups, e.g. imported from a Figma SVG) plus a
// motion spec → an animated Lottie. Parts are shape groups found by `nm`; nesting in the
// drawing is the rig hierarchy (eyes inside `body` move with the body). A part's transform
// gets its anchor moved to the pivot (without moving the drawing), then its channels are
// keyframed: straight from the preset's keys and eases when one track drives a property,
// otherwise sampled every frame and thinned out. yaw/pitch turn the part's drawing in
// perspective by morphing every path inside it; effects are precomps copied from other
// stickers and dropped in at a part's point at given times.

export type Vec = [number, number]
export interface RigEntry {
  pivot?: Vec | PivotName // in canvas px, or a side of the part's box
  hidden?: boolean // invisible at rest; the `show` channel (0–100) makes it appear
  z?: number // depth for yaw/pitch (part-local units, + = towards the viewer)
  turnCenter?: Vec | PivotName // centre of yaw/pitch (default: the part's box centre)
  focal?: number // perspective distance for yaw/pitch (part-local units, default 900)
  depth?: DepthSpec // extrude the part's silhouette so a turn shows its side faces
  // regions of the part (its own coordinates) set back to another depth, with their own extrusion
  // thickness — a trigger guard narrower than the frame. Values blend in over `feather` at the edge.
  zones?: Zone[]
}
export interface Zone { box: [number, number, number, number]; z: number; thickness?: number; feather?: number }

// How much of a zone applies at a point: 1 well inside, 0 outside, smooth over `feather` at the edge.
function zoneWeight(zone: Zone, [x, y]: Vec): number {
  const f = zone.feather ?? 10
  const d = Math.min(x - zone.box[0], zone.box[2] - x, y - zone.box[1], zone.box[3] - y)
  const u = Math.max(0, Math.min(1, (d + f / 2) / f))
  return u * u * (3 - 2 * u)
}
// Face depth and extrusion thickness at a point of a part with zones.
function zoned(zones: Zone[] | undefined, p: Vec, z: number, thickness: number): [number, number] {
  for (const zone of zones ?? []) {
    const w = zoneWeight(zone, p)
    if (w > 0) return [z + (zone.z - z) * w, thickness + ((zone.thickness ?? thickness) - thickness) * w]
  }
  return [z, thickness]
}
// Side faces for a turn: `layers` copies of the part's filled shapes (simplified to polygons) stacked
// from z − thickness to z, drawn behind the part in two passes — all outlined first, then all filled —
// so only the outer outline of the extruded body stays. The outline is the part's own width less the
// simplification error, so at rest the copies hide completely behind the face (outline included).
export interface DepthSpec {
  thickness: number // part-local units
  color: string // side colour, '#rrggbb'
  outline?: number // outline width of the extruded body, the same as the part's own (default 6)
  outlineColor?: string // the part's outline colour (default '#000000')
  layers?: number // copies (default 3)
  minArea?: number // skip filled shapes smaller than this share of the largest one (default 0.01)
  tolerance?: number // polygon simplification, part-local units (default 0.75)
  // 'round': a cylinder along x (a barrel): copies spread over z ± thickness/2, each as tall as the
  // circular cross-section at its depth; `cap` adds the end face at +x (an ellipse with a bore hole),
  // shown only while it faces the viewer
  profile?: 'box' | 'round'
  cap?: { color?: string; hole?: string; into?: string } // `into`: draw the end face in that part (e.g. one over the slide)
}
export interface MotionSpec {
  duration: number // seconds, ≤ 3 for Telegram
  fps?: number // default 60
  rig?: Record<string, RigEntry>
  tracks: Track[]
  effects?: EffectSpec[]
}
// `part`: group name, '*' allowed ('eye_*'). `at`: start(s), seconds. Other fields are preset parameters.
// follow: { part, preset: 'follow', of, from, to?, gain?, delay? } — secondary motion: `to` channel of
// `part` = gain × (`from` channel offset of `of`, `delay` seconds ago).
// `each: true` with several starts and several matching parts: the k-th start drives only the
// (k mod n)-th part (shell_1, shell_2, … take turns). `launch: { part, point }` moves each start's
// x/y motion so it begins at that point of the part, read at the start frame (a shell thrown from
// the ejection port of a recoiling, turning gun).
export interface Track { part: string; preset: string; at?: number | number[]; each?: boolean; launch?: { part: string; point: Vec }; [param: string]: unknown }
// A precomp from another sticker (`sources[source]`, asset id `comp`) placed at `anchor` (canvas
// point, or a point in a part's coordinates, read at the start frame) for each start in `at`.
export interface EffectSpec {
  source: string
  comp: string
  at: number | number[]
  anchor: Vec | { part: string; point: Vec }
  scale?: number | number[] // percent; arrays are cycled per start
  rotate?: number | number[] // degrees (added to the barrel direction with `aim`)
  aim?: boolean // turn with the anchor part: the comp's +x axis follows the part's +x axis
  follow?: boolean // keep to the anchor point while the part moves (re-read every frame)
  stretch?: Vec // extra x/y scale in percent, along the comp's own axes (a flash elongated along the barrel)
  speed?: number // playback speed of the comp (2 = twice as fast)
  origin?: Vec // point of the comp placed at the anchor (default: the comp's centre)
  skip?: number // frames of the comp to skip at the start
  len?: number // seconds shown (default: the comp's own length)
  grow?: [number, number] // scale multiplier (percent) from → to over `len`
  drift?: Vec // px moved over `len`
  fade?: boolean // opacity 100 → 0 over the second half
  behind?: boolean // under the sticker instead of over it
}

type Mat = [number, number, number, number, number, number] // x' = a x + c y + e, y' = b x + d y + f
type Prop = { a?: number; k: unknown }
type Tr = { a: Prop; p: Prop; s: Prop; r: Prop; o: Prop; [key: string]: unknown }
interface Item { ty?: string | number; nm?: string; it?: Item[]; [key: string]: unknown }
interface Found { group: Item; tr: Tr; parent: Mat; chain: Tr[]; layerKs: Partial<Tr> }
interface Path { c: boolean; v: Vec[]; i: Vec[]; o: Vec[] }

const round = (v: number) => Math.round(v * 1000) / 1000
const round2 = (v: number) => Math.round(v * 100) / 100

// ---------- geometry ----------

const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
]
const apply = (m: Mat, [x, y]: Vec): Vec => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2]
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det]
}
const ID: Mat = [1, 0, 0, 1, 0, 0]

function staticVec(prop: Prop | undefined, fallback: number[]): number[] {
  if (!prop) return fallback
  if (prop.a === 1) throw new Error('у части уже есть анимация трансформации')
  return typeof prop.k === 'number' ? [prop.k] : (prop.k as number[])
}
const vecAt = (prop: Prop | undefined, fallback: number[], frame: number) => (prop ? valueAt(prop, frame) : fallback)

function rotScale(deg: number, sx: number, sy: number): Mat {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  return [c * sx / 100, s * sx / 100, -s * sy / 100, c * sy / 100, 0, 0]
}
function matrixOf(a: number[], p: number[], s: number[], r: number): Mat {
  return mul([1, 0, 0, 1, p[0], p[1]], mul(rotScale(r, s[0], s[1]), [1, 0, 0, 1, -a[0], -a[1]]))
}
// T(p)·R(r)·S(s)·T(−a) of a group `tr` or a layer `ks` at rest (skew ignored) …
function trMatrix(tr: Partial<Tr> | undefined): Mat {
  if (!tr) return ID
  return matrixOf(staticVec(tr.a, [0, 0]), staticVec(tr.p, [0, 0]), staticVec(tr.s, [100, 100]), staticVec(tr.r, [0])[0])
}
// … and at a frame, animated or not.
function trMatrixAt(tr: Partial<Tr> | undefined, frame: number): Mat {
  if (!tr) return ID
  return matrixOf(vecAt(tr.a, [0, 0], frame), vecAt(tr.p, [0, 0], frame), vecAt(tr.s, [100, 100], frame), vecAt(tr.r, [0], frame)[0])
}

const trOf = (group: Item) => group.it?.find((i) => i.ty === 'tr') as Tr | undefined

// Bezier path of a rectangle (with corner roundness) or an ellipse.
function rectPath(cx: number, cy: number, w: number, h: number, r: number): Path {
  r = Math.min(r, w / 2, h / 2)
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, k = r * 0.5523
  if (r <= 0) return { c: true, v: [[x1, y0], [x1, y1], [x0, y1], [x0, y0]], i: [[0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0]] }
  return {
    c: true,
    v: [[x1, y0 + r], [x1, y1 - r], [x1 - r, y1], [x0 + r, y1], [x0, y1 - r], [x0, y0 + r], [x0 + r, y0], [x1 - r, y0]],
    i: [[0, -k], [0, 0], [k, 0], [0, 0], [0, k], [0, 0], [-k, 0], [0, 0]],
    o: [[0, 0], [0, k], [0, 0], [-k, 0], [0, 0], [0, -k], [0, 0], [k, 0]],
  }
}
function ellipsePath(cx: number, cy: number, w: number, h: number): Path {
  const rx = w / 2, ry = h / 2, kx = rx * 0.5523, ky = ry * 0.5523
  return {
    c: true,
    v: [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]],
    i: [[-kx, 0], [0, -ky], [kx, 0], [0, ky]],
    o: [[kx, 0], [0, ky], [-kx, 0], [0, -ky]],
  }
}
function staticPath(it: Item): Path | null {
  if (it.ty === 'sh') {
    const ks = it.ks as Prop
    return (ks.a === 1 ? (ks.k as { s: Path[] }[])[0].s[0] : ks.k) as Path
  }
  if (it.ty === 'rc') {
    const [cx, cy] = staticVec(it.p as Prop, [0, 0]), [w, h] = staticVec(it.s as Prop, [0, 0])
    return rectPath(cx, cy, w, h, staticVec(it.r as Prop, [0])[0])
  }
  if (it.ty === 'el') {
    const [cx, cy] = staticVec(it.p as Prop, [0, 0]), [w, h] = staticVec(it.s as Prop, [0, 0])
    return ellipsePath(cx, cy, w, h)
  }
  return null
}

// Points bounding the group's drawing in canvas coordinates (Bezier handles included).
function boxOf(items: Item[], m: Mat, out: Vec[]): void {
  const own = mul(m, trMatrix(items.find((i) => i.ty === 'tr') as Tr | undefined))
  for (const it of items) {
    if (it.ty === 'gr') { boxOf(it.it ?? [], own, out); continue }
    const path = staticPath(it)
    if (!path) continue
    path.v.forEach((v, n) => {
      out.push(apply(own, v))
      out.push(apply(own, [v[0] + path.i[n][0], v[1] + path.i[n][1]]))
      out.push(apply(own, [v[0] + path.o[n][0], v[1] + path.o[n][1]]))
    })
  }
}

function boxPoint(found: Found, pivot: Vec | PivotName): Vec {
  if (Array.isArray(pivot)) return pivot
  const pts: Vec[] = []
  boxOf(found.group.it ?? [], found.parent, pts)
  if (!pts.length) throw new Error(`часть «${found.group.nm}» пустая`)
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  return ({ center: [cx, cy], bottom: [cx, y1], top: [cx, y0], left: [x0, cy], right: [x1, cy] } as Record<PivotName, Vec>)[pivot]
}

// Moves the anchor to the canvas point without moving the drawing: p' = p + R·S·(a' − a).
function setPivot(found: Found, canvas: Vec): void {
  const tr = found.tr
  const local = apply(invert(mul(found.parent, trMatrix(tr))), canvas)
  const [ax, ay] = staticVec(tr.a, [0, 0]), [px, py] = staticVec(tr.p, [0, 0])
  const [sx, sy] = staticVec(tr.s, [100, 100]), [r] = staticVec(tr.r, [0])
  const [dx, dy] = apply(rotScale(r, sx, sy), [local[0] - ax, local[1] - ay])
  tr.a = { a: 0, k: [round(local[0]), round(local[1])] }
  tr.p = { a: 0, k: [round(px + dx), round(py + dy)] }
}

// ---------- parts ----------

function findGroups(anim: Lottie): Map<string, Found[]> {
  const out = new Map<string, Found[]>()
  const walk = (items: Item[], parent: Mat, chain: Tr[], layerKs: Partial<Tr>) => {
    for (const it of items) {
      if (it.ty !== 'gr') continue
      const tr = trOf(it)
      if (it.nm && tr) out.set(it.nm, [...(out.get(it.nm) ?? []), { group: it, tr, parent, chain, layerKs }])
      walk(it.it ?? [], mul(parent, trMatrix(tr)), tr ? [...chain, tr] : chain, layerKs)
    }
  }
  for (const layer of anim.layers as Item[]) {
    if (layer.ty === 4) walk((layer.shapes as Item[]) ?? [], trMatrix(layer.ks as Tr), [], layer.ks as Partial<Tr>)
  }
  return out
}

function matchParts(groups: Map<string, Found[]>, pattern: string): Found[] {
  const re = new RegExp(`^${pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`)
  const hits = [...groups].filter(([name]) => re.test(name)).flatMap(([, f]) => f)
  if (!hits.length) throw new Error(`часть «${pattern}» не найдена; есть: ${[...groups.keys()].join(', ')}`)
  // glob matches in name order (shell_1, shell_2, …) so `each` assigns starts predictably
  return pattern.includes('*') ? hits.sort((a, b) => (a.group.nm! < b.group.nm! ? -1 : 1)) : hits
}

// Rig settings of a part: entries whose name pattern ('eye_*') matches, later ones winning.
function rigFor(rig: Record<string, RigEntry>, name: string | undefined): RigEntry {
  if (!name) return {}
  const glob = (p: string) => new RegExp(`^${p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`)
  return Object.assign({}, ...Object.entries(rig).filter(([p]) => glob(p).test(name)).map(([, e]) => e))
}

// Canvas position of a point in a part's coordinates at a frame: animated transforms included, and
// the perspective turn of the part or of its nearest turning ancestor.
function canvasPointAt(found: Found, local: Vec, frame: number, turns: Map<Tr, Projector> = new Map()): Vec {
  const trs = [...found.chain, found.tr]
  let k = trs.length - 1
  while (k >= 0 && !turns.has(trs[k])) k--
  let p = local
  if (k >= 0) {
    for (let j = trs.length - 1; j > k; j--) p = apply(trMatrixAt(trs[j], frame), p)
    p = turns.get(trs[k])!(frame, p)
  }
  let m = trMatrixAt(found.layerKs, frame)
  for (const tr of trs.slice(0, k >= 0 ? k + 1 : trs.length)) m = mul(m, trMatrixAt(tr, frame))
  return apply(m, p)
}

// ---------- channels ----------

// `keys`/`starts` are kept when the channel can be written straight from the preset keys.
interface Driven { fn: (t: number) => number; keys?: Key[]; starts?: number[]; track: Track }

function curveAt(keys: Key[], t: number): number {
  if (t <= keys[0].t) return keys[0].v
  for (let n = 0; n < keys.length - 1; n++) {
    const a = keys[n], b = keys[n + 1]
    if (t >= b.t) continue
    return a.v + (b.v - a.v) * easeAt(EASES[a.ease ?? 'linear'], (t - a.t) / (b.t - a.t))
  }
  return keys[keys.length - 1].v
}

const startsOf = (track: { at?: number | number[] }): number[] => {
  const at = track.at ?? 0
  const list = Array.isArray(at) ? at : [at]
  if (!list.length || list.some((t) => typeof t !== 'number' || !Number.isFinite(t))) throw new Error('at: ожидается число или массив чисел')
  return list
}

// A preset track as functions of loop time, one per channel. Several starts add up (offsets) or
// multiply (multipliers); a start that runs past the loop end wraps to its beginning.
function presetChannels(track: Track, starts: number[], D: number): Partial<Record<Channel, Driven>> {
  const preset = PRESETS[track.preset]
  if (!preset) throw new Error(`пресет «${track.preset}» не найден; есть: ${presetNames().join(', ')}`)
  const len = preset.len(track, D)
  const curves: Curves = preset.curves(track, len)
  const out: Partial<Record<Channel, Driven>> = {}
  for (const [c, keys] of Object.entries(curves) as [Channel, Key[]][]) {
    const rest = restOf(c)
    const one = (at: number, t: number) => {
      const local = (((t - at) % D) + D) % D
      return local > len + 1e-9 ? rest : curveAt(keys, local)
    }
    const fn = (t: number) => starts.reduce((v, at) => (MULTIPLIER[c] ? (v * one(at, t)) / rest : v + one(at, t) - rest), rest)
    const clean = starts.every((at, n) => at >= 0 && at + len <= D + 1e-9 && (n === 0 || at >= starts[n - 1] + len - 1e-9))
    out[c] = { fn, keys: clean ? keys : undefined, starts: clean ? starts : undefined, track }
  }
  return out
}

// ---------- keyframes ----------

type Handle = { x: number | number[]; y: number | number[] }
type LKey = { t: number; s: unknown[]; o?: Handle; i?: Handle }

function handles(ease: EaseName, dims: number, spatial: boolean): { o: Handle; i: Handle } {
  const e = EASES[ease]
  const v = (n: number) => (spatial ? round(n) : Array(dims).fill(round(n)))
  return { o: { x: v(e.x1), y: v(e.y1) }, i: { x: v(e.x2), y: v(e.y2) } }
}

// Keys straight from one track's preset keys (all channels of the property share key times),
// repeated for each start; the value holds at rest between starts.
function directKeys(chs: (Driven | undefined)[], rest: number[], combine: (d: number, v: number) => number,
  fps: number, spatial: boolean): LKey[] | null {
  const live = chs.filter((c): c is Driven => !!c)
  const first = live[0]
  if (!first.keys || live.some((c) => c.track !== first.track || !c.keys)) return null
  const times = first.keys.map((k) => k.t)
  if (live.some((c) => c.keys!.length !== times.length || c.keys!.some((k, n) => k.t !== times[n]))) return null
  if (spatial && live.some((c) => c.keys!.some((k, n) => (k.ease ?? 'linear') !== (first.keys![n].ease ?? 'linear')))) return null
  const keys: LKey[] = []
  const push = (frame: number, s: number[], eases: EaseName[]) => {
    if (keys.length && frame <= keys[keys.length - 1].t) return
    if (spatial) keys.push({ t: frame, s, ...handles(eases[0], 1, true) })
    else {
      const es = eases.map((e) => EASES[e])
      keys.push({ t: frame, s, o: { x: es.map((e) => round(e.x1)), y: es.map((e) => round(e.y1)) },
        i: { x: es.map((e) => round(e.x2)), y: es.map((e) => round(e.y2)) } })
    }
  }
  for (const at of first.starts!) {
    if (!keys.length && Math.round(at * fps) > 0) push(0, rest.map(round), rest.map(() => 'linear'))
    times.forEach((t, n) => {
      const s = rest.map((r, d) => round(chs[d] ? combine(d, chs[d]!.keys![n].v) : r))
      const ease = (d: number) => chs[d]?.keys![n].ease ?? first.keys![n].ease ?? 'linear'
      push(Math.round((at + t) * fps), s, spatial ? [ease(chs.indexOf(first))] : rest.map((_, d) => ease(d)))
    })
  }
  const last = keys[keys.length - 1]
  delete last.o; delete last.i
  return keys
}

// Every frame sampled, then thinned: a key is dropped when linear interpolation stays within 0.05.
function bakedKeys(sample: (frame: number) => number[], op: number, spatial: boolean): LKey[] {
  const vals = Array.from({ length: op + 1 }, (_, f) => sample(f))
  const keep = new Set([0, op])
  const split = (a: number, b: number) => {
    let worst = -1, at = -1
    for (let f = a + 1; f < b; f++) {
      const x = (f - a) / (b - a)
      const err = Math.max(...vals[f].map((v, d) => Math.abs(v - (vals[a][d] + (vals[b][d] - vals[a][d]) * x))))
      if (err > worst) { worst = err; at = f }
    }
    if (worst > 0.05) { keep.add(at); split(a, at); split(at, b) }
  }
  split(0, op)
  const frames = [...keep].sort((a, b) => a - b)
  return frames.map((f, n) => ({
    t: f, s: vals[f].map(round), ...(n < frames.length - 1 ? handles('linear', vals[f].length, spatial) : {}),
  }))
}

// ---------- perspective turn (yaw / pitch → path morph) ----------

interface TurnKey { frame: number; ease: EaseName }

// Key frames of the turn: the preset keys of each start, else every 2nd frame.
function turnKeys(live: Driven[], fps: number, op: number): TurnKey[] {
  const byFrame = new Map<number, EaseName>()
  if (live.every((c) => c.keys && c.starts)) {
    for (const c of live) for (const at of c.starts!) for (const k of c.keys!) {
      const f = Math.round((at + k.t) * fps)
      if (f >= 0 && f <= op && !byFrame.has(f)) byFrame.set(f, k.ease ?? 'linear')
    }
  } else for (let f = 0; f <= op; f += 2) byFrame.set(f, 'linear')
  if (!byFrame.has(0)) byFrame.set(0, 'linear')
  return [...byFrame].sort((a, b) => a[0] - b[0]).map(([frame, ease]) => ({ frame, ease }))
}

function project(p: Vec, z: number, yaw: number, pitch: number, c: Vec, focal: number): Vec {
  const X = p[0] - c[0], Y = p[1] - c[1]
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch)
  const X1 = X * cy + z * sy, Z1 = -X * sy + z * cy
  const Y1 = Y * cp - Z1 * sp, Z2 = Y * sp + Z1 * cp
  const k = (focal - z) / (focal - Z2) // 1 at rest: depth alone never rescales the drawing
  return [c[0] + X1 * k, c[1] + Y1 * k]
}

// Replaces every path inside the part by a morph through the turn's key frames. Paths keep their
// vertex count; rectangles and ellipses become paths first. Depth comes from the nearest group
// with a rig `z`. Coordinates: part-local (the part's own transform excluded).
type Projector = (frame: number, local: Vec) => Vec

function morphPart(found: Found, rig: Record<string, RigEntry>, keys: TurnKey[], angleAt: (frame: number) => [number, number], op: number): Projector {
  const entry = rigFor(rig, found.group.nm)
  const own = trMatrix(found.tr)
  const center = apply(invert(mul(found.parent, own)), boxPoint(found, entry.turnCenter ?? 'center'))
  const focal = entry.focal ?? 900
  const angles = keys.map((k) => angleAt(k.frame).map((a) => (a * Math.PI) / 180) as [number, number])
  // zones: a group with rig zones sets them for everything inside, in that group's own coordinates
  type ZoneCtx = { zones: Zone[]; toZone: Mat } | null
  const walk = (items: Item[], m: Mat, z: number, zc: ZoneCtx = null) => {
    items.forEach((it, n) => {
      if (it.ty === 'gr') {
        const tr = trOf(it)
        const local = mul(m, trMatrix(tr))
        const zones = rigFor(rig, it.nm).zones
        walk(it.it ?? [], local, rigFor(rig, it.nm).z ?? z, zones?.length ? { zones, toZone: invert(local) } : zc)
        const facing = it._facing as number | undefined
        if (facing !== undefined && tr) {
          // an end face pointing along ±x: visible while its normal points towards the viewer
          tr.o = { a: 1, k: bakedKeys((f) => {
            const [yaw, pitch] = angleAt(f).map((a) => (a * Math.PI) / 180)
            return [-facing * Math.sin(yaw) * Math.cos(pitch) > 0.02 ? 100 : 0]
          }, op, false) }
          delete it._facing
        }
        return
      }
      const path = staticPath(it)
      if (!path) return
      const inv = invert(m)
      const zs = (it._z as number[] | undefined) ?? (zc ? path.v.map((v) => zoned(zc.zones, apply(zc.toZone, apply(m, v)), z, 0)[0]) : undefined)
      const zAt = (v: Vec, j: number) => (zs && j >= 0 ? zs[j] : zc ? zoned(zc.zones, apply(zc.toZone, apply(m, v)), z, 0)[0] : z)
      const frames = angles.map(([yaw, pitch]) => {
        const pt = (v: Vec, j = -1) => apply(inv, project(apply(m, v), zAt(v, j), yaw, pitch, center, focal))
        const v = path.v.map((p, j) => pt(p, j))
        const handle = (h: Vec[]) => path.v.map((p, j) => {
          const q = pt([p[0] + h[j][0], p[1] + h[j][1]], j)
          return [round2(q[0] - v[j][0]), round2(q[1] - v[j][1])] as Vec
        })
        return { c: path.c, v: v.map(([x, y]) => [round2(x), round2(y)] as Vec), i: handle(path.i), o: handle(path.o) }
      })
      const k: LKey[] = keys.map((key, j) => ({
        t: key.frame, s: [frames[j]],
        ...(j < keys.length - 1 ? { o: { x: round(EASES[key.ease].x1), y: round(EASES[key.ease].y1) }, i: { x: round(EASES[key.ease].x2), y: round(EASES[key.ease].y2) } } : {}),
      }))
      items[n] = { ty: 'sh', nm: it.nm, d: (it.d as number) ?? 1, ks: { a: 1, k } }
    })
  }
  // children of the part are in its local space: start from the identity
  walk(found.group.it ?? [], ID, entry.z ?? 0, entry.zones?.length ? { zones: entry.zones, toZone: ID } : null)
  return (frame, local) => {
    const [yaw, pitch] = angleAt(frame).map((a) => (a * Math.PI) / 180)
    return project(local, entry.z ?? 0, yaw, pitch, center, focal)
  }
}

// ---------- depth (side faces) ----------

const hexColor = (hex: string): number[] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) throw new Error(`depth: цвет «${hex}» — ожидается #rrggbb`)
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]
}

// Bezier path → polygon, then Douglas–Peucker.
function polygonOf(path: Path, m: Mat, tolerance: number): Vec[] {
  const pts: Vec[] = []
  const n = path.v.length, segs = path.c ? n : n - 1
  for (let j = 0; j < segs; j++) {
    const p0 = path.v[j], p3 = path.v[(j + 1) % n]
    const p1: Vec = [p0[0] + path.o[j][0], p0[1] + path.o[j][1]], p2: Vec = [p3[0] + path.i[(j + 1) % n][0], p3[1] + path.i[(j + 1) % n][1]]
    const curved = path.o[j][0] || path.o[j][1] || path.i[(j + 1) % n][0] || path.i[(j + 1) % n][1]
    const steps = curved ? 8 : 1
    for (let k = 0; k < steps; k++) {
      const t = k / steps, u = 1 - t
      pts.push(apply(m, [u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
        u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]]))
    }
  }
  if (!path.c) pts.push(apply(m, path.v[n - 1]))
  const keep = new Array(pts.length).fill(false)
  keep[0] = keep[pts.length - 1] = true
  const dp = (a: number, b: number) => {
    let worst = -1, at = -1
    const [ax, ay] = pts[a], [bx, by] = pts[b], len = Math.hypot(bx - ax, by - ay) || 1
    for (let k = a + 1; k < b; k++) {
      const d = Math.abs((bx - ax) * (ay - pts[k][1]) - (ax - pts[k][0]) * (by - ay)) / len
      if (d > worst) { worst = d; at = k }
    }
    if (worst > tolerance) { keep[at] = true; dp(a, at); dp(at, b) }
  }
  // a closed outline often ends where it starts: split it at the point farthest from the start
  let far = 0
  pts.forEach((p, k) => { if (Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) > Math.hypot(pts[far][0] - pts[0][0], pts[far][1] - pts[0][1])) far = k })
  keep[far] = true
  if (far > 0) dp(0, far)
  if (far < pts.length - 1) dp(far, pts.length - 1)
  return pts.filter((_, k) => keep[k])
}

// Adds the side-face copies to the part (under its own drawing) and returns their depths for the turn.
function addDepth(found: Found, spec: DepthSpec, zFront: number, groupsByName: Map<string, Found[]>, zones?: Zone[]): Record<string, RigEntry> {
  const name = found.group.nm!
  const tol = spec.tolerance ?? 0.75, layers = Math.max(1, Math.round(spec.layers ?? 3)), outline = spec.outline ?? 6
  // filled leaf groups of the part, in part-local coordinates
  const shapes: { polys: Vec[][]; rule: number; area: number }[] = []
  const walk = (items: Item[], m: Mat) => {
    const fill = items.find((i) => i.ty === 'fl' || i.ty === 'gf')
    const paths = items.map(staticPath).filter((p): p is Path => !!p)
    if (fill && paths.length) {
      const polys = paths.map((p) => polygonOf(p, m, tol)).filter((p) => p.length >= 3)
      const xs = polys.flat().map((p) => p[0]), ys = polys.flat().map((p) => p[1])
      if (polys.length) shapes.push({ polys, rule: Number(fill.r ?? 1), area: (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) })
    }
    for (const it of items) if (it.ty === 'gr') walk(it.it ?? [], mul(m, trMatrix(trOf(it))))
  }
  walk(found.group.it ?? [], ID)
  if (!shapes.length) throw new Error(`depth: в части «${name}» нет залитых фигур`)
  const biggest = Math.max(...shapes.map((s) => s.area))
  // a shape lying entirely inside a bigger kept one adds nothing to the silhouette (highlights, the
  // ejection port, inner stripes): leave it out, the file stays small
  const inside = (p: Vec, polys: Vec[][]) => polys.reduce((odd, poly) => {
    let c = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
      if ((poly[i][1] > p[1]) !== (poly[j][1] > p[1]) && p[0] < poly[i][0] + ((p[1] - poly[i][1]) * (poly[j][0] - poly[i][0])) / (poly[j][1] - poly[i][1])) c = !c
    return c ? !odd : odd
  }, false)
  const kept: typeof shapes = []
  for (const sh of [...shapes].sort((a, b) => b.area - a.area)) {
    if (sh.area < biggest * (spec.minArea ?? 0.01)) continue
    if (kept.some((k) => sh.polys.every((poly) => poly.every((p) => inside(p, k.polys))))) continue
    kept.push(sh)
  }
  const sh = (poly: Vec[], zs?: number[]): Item => ({ ty: 'sh', d: 1, ...(zs ? { _z: zs } : {}), ks: { a: 0, k: { c: true, v: poly.map(([x, y]) => [round2(x), round2(y)]), i: poly.map(() => [0, 0]), o: poly.map(() => [0, 0]) } } })
  const tr = (o = 100): Item => ({ ty: 'tr', a: { a: 0, k: [0, 0] }, p: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: o } })
  const round = spec.profile === 'round'
  const allPts = kept.flatMap((s) => s.polys.flat())
  const y0 = Math.min(...allPts.map((p) => p[1])), y1 = Math.max(...allPts.map((p) => p[1]))
  const cy = (y0 + y1) / 2, half = spec.thickness / 2
  const depths: Record<string, RigEntry> = {}
  const groups: Item[] = []
  for (const pass of ['outline', 'fill'] as const) {
    for (let k = 0; k < layers; k++) {
      const nm = `${name}·depth·${pass}·${k}`
      // box: from the face backwards; round: across the cylinder, each copy as tall as its chord
      const dz = round ? -half + (spec.thickness * (k + 0.5)) / layers : -spec.thickness * (1 - k / layers)
      depths[nm] = { z: zFront + dz }
      const squash = round ? Math.max(0.2, Math.sqrt(Math.max(0, 1 - (dz / half) ** 2))) : 1
      const paint = (rule: number): Item => pass === 'outline'
        ? { ty: 'st', c: { a: 0, k: hexColor(spec.outlineColor ?? '#000000') }, o: { a: 0, k: 100 }, w: { a: 0, k: Math.max(1, outline - 2 * tol) }, lc: 2, lj: 2 }
        : { ty: 'fl', c: { a: 0, k: hexColor(spec.color) }, o: { a: 0, k: 100 }, r: rule }
      // with zones every vertex gets its own depth: the zone's face depth less its own thickness
      const zsOf = (poly: Vec[]) => (zones?.length && !round
        ? poly.map((p) => { const [zf, t] = zoned(zones, p, zFront, spec.thickness); return zf - t * (1 - k / layers) })
        : undefined)
      groups.push({ ty: 'gr', nm, it: [...kept.map((s) => ({ ty: 'gr', it: [...s.polys.map((p) => sh(p.map(([x, y]) => [x, cy + (y - cy) * squash] as Vec), zsOf(p))), paint(s.rule), tr()] })), tr()] })
    }
  }
  if (round && spec.cap) {
    // the end face at +x: a circle in the y–z plane, as polygons with a depth per vertex
    const x0 = Math.max(...allPts.map((p) => p[0])), r = (y1 - y0) / 2, n = 16
    const angles = Array.from({ length: n }, (_, j) => (2 * Math.PI * j) / n)
    const circle = (rad: number): [Vec[], number[]] => [angles.map((a) => [x0, cy + rad * Math.sin(a)] as Vec), angles.map((a) => zFront + rad * Math.cos(a))]
    const [face, faceZ] = circle(r), [hole, holeZ] = circle(r * 0.45)
    const cap: Item = { ty: 'gr', nm: `${name}·cap`, _facing: 1, it: [
      { ty: 'gr', it: [sh(hole, holeZ), { ty: 'fl', c: { a: 0, k: hexColor(spec.cap.hole ?? '#16171B') }, o: { a: 0, k: 100 }, r: 1 }, tr()] },
      { ty: 'gr', it: [sh(face, faceZ), { ty: 'st', c: { a: 0, k: hexColor(spec.outlineColor ?? '#000000') }, o: { a: 0, k: 100 }, w: { a: 0, k: outline }, lc: 2, lj: 2 },
        { ty: 'fl', c: { a: 0, k: hexColor(spec.cap.color ?? spec.color) }, o: { a: 0, k: 100 }, r: 1 }, tr()] },
      tr(0),
    ] }
    if (spec.cap.into) {
      // same canvas position in the target part's coordinates; depths per vertex stay absolute
      const target = matchParts(groupsByName, spec.cap.into)[0]
      const toTarget = mul(invert(mul(target.parent, trMatrix(target.tr))), mul(found.parent, trMatrix(found.tr)))
      const move = (g: Item) => (g.it ?? []).forEach((it) => {
        if (it.ty === 'gr') move(it)
        if (it.ty === 'sh') {
          const path = (it.ks as { k: Path }).k
          path.v = path.v.map((v) => apply(toTarget, v).map(round2) as Vec)
        }
      })
      move(cap)
      target.group.it = [cap, ...(target.group.it ?? [])]
    } else groups.push(cap)
  }
  // Lottie draws the first item on top: the face stays first, then the fills, the outlines last (bottom)
  const items = found.group.it ?? []
  const own = items.filter((i) => i.ty !== 'tr'), tr0 = items.filter((i) => i.ty === 'tr')
  const fills = groups.filter((g) => g.nm!.includes('·fill·')).reverse(), outlines = groups.filter((g) => g.nm!.includes('·outline·')).reverse()
  const caps = groups.filter((g) => g.nm!.endsWith('·cap')) // the end face lies over the side of the part
  found.group.it = [...caps, ...own, ...fills, ...outlines, ...tr0]
  return depths
}

// ---------- effects ----------

type Asset = { id: string; layers: Item[]; w?: number; h?: number }

// Every keyframe time inside a copied comp scaled by `k` (speed 2 → k 0.5): layer ip/op/st and keys.
function retime(layers: Item[], k: number): void {
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) { o.forEach(walk); return }
    if (!o || typeof o !== 'object') return
    const rec = o as Record<string, unknown>
    if (Array.isArray(rec.k) && (rec.k as unknown[]).length && typeof (rec.k as Record<string, unknown>[])[0]?.t === 'number')
      for (const key of rec.k as Record<string, number>[]) key.t *= k
    for (const [name, v] of Object.entries(rec)) if (name !== 'k' || typeof v === 'object') walk(v)
  }
  for (const l of layers) {
    for (const f of ['ip', 'op', 'st'] as const) if (typeof l[f] === 'number') l[f] = (l[f] as number) * k
    walk(l.ks); walk(l.shapes); walk(l.tm)
  }
}

function placeEffects(anim: Lottie, groups: Map<string, Found[]>, effects: EffectSpec[], sources: Record<string, Lottie>, fps: number, turns: Map<Tr, Projector>): void {
  const assets = (anim.assets ??= []) as Asset[]
  const copied = new Map<string, { id: string; w: number; h: number; length: number }>()
  const copy = (source: string, comp: string, speed: number) => {
    const src = sources[source]
    if (!src) throw new Error(`эффект: источник «${source}» не загружен; есть: ${Object.keys(sources).join(', ')}`)
    const srcAssets = (src.assets ?? []) as Partial<Asset>[]
    const take = (id: string): string => {
      const key = `${source}/${id}@${speed}`
      if (copied.has(key)) return copied.get(key)!.id
      const a = srcAssets.find((x) => x.id === id && x.layers)
      if (!a) throw new Error(`эффект: в «${source}» нет precomp «${id}»; есть: ${srcAssets.filter((x) => x.layers).map((x) => x.id).join(', ')}`)
      const clone = structuredClone(a) as Asset
      clone.id = `fx_${source}_${id}${speed === 1 ? '' : `_x${String(speed).replace('.', '_')}`}`
      if (speed !== 1) retime(clone.layers, 1 / speed)
      copied.set(key, { id: clone.id, w: a.w ?? src.w, h: a.h ?? src.h, length: Math.max(...clone.layers.map((l) => Number(l.op) || 0)) })
      for (const l of clone.layers) if (typeof l.refId === 'string') l.refId = take(l.refId)
      assets.push(clone)
      return clone.id
    }
    take(comp)
    return copied.get(`${source}/${comp}@${speed}`)!
  }
  let ind = Math.max(0, ...(anim.layers as Item[]).map((l) => Number(l.ind) || 0)) + 1
  const pick = <T,>(v: T | T[] | undefined, n: number, fallback: T): T => (Array.isArray(v) ? v[n % v.length] : v ?? fallback)
  for (const fx of effects) {
    const speed = fx.speed ?? 1
    if (!(speed > 0)) throw new Error('эффект: speed должен быть больше 0')
    const asset = copy(fx.source, fx.comp, speed)
    const anchor = fx.anchor
    const target = Array.isArray(anchor) ? null : matchParts(groups, anchor.part)[0]
    const where = (frame: number): Vec => (Array.isArray(anchor) ? anchor : canvasPointAt(target!, anchor.point, frame, turns))
    const heading = (frame: number): number => {
      if (!fx.aim || Array.isArray(anchor)) return 0
      const a = where(frame), b = canvasPointAt(target!, [anchor.point[0] + 10, anchor.point[1]], frame, turns)
      return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
    }
    startsOf(fx).forEach((at, n) => {
      const ip = Math.round(at * fps), skip = Math.round((fx.skip ?? 0) / speed)
      const length = fx.len !== undefined ? Math.round(fx.len * fps) : Math.round(asset.length - skip)
      const op = Math.min(ip + length, anim.op)
      const scale = pick(fx.scale, n, 100), rot = pick(fx.rotate, n, 0)
      const [stx, sty] = fx.stretch ?? [100, 100]
      // a channel sampled every frame of the instance's life, thinned like other baked keys
      const bake = (sample: (frame: number) => number[], spatial: boolean): Prop => {
        const keys = bakedKeys((f) => sample(ip + f), op - ip, spatial)
        for (const key of keys) key.t += ip
        return keys.length > 1 ? { a: 1, k: keys } : { a: 0, k: keys[0].s }
      }
      const drift = fx.drift ?? [0, 0]
      const grow = fx.grow ?? [100, 100]
      const life = (frame: number) => (op > ip ? (frame - ip) / (op - ip) : 0)
      const ease = (x: number) => easeAt(EASES.out, Math.min(1, Math.max(0, x)))
      const p0 = where(ip)
      const ks: Record<string, Prop> = {
        o: fx.fade ? bake((f) => [life(f) < 0.5 ? 100 : 100 * (1 - easeAt(EASES.in, (life(f) - 0.5) * 2))], false) : { a: 0, k: 100 },
        r: fx.follow && fx.aim ? bake((f) => [heading(f) + rot], false) : { a: 0, k: round(heading(ip) + rot) },
        p: fx.follow || fx.drift
          ? bake((f) => { const q = fx.follow ? where(f) : p0, e = ease(life(f)); return [q[0] + drift[0] * e, q[1] + drift[1] * e, 0] }, true)
          : { a: 0, k: [round(p0[0]), round(p0[1]), 0] },
        a: { a: 0, k: [...(fx.origin ?? [asset.w / 2, asset.h / 2]), 0] },
        s: fx.grow
          ? bake((f) => { const g = (grow[0] + (grow[1] - grow[0]) * ease(life(f))) / 100; return [scale * g * stx / 100, scale * g * sty / 100, 100] }, false)
          : { a: 0, k: [round(scale * stx / 100), round(scale * sty / 100), 100] },
      }
      const layer = { ddd: 0, ind: ind++, ty: 0, nm: `fx ${fx.comp}`, refId: asset.id, sr: 1, ks, ao: 0, w: asset.w, h: asset.h, ip, op, st: ip - skip, bm: 0 }
      if (fx.behind) (anim.layers as unknown[]).push(layer)
      else (anim.layers as unknown[]).unshift(layer)
    })
  }
}

// ---------- compile ----------

export function compileMotion(base: Lottie, spec: MotionSpec, sources: Record<string, Lottie> = {}): Lottie {
  const anim = structuredClone(base)
  const fps = spec.fps ?? 60, D = spec.duration, op = Math.round(D * fps)
  if (!(D > 0)) throw new Error('duration: ожидается положительное число секунд')
  const rig = spec.rig ?? {}
  const groups = findGroups(anim)
  for (const name of Object.keys(rig)) matchParts(groups, name)

  // Preset tracks first, then follow tracks (which read the preset-driven channels).
  const driven = new Map<Found, Partial<Record<Channel, Driven[]>>>()
  const add = (f: Found, c: Channel, d: Driven) => {
    const m = driven.get(f) ?? {}
    m[c] = [...(m[c] ?? []), d]
    driven.set(f, m)
  }
  const channelFn = (ds: Driven[], c: Channel) => (t: number) =>
    ds.reduce((v, d) => (MULTIPLIER[c] ? (v * d.fn(t)) / 100 : v + d.fn(t) - restOf(c)), restOf(c))

  const pivotPreset = new Map<Found, string>()
  const launches: { found: Found; track: Track; starts: number[] }[] = []
  for (const track of spec.tracks.filter((t) => t.preset !== 'follow')) {
    const parts = matchParts(groups, track.part), starts = startsOf(track)
    parts.forEach((f, k) => {
      const mine = track.each ? starts.filter((_, n) => n % parts.length === k) : starts
      if (!mine.length) return
      if (!pivotPreset.has(f)) pivotPreset.set(f, track.preset)
      for (const [c, d] of Object.entries(presetChannels(track, mine, D)) as [Channel, Driven][]) add(f, c, d)
      if (track.launch) launches.push({ found: f, track, starts: mine })
    })
  }
  const follows: [Found, Channel, Driven][] = []
  for (const track of spec.tracks.filter((t) => t.preset === 'follow')) {
    const [src] = matchParts(groups, String(track.of))
    const from = String(track.from ?? 'r') as Channel, to = String(track.to ?? from) as Channel
    if (!CHANNELS.includes(from) || !CHANNELS.includes(to)) throw new Error(`follow: каналы ${from} → ${to}; есть ${CHANNELS.join(', ')}`)
    const gain = Number(track.gain ?? 1), delay = Number(track.delay ?? 0.05)
    const srcFn = channelFn([...(driven.get(src)?.[from] ?? [])], from) // preset tracks only: no follow cycles
    const fn = (t: number) => restOf(to) + gain * (srcFn(t - delay) - restOf(from))
    for (const f of matchParts(groups, track.part)) follows.push([f, to, { fn, track }])
  }
  for (const [f, c, d] of follows) add(f, c, d)

  // Hidden parts without tracks still disappear.
  for (const [name, entry] of Object.entries(rig))
    if (entry.hidden) for (const f of matchParts(groups, name)) if (!driven.has(f)) driven.set(f, {})

  // Pivots and perspective morphs first, while every transform is still static.
  for (const [found] of driven) {
    const preset = pivotPreset.get(found)
    setPivot(found, boxPoint(found, rigFor(rig, found.group.nm).pivot ?? (preset ? PRESETS[preset].pivot : 'bottom')))
  }
  const combined = (chans: Partial<Record<Channel, Driven[]>>, c: Channel): Driven | undefined =>
    chans[c]?.length === 1 ? chans[c]![0] : chans[c] ? { fn: channelFn(chans[c]!, c), track: {} as Track } : undefined
  // Side faces: copies inserted into the parts, with their depths added to the rig the turn reads.
  const turnRig: Record<string, RigEntry> = { ...rig }
  for (const [pattern, entry] of Object.entries(rig)) {
    if (!entry.depth) continue
    for (const f of matchParts(groups, pattern)) {
      const zFront = rigFor(rig, f.group.nm).z ?? 0
      Object.assign(turnRig, addDepth(f, entry.depth, zFront, groups, rigFor(rig, f.group.nm).zones))
    }
  }
  const turns = new Map<Tr, Projector>()
  for (const [found, chans] of driven) {
    const yaw = combined(chans, 'yaw'), pitch = combined(chans, 'pitch')
    if (yaw || pitch) {
      turns.set(found.tr, morphPart(found, turnRig, turnKeys([...(chans.yaw ?? []), ...(chans.pitch ?? [])], fps, op),
        (f) => [yaw ? yaw.fn(f / fps) : 0, pitch ? pitch.fn(f / fps) : 0], op))
    }
  }

  // Launched tracks: each start's x/y motion shifted to begin at the anchor point (read from the
  // anchor part's own channels at the start frame, and its perspective turn).
  for (const { found, track, starts } of launches) {
    const { part, point } = track.launch!
    const anchor = matchParts(groups, part)[0]
    const chans = driven.get(anchor) ?? {}
    const at = (c: Channel, t: number) => combined(chans, c)?.fn(t) ?? restOf(c)
    const offsets = starts.map((s) => {
      const f = Math.round(s * fps), t = f / fps
      const a = staticVec(anchor.tr.a, [0, 0]), p = staticVec(anchor.tr.p, [0, 0]), sc = staticVec(anchor.tr.s, [100, 100]), [r] = staticVec(anchor.tr.r, [0])
      const own = matrixOf(a, [p[0] + at('x', t), p[1] + at('y', t)], [(sc[0] * at('sx', t)) / 100, (sc[1] * at('sy', t)) / 100], r + at('r', t))
      const local = turns.get(anchor.tr)?.(f, point) ?? point
      const target = apply(mul(anchor.parent, own), local)
      const rest = boxPoint(found, 'center')
      return [target[0] - rest[0], target[1] - rest[1]]
    })
    const offsetAt = (t: number, d: number) => {
      let k = 0
      starts.forEach((s, n) => { if (s <= t + 1e-9) k = n })
      return offsets[k][d]
    }
    const mine = driven.get(found) ?? {}
    for (const [c, d] of [['x', 0], ['y', 1]] as const) {
      for (const drv of mine[c] ?? []) if (drv.track === track) {
        const fn = drv.fn
        drv.fn = (t) => fn(t) + offsetAt(t, d)
        drv.keys = undefined; drv.starts = undefined
      }
      if (!mine[c]?.some((drv) => drv.track === track)) add(found, c, { fn: (t) => offsetAt(t, d), track })
    }
  }

  for (const [found, chans] of driven) {
    const entry = rigFor(rig, found.group.nm)
    const tr = found.tr
    const one = (c: Channel) => combined(chans, c)

    const prop = (cs: Channel[], rest: number[], combine: (d: number, v: number) => number, spatial: boolean): Prop | null => {
      const chs = cs.map(one)
      if (chs.every((c) => !c)) return null
      const keys = directKeys(chs, rest, combine, fps, spatial)
        ?? bakedKeys((frame) => rest.map((r, d) => (chs[d] ? combine(d, chs[d]!.fn(frame / fps)) : r)), op, spatial)
      return { a: 1, k: keys }
    }
    const p = staticVec(tr.p, [0, 0]), s = staticVec(tr.s, [100, 100]), [r] = staticVec(tr.r, [0]), [o] = staticVec(tr.o, [100])
    tr.p = prop(['x', 'y'], p, (d, v) => p[d] + v, true) ?? tr.p
    tr.s = prop(['sx', 'sy'], s, (d, v) => (s[d] * v) / 100, false) ?? tr.s
    tr.r = prop(['r'], [r], (_d, v) => r + v, false) ?? tr.r
    if (entry.hidden) {
      const show = one('show'), mult = one('o')
      tr.o = show || mult
        ? { a: 1, k: bakedKeys((f) => [(Math.max(0, Math.min(100, show ? show.fn(f / fps) : 0)) * (mult ? mult.fn(f / fps) : 100)) / 100], op, false) }
        : { a: 0, k: 0 }
    } else tr.o = prop(['o'], [o], (_d, v) => (o * v) / 100, false) ?? tr.o
  }

  anim.fr = fps
  anim.ip = 0
  anim.op = op
  for (const layer of anim.layers as Item[]) { layer.ip = 0; layer.op = op }
  if (spec.effects?.length) placeEffects(anim, groups, spec.effects, sources, fps, turns)
  return anim
}
