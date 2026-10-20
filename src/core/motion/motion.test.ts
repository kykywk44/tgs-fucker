import { describe, expect, it } from 'vitest'
import blobFixture from '../__fixtures__/blob.json'
import { telegramChecks } from '../checks'
import { writeTgs, type Lottie } from '../tgs'
import { compileMotion, type MotionSpec } from './compile'
import { EASES, easeAt, valueAt } from './easing'

type Prop = { a?: number; k: unknown }
import { PRESETS } from './presets'

const blob = blobFixture as unknown as Lottie

type Item = { ty?: string; nm?: string; it?: Item[]; [k: string]: unknown }
function group(anim: Lottie, name: string): Item {
  let hit: Item | undefined
  const walk = (items: Item[]) => items.forEach((it) => {
    if (it.ty === 'gr' && it.nm === name) hit = it
    walk(it.it ?? [])
  })
  walk(((anim.layers[0] as Item).shapes as Item[]))
  if (!hit) throw new Error(name)
  return hit
}
const tr = (anim: Lottie, name: string) => group(anim, name).it!.find((i) => i.ty === 'tr') as Record<string, { a?: number; k: unknown }>

// Canvas position of a local point of the group at `frame` (rotation/scale included, nesting ignored).
function canvasAt(anim: Lottie, name: string, frame: number, [x, y]: [number, number]): [number, number] {
  const t = tr(anim, name)
  const [ax, ay] = valueAt(t.a, frame), [px, py] = valueAt(t.p, frame), [sx, sy] = valueAt(t.s, frame)
  const r = (valueAt(t.r, frame)[0] * Math.PI) / 180
  const lx = ((x - ax) * sx) / 100, ly = ((y - ay) * sy) / 100
  return [px + lx * Math.cos(r) - ly * Math.sin(r), py + lx * Math.sin(r) + ly * Math.cos(r)]
}

describe('easing', () => {
  it('runs from 0 to 1 and overshoots for back curves', () => {
    for (const e of Object.values(EASES)) {
      expect(easeAt(e, 0)).toBe(0)
      expect(easeAt(e, 1)).toBe(1)
    }
    expect(easeAt(EASES.linear, 0.3)).toBeCloseTo(0.3, 5)
    expect(Math.max(...[0.4, 0.5, 0.6, 0.7].map((x) => easeAt(EASES.backOut, x)))).toBeGreaterThan(1)
  })
})

describe('compileMotion', () => {
  const spec: MotionSpec = {
    duration: 2,
    tracks: [
      { part: 'body', preset: 'bounce', height: 40, at: 0.2 },
      { part: 'eye_*', preset: 'blink', at: 1.3 },
      { part: 'shadow', preset: 'follow', of: 'body', from: 'y', to: 'sx', gain: 0.5, delay: 0 },
    ],
  }

  it('does not mutate the input and sets the timeline', () => {
    const before = JSON.stringify(blob)
    const out = compileMotion(blob, spec)
    expect(JSON.stringify(blob)).toBe(before)
    expect([out.fr, out.ip, out.op]).toEqual([60, 0, 120])
    expect((out.layers[0] as { op: number }).op).toBe(120)
  })

  it('keeps the drawing in place at rest after moving anchors to pivots', () => {
    const out = compileMotion(blob, spec)
    for (const name of ['body', 'eye_L', 'eye_R', 'shadow']) {
      for (const pt of [[0, 0], [256, 300], [100, 450]] as [number, number][]) {
        const a = canvasAt(blob, name, 0, pt), b = canvasAt(out, name, 0, pt)
        expect(b[0]).toBeCloseTo(a[0], 2)
        expect(b[1]).toBeCloseTo(a[1], 2)
      }
    }
  })

  it('uses the bottom of the body as the bounce pivot and jumps by the height', () => {
    const out = compileMotion(blob, spec)
    const a = valueAt(tr(out, 'body').a, 0)
    expect(a[1]).toBeCloseTo(430, 0) // body path bottom
    const ys = Array.from({ length: 121 }, (_, f) => valueAt(tr(out, 'body').p, f)[1])
    expect(Math.min(...ys) - ys[0]).toBeCloseTo(-40, 0)
  })

  it('loops seamlessly: frame 0 equals the last frame on every animated property', () => {
    const out = compileMotion(blob, { duration: 2, tracks: Object.keys(PRESETS).map((preset) => ({ part: 'body', preset, at: 0.9, ...(preset === 'kick' ? { r: 10, x: -5 } : {}) })) })
    for (const key of ['p', 's', 'r', 'o'] as const) {
      const prop = tr(out, 'body')[key]
      const first = valueAt(prop, 0), last = valueAt(prop, out.op)
      const wrap = key === 'r' ? (v: number) => ((v % 360) + 360) % 360 : (v: number) => v
      first.forEach((v, d) => expect(wrap(last[d])).toBeCloseTo(wrap(v), 2))
    }
  })

  it('writes preset keys directly (with eases) when one track drives a property', () => {
    const out = compileMotion(blob, spec)
    const keys = tr(out, 'body').p.k as { t: number; o?: { x: unknown } }[]
    expect(keys.length).toBeLessThan(10)
    expect(keys[0].t).toBe(0)
    expect(typeof keys[1].o?.x).toBe('number') // position eases are scalar
  })

  it('makes the shadow follow the jump', () => {
    const out = compileMotion(blob, spec)
    const sx = (f: number) => valueAt(tr(out, 'shadow').s, f)[0]
    const y = (f: number) => valueAt(tr(out, 'body').p, f)[1] - valueAt(tr(out, 'body').p, 0)[1]
    const apex = Array.from({ length: 121 }, (_, f) => f).reduce((m, f) => (y(f) < y(m) ? f : m), 0)
    expect(sx(apex)).toBeCloseTo(100 - 0.5 * 40, 0)
    expect(sx(0)).toBeCloseTo(100, 1)
  })

  it('passes the Telegram checks', async () => {
    const out = compileMotion(blob, spec)
    const bytes = await writeTgs(out)
    expect(telegramChecks(out, bytes.length).every((c) => c.ok)).toBe(true)
  })

  it('names missing parts and presets', () => {
    expect(() => compileMotion(blob, { duration: 1, tracks: [{ part: 'tail', preset: 'sway' }] })).toThrow(/tail.*body/)
    expect(() => compileMotion(blob, { duration: 1, tracks: [{ part: 'body', preset: 'moonwalk' }] })).toThrow(/moonwalk.*bounce/)
  })

  it('repeats a track for every start in `at`', () => {
    const out = compileMotion(blob, { duration: 2, tracks: [{ part: 'body', preset: 'kick', r: -20, at: [0.2, 0.8, 1.4] }] })
    const r = (f: number) => valueAt(tr(out, 'body').r, f)[0]
    for (const at of [0.2, 0.8, 1.4]) {
      const f0 = Math.round(at * 60)
      expect(Math.min(r(f0 + 1), r(f0 + 2))).toBeCloseTo(-20, 0)
    }
    expect(r(30)).toBeCloseTo(0, 3)
    expect(r(120)).toBeCloseTo(0, 3)
  })

  it('keeps hidden parts invisible except where `show` lights them', () => {
    const out = compileMotion(blob, {
      duration: 1, rig: { eye_L: { hidden: true }, eye_R: { hidden: true } },
      tracks: [{ part: 'eye_L', preset: 'kick', show: 100, attack: 1 / 60, release: 1 / 60, at: 0.5 }],
    })
    const o = (name: string, f: number) => valueAt(tr(out, name).o, f)[0]
    expect(o('eye_L', 29)).toBeCloseTo(0, 3)
    expect(o('eye_L', 31)).toBeCloseTo(100, 3)
    expect(o('eye_L', 33)).toBeCloseTo(0, 3)
    expect(o('eye_R', 31)).toBe(0)
  })

  it('gives each start to the next part with `each`', () => {
    const out = compileMotion(blob, {
      duration: 1, rig: { 'eye_*': { hidden: true } },
      tracks: [{ part: 'eye_*', preset: 'eject', each: true, at: [0.1, 0.5], len: 0.3 }],
    })
    const o = (name: string, f: number) => valueAt(tr(out, name).o, f)[0]
    expect(o('eye_L', 10)).toBe(100)
    expect(o('eye_L', 34)).toBe(0)
    expect(o('eye_R', 10)).toBe(0)
    expect(o('eye_R', 34)).toBe(100)
  })

  it('cycles list parameters per start', () => {
    const out = compileMotion(blob, { duration: 1,
      tracks: [{ part: 'body', preset: 'kick', r: [-10, -20], attack: 1 / 60, hold: 1 / 60, release: 0.1, at: [0.1, 0.5, 0.8] }] })
    const r = (f: number) => valueAt(tr(out, 'body').r, f)[0]
    expect(r(7)).toBeCloseTo(-10, 3)
    expect(r(31)).toBeCloseTo(-20, 3)
    expect(r(49)).toBeCloseTo(-10, 3)
  })

  it('keeps the start order for list parameters under `each`', () => {
    const out = compileMotion(blob, { duration: 1, rig: { 'eye_*': { hidden: true } },
      tracks: [{ part: 'eye_*', preset: 'eject', each: true, vx: [100, 200, 300], vy: 0, gravity: 0, spin: 0, len: 0.2, at: [0.1, 0.4, 0.7] }] })
    const dx = (name: string, f0: number) => valueAt(tr(out, name).p, f0 + 6)[0] - valueAt(tr(out, name).p, f0)[0]
    expect(dx('eye_L', 6)).toBeCloseTo(10, 0) // start 0 → 100 px/s
    expect(dx('eye_R', 24)).toBeCloseTo(20, 0) // start 1 → 200 px/s
    expect(dx('eye_L', 42)).toBeCloseTo(30, 0) // start 2 → 300 px/s
  })

  it('tumbles a shell end over end', () => {
    const keys = PRESETS.eject.curves({ tumble: 2, tumbleMin: 40 }, 0.4).sx!
    expect(keys.map((k) => k.v)).toEqual([100, 40, 100, 40, 100])
    expect(keys[4].t).toBeCloseTo(0.4, 6)
  })

  it('throws a shell along a parabola', () => {
    const out = compileMotion(blob, { duration: 1, rig: { eye_L: { hidden: true } },
      tracks: [{ part: 'eye_L', preset: 'eject', vx: 300, vy: -600, gravity: 2400, at: 0 }] })
    const p = (f: number) => valueAt(tr(out, 'eye_L').p, f)
    const p0 = p(0), apex = p(15) // apex at 600 / 2400 = 0.25 s
    expect(apex[0] - p0[0]).toBeCloseTo(75, 0)
    expect(apex[1] - p0[1]).toBeCloseTo(-75, 0)
  })

  it('turns a part in perspective by morphing its paths', () => {
    const out = compileMotion(blob, { duration: 1, tracks: [{ part: 'body', preset: 'kick', yaw: 40, attack: 0.2, hold: 0.1, release: 0.2, at: 0.1 }] })
    const body = group(out, 'body')
    const shapes: Item[] = []
    const walk = (items: Item[]) => items.forEach((it) => (it.ty === 'gr' ? walk(it.it ?? []) : it.ty === 'sh' && shapes.push(it)))
    walk(body.it!)
    expect(shapes.length).toBeGreaterThan(3) // the eyes' ellipses became paths too
    const width = (frame: number) => {
      const xs = shapes.flatMap((sh) => {
        const keys = (sh.ks as { a: number; k: { t: number; s: { v: number[][] }[] }[] }).k
        const key = [...keys].reverse().find((k) => k.t <= frame)!
        return key.s[0].v.map((v) => v[0])
      })
      return Math.max(...xs) - Math.min(...xs)
    }
    for (const sh of shapes) {
      const keys = (sh.ks as { a: number; k: { s: { v: unknown[] }[] }[] }).k
      expect(new Set(keys.map((k) => k.s[0].v.length)).size).toBe(1)
    }
    expect(width(0)).toBeCloseTo(248, 0)
    expect(width(20)).toBeLessThan(width(0) * 0.85)
  })

  it('drops effects from another sticker at a part point', () => {
    const fx: Lottie = { v: '5.5.2', fr: 60, ip: 0, op: 30, w: 200, h: 200, layers: [],
      assets: [{ id: 'boom', layers: [{ ty: 4, ind: 1, ip: 0, op: 24, st: 0, ks: {}, shapes: [] }] }] }
    const out = compileMotion(blob, {
      duration: 1, tracks: [],
      effects: [{ source: 'ref', comp: 'boom', at: [0.2, 0.6], anchor: { part: 'body', point: [256, 140] }, scale: [30, 40], skip: 4 }],
    }, { ref: fx })
    const layers = out.layers as { ty: number; refId?: string; ip: number; op: number; st: number; ks: { p: { k: number[] }; s: { k: number[] } } }[]
    const fxLayers = layers.filter((l) => l.ty === 0)
    expect(fxLayers).toHaveLength(2)
    expect((out.assets as { id: string }[]).map((a) => a.id)).toEqual(['fx_ref_boom'])
    const first = fxLayers.find((l) => l.ip === 12)!
    expect([first.op, first.st]).toEqual([32, 8])
    expect(first.ks.p.k.slice(0, 2)).toEqual([256, 140])
    expect(first.ks.s.k[0]).toBe(30)
    expect(() => compileMotion(blob, { duration: 1, tracks: [], effects: [{ source: 'x', comp: 'boom', at: 0, anchor: [0, 0] }] }, {})).toThrow(/источник «x»/)
  })

  it('extrudes a part so a turn shows side faces, hidden at rest', () => {
    const spec = (yaw: number): MotionSpec => ({
      duration: 1, rig: { body: { depth: { thickness: 60, color: '#884400', layers: 3 } } },
      tracks: [{ part: 'body', preset: 'kick', yaw, attack: 0.2, hold: 0.1, release: 0.2, at: 0.1 }],
    })
    const out = compileMotion(blob, spec(35))
    const body = group(out, 'body')
    const names = body.it!.filter((i) => i.ty === 'gr').map((i) => i.nm ?? '')
    const depth = names.filter((n) => n.includes('·depth·'))
    expect(depth).toHaveLength(6)
    // under the face: after every own group, outlines last (Lottie draws the first item on top)
    expect(names.slice(-6).map((n) => n.split('·')[2])).toEqual(['fill', 'fill', 'fill', 'outline', 'outline', 'outline'])
    const extent = (g: Item, frame: number) => {
      const xs: number[] = []
      const walk = (items: Item[]) => items.forEach((it) => {
        if (it.ty === 'gr') walk(it.it ?? [])
        else if (it.ty === 'sh') {
          const keys = (it.ks as { k: { t: number; s: { v: number[][] }[] }[] }).k
          xs.push(...[...keys].reverse().find((k) => k.t <= frame)!.s[0].v.map((v) => v[0]))
        }
      })
      walk(g.it!)
      return [Math.min(...xs), Math.max(...xs)]
    }
    const back = body.it!.find((i) => i.nm === 'body·depth·outline·0')!
    const face = body.it!.find((i) => i.ty === 'gr' && !(i.nm ?? '').includes('·depth·') && (i.it ?? []).some((x) => x.ty === 'fl'))!
    const [b0, b1] = extent(back, 0), [f0, f1] = extent(face, 0)
    expect(b0).toBeCloseTo(f0, 1) // at rest the copies sit exactly behind the face
    expect(b1).toBeCloseTo(f1, 1)
    const [t0] = extent(back, 20), [g0] = extent(face, 20)
    expect(t0).toBeLessThan(g0 - 5) // turned: the far side shows past the face
  })

  it('speeds up copied effects and keeps them at a moving part', () => {
    const fx: Lottie = { v: '5.5.2', fr: 60, ip: 0, op: 40, w: 100, h: 100, layers: [],
      assets: [{ id: 'spark', layers: [{ ty: 4, ind: 1, ip: 0, op: 40, st: 0, ks: { o: { a: 1, k: [{ t: 0, s: [100] }, { t: 40, s: [0] }] } }, shapes: [] }] }] }
    const out = compileMotion(blob, {
      duration: 1,
      tracks: [{ part: 'body', preset: 'kick', r: -30, attack: 0.1, release: 0.2, at: 0.2 }],
      effects: [{ source: 'ref', comp: 'spark', at: 0.2, anchor: { part: 'body', point: [380, 200] }, speed: 2, aim: true, follow: true }],
    }, { ref: fx })
    const asset = (out.assets as { id: string; layers: { op: number; ks: { o: { k: { t: number }[] } } }[] }[])[0]
    expect(asset.id).toBe('fx_ref_spark_x2')
    expect(asset.layers[0].op).toBe(20)
    expect(asset.layers[0].ks.o.k[1].t).toBe(20)
    const layer = (out.layers as { ty: number; ip: number; op: number; ks: { p: Prop; r: Prop } }[]).find((l) => l.ty === 0)!
    expect([layer.ip, layer.op]).toEqual([12, 32])
    expect(layer.ks.p.a).toBe(1) // follows the kick
    expect(valueAt(layer.ks.r, 18)[0]).toBeCloseTo(-30, 0) // and turns with it
  })

  it('extrudes a round part as a cylinder with an end face that shows only towards the viewer', () => {
    const out = compileMotion(blob, {
      duration: 2, rig: { body: { depth: { thickness: 40, color: '#555555', profile: 'round', layers: 4, cap: {} } } },
      tracks: [
        { part: 'body', preset: 'kick', yaw: -30, attack: 0.2, hold: 0.2, release: 0.2, at: 0.1 },
        { part: 'body', preset: 'kick', yaw: 30, attack: 0.2, hold: 0.2, release: 0.2, at: 1.1 },
      ],
    })
    const body = group(out, 'body')
    const cap = body.it!.find((i) => i.nm === 'body·cap')!
    expect(body.it![0]).toBe(cap) // over the side of the part
    const o = (f: number) => valueAt((cap.it!.find((i) => i.ty === 'tr') as unknown as { o: Prop }).o, f)[0]
    expect(o(0)).toBe(0) // edge-on at rest
    expect(o(24)).toBe(100) // +x end turned towards the viewer
    expect(o(84)).toBe(0) // turned away
  })

  it('launches a thrown part from a point of a moving part', () => {
    const out = compileMotion(blob, {
      duration: 1, rig: { eye_L: { hidden: true } },
      tracks: [
        { part: 'body', preset: 'kick', x: 40, attack: 0.1, hold: 0.5, release: 0.1, at: 0 },
        { part: 'eye_L', preset: 'eject', launch: { part: 'body', point: [300, 200] }, vx: 0, vy: 0, gravity: 0, spin: 0, len: 0.3, at: 0.3 },
      ],
    })
    const [x, y] = valueAt(tr(out, 'eye_L').p, 18) // the eye's pivot (its centre) at the launch frame
    expect(x).toBeCloseTo(340, 0) // body point 300 + the body's kick of 40
    expect(y).toBeCloseTo(200, 0)
  })

  it('can draw the end face in another part (over the slide)', () => {
    const out = compileMotion(blob, {
      duration: 1, rig: { eye_R: { depth: { thickness: 20, color: '#555555', profile: 'round', cap: { into: 'shadow' } } } },
      tracks: [{ part: 'body', preset: 'kick', yaw: -30, attack: 0.2, hold: 0.2, release: 0.2, at: 0.1 }],
    })
    expect(group(out, 'shadow').it![0].nm).toBe('eye_R·cap')
    expect(group(out, 'eye_R').it!.some((i) => i.nm === 'eye_R·cap')).toBe(false)
  })

  it('sets a zone of a part back to its own depth and thickness', () => {
    // the body's lower half is a zone set back 40 units: on a turn it moves less than the face above
    const spec = (zones?: { box: [number, number, number, number]; z: number; thickness: number; feather: number }[]): MotionSpec => ({
      duration: 1, rig: { body: { depth: { thickness: 30, color: '#555555', layers: 2 }, ...(zones ? { zones } : {}) } },
      tracks: [{ part: 'body', preset: 'kick', yaw: -30, attack: 0.2, hold: 0.2, release: 0.2, at: 0.1 }],
    })
    const zoned = compileMotion(blob, spec([{ box: [0, 330, 512, 512], z: -40, thickness: 10, feather: 4 }]))
    const plain = compileMotion(blob, spec())
    const lowest = (anim: Lottie, frame: number) => {
      // the x of the face vertex nearest the bottom of the body (y 430)
      const face = group(anim, 'body').it!.find((i) => i.ty === 'gr' && !(i.nm ?? '').includes('·') && (i.it ?? []).some((x) => x.ty === 'fl'))!
      const sh = face.it!.find((i) => i.ty === 'sh')!
      const keys = (sh.ks as { k: { t: number; s: { v: number[][] }[] }[] }).k
      const v = [...keys].reverse().find((k) => k.t <= frame)!.s[0].v
      return v.reduce((best, p) => (p[1] > best[1] ? p : best))
    }
    expect(lowest(zoned, 0)).toEqual(lowest(plain, 0)) // at rest nothing moves
    expect(lowest(zoned, 20)[0]).not.toBeCloseTo(lowest(plain, 20)[0], 0) // turned: the set-back zone moves differently
  })
})
