// №221: четыре силуэта 👤, исходные движения и белые рты с исходными ключами.
// node packs/blue/family/build.mjs
// recipe.json удаляет детали и перекрашивает; здесь заменяются контуры голов и градиенты одежды.
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Canvas, ROOT, encodePng, engine, load } from '../../../scripts/lib/sheets.mjs'

const dir = import.meta.dirname
const { readTgs, writeTgs, sizeKb } = await load('src/core/tgs.ts')
const { telegramChecks } = await load('src/core/checks.ts')
const read = async path => readTgs(new Uint8Array(await readFile(join(ROOT, path))))
const cfg = JSON.parse(await readFile(join(dir, 'heads.json'), 'utf8'))
const style = JSON.parse(await readFile(join(ROOT, 'packs/blue/style.json'), 'utf8'))
const recipe = JSON.parse(await readFile(join(dir, 'recipe.json'), 'utf8'))
execFileSync(process.execPath, [join(ROOT, 'scripts/restyle.mjs'), 'blue/family'], { stdio: 'ignore' })
const source = await read('packs/blue/family/source.tgs')
const anim = await read('exports/blue/family.tgs')
// Restyle проходит и по корню. В этом стикере корень — фотография, рамка и её вспышка:
// сохраняем его целиком, чтобы общий цвет кожи не перекрасил вспышку в градиент тела.
anim.layers = structuredClone(source.layers)
const bust = await read('packs/blue/base/bust.tgs')
const layers = anim.assets.find(a => a.id === 'comp_0').layers
const originals = source.assets.find(a => a.id === 'comp_0').layers
const byName = (ls, name) => ls.find(l => l.nm === name)
const walk = xs => xs.flatMap(x => x.ty === 'gr' ? walk(x.it) : [x])
const firstPath = l => walk(l.shapes).find(x => x.ty === 'sh')
const firstShape = p => p.a ? p.k[0].s[0] : p.k
const silhouette = firstShape(firstPath(byName(bust.layers, 'silhouette')).ks)
const crown = firstShape(firstPath(byName(bust.layers, 'top')).ks)
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
const tr = () => ({ ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] },
  s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } })
const stroke = (color, width) => ({ ty: 'st', c: { a: 0, k: [...rgb(color), 1] },
  o: { a: 0, k: 100 }, w: { a: 0, k: width }, lc: 2, lj: 2 })
const group = (nm, items) => ({ ty: 'gr', nm, it: [...items, tr()] })

// Изменяются только координаты путей. Времена, easing, положение слоёв и вся цепочка родителей
// остаются исходными, включая деформации овала у детей.
function mapProperty(prop, fn) {
  if (!prop.a) return { ...prop, k: fn(prop.k) }
  return { ...prop, k: prop.k.map(key => ({ ...key,
    ...(key.s && { s: key.s.map(fn) }), ...(key.e && { e: key.e.map(fn) }),
  })) }
}

// Матрицы нужны только для установки общего градиента головы и тела в опорной позе.
const I = [1, 0, 0, 1, 0, 0]
const mul = (m, n) => [m[0]*n[0]+m[2]*n[1], m[1]*n[0]+m[3]*n[1],
  m[0]*n[2]+m[2]*n[3], m[1]*n[2]+m[3]*n[3],
  m[0]*n[4]+m[2]*n[5]+m[4], m[1]*n[4]+m[3]*n[5]+m[5]]
const point = (m, p) => [m[0]*p[0]+m[2]*p[1]+m[4], m[1]*p[0]+m[3]*p[1]+m[5]]
const inverse = m => { const d = m[0]*m[3]-m[1]*m[2]; return [m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,
  (m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d] }
function at(p, fallback, frame = recipe.frame) {
  if (!p) return fallback
  if (!p.a) return p.k
  const ks = p.k
  let i = ks.findIndex(k => k.t > frame) - 1
  if (frame <= ks[0].t) return ks[0].s
  if (i < 0) return ks.at(-1).s
  const a = ks[i], b = ks[i + 1], u = (frame - a.t) / (b.t - a.t)
  const mix = (x, y) => typeof x === 'number' ? x + (y-x)*u : Array.isArray(x) ? x.map((v,j) => mix(v,y[j])) :
    { ...x, ...Object.fromEntries(['v','i','o'].map(k => [k,mix(x[k],y[k])])) }
  return a.h ? a.s : mix(a.s, a.e ?? b.s)
}
function transform(t, frame = recipe.frame) {
  const a = at(t?.a, [0,0],frame), p = at(t?.p, [0,0],frame), s = at(t?.s, [100,100],frame)
  const angle = Number(at(t?.r, 0,frame)) * Math.PI/180
  const c = Math.cos(angle), sn = Math.sin(angle)
  return mul([1,0,0,1,p[0],p[1]], mul([c*s[0]/100,sn*s[0]/100,-sn*s[1]/100,c*s[1]/100,0,0], [1,0,0,1,-a[0],-a[1]]))
}
function world(layer, frame = recipe.frame) {
  return mul(layer.parent == null ? I : world(layers.find(l => l.ind === layer.parent),frame), transform(layer.ks,frame))
}
function visit(list, matrix, fn) {
  const m = mul(matrix, transform(list.find(x => x.ty === 'tr')))
  for (const x of list) {
    if (x.ty === 'gr') visit(x.it, m, fn)
    else fn(x, m)
  }
}

for (const person of cfg.people) {
  const head = byName(layers, person.head)
  const original = byName(originals, person.head)
  const outlineGroup = original.shapes[0]
  const prop = firstPath(original).ks
  const offset = outlineGroup.it.find(x => x.ty === 'tr').p.k
  const fit = (model, old, closed, keep = model.v.map((_, i) => i)) => {
    const xs = old.v.map(p => p[0]), ys = old.v.map(p => p[1])
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    const sx = (x1-x0)/cfg.bust.skullWidth, sy = (y1-y0)/(cfg.bust.chin[1]-cfg.bust.crown)
    return { c: closed,
      v: keep.map(i => [(model.v[i][0]-cfg.bust.axis)*sx+(x0+x1)/2+offset[0],
        (model.v[i][1]-cfg.bust.crown)*sy+y0+offset[1]]),
      i: keep.map(i => [model.i[i][0]*sx,model.i[i][1]*sy]),
      o: keep.map(i => [model.o[i][0]*sx,model.o[i][1]*sy]),
    }
  }
  // Из 👤 берём только череп, уши и щёки. Вместо шеи замыкаем нижнюю дугу подбородком.
  const model = structuredClone(silhouette)
  model.i[cfg.bust.keep[0]] = [-cfg.bust.jawHandle[0],cfg.bust.jawHandle[1]]
  model.o[cfg.bust.keep.at(-1)] = cfg.bust.jawHandle
  const chinIndex = model.v.length
  model.v.push(cfg.bust.chin)
  model.i.push([-cfg.bust.chinHandle,0]); model.o.push([cfg.bust.chinHandle,0])
  const headPath = mapProperty(prop, old => fit(model, old, true, [...cfg.bust.keep,chinIndex]))
  const rimPath = mapProperty(prop, old => fit(crown, old, false))
  const width = walk(byName(originals,person.body).shapes).find(x => x.ty === 'st').w.k
  head.shapes = [
    group('Блик макушки', [{ ty: 'sh', ks: rimPath }, stroke(style.rim, width)]),
    group('Голова', [{ ty: 'sh', ks: headPath }, stroke(style.outline,width),
      { ty: 'fl', c: { a: 0, k: [...rgb(style.body.stops[1][1]),1] }, o: { a: 0, k: 100 }, r: 1 }]),
  ]

  // Оставляем собственно рот; убираем только цветную кожу под нижней губой и помаду.
  // Геометрия, ключи и групповые transform копируются из оригинала без изменений.
  const mouth = byName(layers, person.mouth)
  mouth.shapes = structuredClone(byName(originals, person.mouth).shapes)
    .filter(g => (person.mouthGroups ?? ['Group 2','Group 3']).includes(g.nm))
  for (const paint of walk(mouth.shapes).filter(x => x.ty === 'fl' || x.ty === 'st'))
    paint.c = { a: 0, k: [1,1,1,1] }

  // У каждой фигуры свой градиент. Старый градиент одежды заменяется целиком, чтобы ни один
  // промежуточный красный/фиолетовый/бирюзовый цвет не пережил перекраску.
  const body = byName(layers, person.body)
  const box = { y0: Infinity, y1: -Infinity, x0: Infinity, x1: -Infinity }
  for (const layer of [head,body]) visit(layer.shapes, world(layer), (x,m) => {
    if (x.ty !== 'sh') return
    const p = at(x.ks), shape = Array.isArray(p) ? p[0] : p
    for (const v of shape.v) {
      const [xx,yy] = point(m,v)
      box.y0 = Math.min(box.y0,yy); box.y1 = Math.max(box.y1,yy)
      box.x0 = Math.min(box.x0,xx); box.x1 = Math.max(box.x1,xx)
    }
  })
  const cx = (box.x0+box.x1)/2
  for (const layer of [head,body]) visit(layer.shapes, world(layer), (x,m) => {
    if (x.ty !== 'gf' && !(layer === head && x.ty === 'fl')) return
    const inv = inverse(m), opacity = x.o, name = x.nm
    for (const key of Object.keys(x)) delete x[key]
    Object.assign(x, { ty: 'gf', nm: name ?? 'Градиент тела', o: opacity, r: 1, bm: 0, t: 1,
      s: { a: 0, k: point(inv,[cx,box.y1]) }, e: { a: 0, k: point(inv,[cx,box.y0]) },
      g: { p: style.body.stops.length, k: { a: 0, k: style.body.stops.flatMap(([stop,color]) => [stop,...rgb(color)]) } },
    })
  })
}

// Родители остаются позади детей, в том числе при поворотах новых голов.
// Сами слои и их transform/parent не меняются, меняется только порядок отрисовки.
const parents = ['head 4','head 3'].map(name => byName(layers,name))
for (const layer of parents) layers.splice(layers.indexOf(layer),1)
layers.splice(layers.indexOf(byName(layers,'body 3')),0,...parents)

// Несмотря на имя, «top hair 3» — белая вспышка по силуэтам всей семьи (65–70), а не волосы.
// Её экспозиция/тайминг сохранены; геометрия вспышки соответствует новым силуэтам.
const flash = byName(layers,'top hair 3')
const flashFrame = flash.ip
function whiteSnapshot(list, matrix) {
  const m = mul(matrix,transform(list.find(x => x.ty === 'tr'),flashFrame))
  return list.map(x => {
    if (x.ty === 'tr') return tr()
    if (x.ty === 'gr') return { ...x, it: whiteSnapshot(x.it,m) }
    if (x.ty === 'sh') {
      const p = at(x.ks,undefined,flashFrame), shape = Array.isArray(p) ? p[0] : p
      const vector = v => [m[0]*v[0]+m[2]*v[1],m[1]*v[0]+m[3]*v[1]]
      return { ...x, ks: { a: 0, k: { c: shape.c, v: shape.v.map(v => point(m,v)),
        i: shape.i.map(vector), o: shape.o.map(vector) } } }
    }
    if (x.ty === 'gf' || x.ty === 'fl') return { ty: 'fl', c: { a: 0, k: [1,1,1,1] }, o: { a: 0, k: 100 }, r: 1 }
    if (x.ty === 'st') return { ...structuredClone(x), c: { a: 0, k: [1,1,1,1] }, o: { a: 0, k: 100 } }
    return structuredClone(x)
  })
}
flash.shapes = cfg.people.flatMap(person => [person.head,person.body].map(name => {
  const layer = byName(layers,name)
  return group(`Вспышка: ${name}`,whiteSnapshot(layer.shapes,mul(inverse(world(flash,flashFrame)),world(layer,flashFrame))))
}))

const bytes = await writeTgs(anim)
const checks = telegramChecks(anim, bytes.length)
if (!checks.every(c => c.ok)) throw new Error(JSON.stringify(checks.filter(c => !c.ok)))
await writeFile(join(ROOT, 'exports/blue/family.tgs'), bytes)
const eng = await engine()
const rows = [source,anim].map(a => eng.create(JSON.stringify(a)))
// Ключевые состояния всех четырёх: исходник сверху, силуэты снизу, абсолютные номера кадров.
const frames = [79,92,106,120,142,162,173,184,197,210,219,229]
const cell = 256, band = 20
const sheet = new Canvas(cell*6,(cell+band)*4)
for (const [i,f] of frames.entries()) for (const [row,inst] of rows.entries()) {
  const x = i%6*cell, y = (Math.floor(i/6)*2+row)*(cell+band)
  sheet.text(`f ${f}`,x+6,y+4,[60,60,60])
  sheet.draw(inst.render(f-source.ip,cell,cell).slice(),cell,x,y+band)
}
await writeFile(join(ROOT,'exports/sheets/blue-family.png'), encodePng(sheet.px,sheet.width,sheet.height))
await mkdir(join(ROOT,'exports/sheets/family'), { recursive: true })
for (const f of [60,79,92,106,120,142,162,173,184,197,210,219,229,239])
  await writeFile(join(ROOT,`exports/sheets/family/blue-${f}.png`), encodePng(rows[1].render(f-source.ip,1024,1024).slice(),1024,1024))
for (const inst of rows) inst.drop()
console.log(`exports/blue/family.tgs: ${sizeKb(bytes)} KB; exports/sheets/blue-family.png`)
