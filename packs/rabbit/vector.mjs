// Small SVG path reader: cubic geometry stays vector from the editable master to TGS.
// Supports the absolute M/L/C/Q/Z commands used by character.svg; rejects anything else.
export const round = (n) => Math.round(n * 100) / 100
export const add = (a, b) => a.map((x, d) => x + b[d])
export const sub = (a, b) => a.map((x, d) => x - b[d])
export const mix = (a, b, t) => a.map((x, d) => x + (b[d] - x) * t)
export const radians = (x) => x * Math.PI / 180
export function rotate(p, pivot, degrees) {
  const [x, y] = sub(p, pivot), a = radians(degrees)
  return [pivot[0] + x * Math.cos(a) - y * Math.sin(a), pivot[1] + x * Math.sin(a) + y * Math.cos(a)]
}
export function parsePath(d) {
  const ts = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)
  let n = 0, command = '', current = [0, 0]
  const out = { c: false, v: [], i: [], o: [] }
  const point = () => [Number(ts[n++]), Number(ts[n++])]
  const push = (p, c1 = current, c2 = p) => {
    if (out.v.length) out.o[out.v.length - 1] = sub(c1, current)
    out.v.push(p); out.i.push(sub(c2, p)); out.o.push([0, 0]); current = p
  }
  while (n < ts.length) {
    if (/^[a-zA-Z]$/.test(ts[n])) command = ts[n++]
    if (command === 'M') { push(point()); command = 'L' }
    else if (command === 'L') push(point())
    else if (command === 'C') { const c1 = point(), c2 = point(); push(point(), c1, c2) }
    else if (command === 'Q') { const c = point(), p = point(); push(p, mix(current, c, 2 / 3), mix(p, c, 2 / 3)) }
    else if (command === 'Z') { out.c = true; command = ''; break }
    else throw new Error(`Unsupported SVG command ${command}`)
  }
  if (out.v.length > 1 && Math.hypot(...sub(out.v[0], out.v.at(-1))) < 0.001) {
    out.i[0] = out.i.at(-1)
    for (const k of ['v', 'i', 'o']) out[k].pop()
  }
  if (out.v.some((p) => p.some((v) => !Number.isFinite(v)))) throw new Error(`Bad SVG path ${d}`)
  return out
}
export function mapPath(p, fn) {
  const v = p.v.map(fn)
  const tangents = (k) => p[k].map((h, j) => sub(fn(add(p.v[j], h)), v[j]))
  return { c: p.c, v: v.map((x) => x.map(round)), i: tangents('i').map((x) => x.map(round)), o: tangents('o').map((x) => x.map(round)) }
}
export function blendPath(a, b, t) {
  if (a.v.length !== b.v.length) throw new Error('Morph topology mismatch')
  return { c: a.c, ...Object.fromEntries(['v', 'i', 'o'].map((k) => [k, a[k].map((p, j) => mix(p, b[k][j], t))])) }
}
const attributes = (s) => Object.fromEntries([...s.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]))
export function readSvg(svg) {
  const stack = [{ id: '', fill: 'none' }], groups = [], paths = []
  for (const m of svg.matchAll(/<g\b[^>]*>|<\/g>|<path\b[^>]*\/>/g)) {
    if (m[0] === '</g>') { stack.pop(); continue }
    const a = attributes(m[0]), inherited = stack.at(-1)
    if (m[0].startsWith('<g')) {
      const group = { ...inherited, ...a, parent: a['data-parent'] ?? inherited.id, pivot: (a['data-pivot'] ?? '0 0').split(' ').map(Number) }
      stack.push(group); groups.push(group)
    } else {
      const p = { ...inherited, ...a, group: inherited.id, ancestors: stack.map((g) => g.id), path: parsePath(a.d) }
      paths.push(p)
    }
  }
  return { groups, paths }
}
export function svgPath(p) {
  const f = (p) => p.map((x) => +x.toFixed(3)).join(' ')
  let d = `M${f(p.v[0])}`
  for (let j = 1; j < p.v.length; j++) d += `C${f(add(p.v[j - 1], p.o[j - 1]))} ${f(add(p.v[j], p.i[j]))} ${f(p.v[j])}`
  if (p.c) {
    const j = p.v.length - 1
    d += `C${f(add(p.v[j], p.o[j]))} ${f(add(p.v[0], p.i[0]))} ${f(p.v[0])}Z`
  }
  return d
}
