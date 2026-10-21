// 069 🫣: голова одобренной family без шеи, белая испуганная мимика, синие руки.
// node packs/blue/peeking-face/build.mjs
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Canvas, ROOT, encodePng, engine, load } from '../../../scripts/lib/sheets.mjs'

const { readTgs, writeTgs, sizeKb } = await load('src/core/tgs.ts')
const { telegramChecks } = await load('src/core/checks.ts')
const read = async p => readTgs(new Uint8Array(await readFile(join(ROOT,p))))
const cfg = JSON.parse(await readFile(join(import.meta.dirname,'head.json'),'utf8'))
const modelCfg = JSON.parse(await readFile(join(ROOT,cfg.familyShape),'utf8')).bust
const style = JSON.parse(await readFile(join(ROOT,'packs/blue/style.json'),'utf8'))
execFileSync(process.execPath,[join(ROOT,'scripts/restyle.mjs'),'blue/peeking-face'],{stdio:'ignore'})
const source = await read('packs/blue/peeking-face/source.tgs')
const anim = await read('exports/blue/peeking-face.tgs')
const bust = await read('packs/blue/base/bust.tgs')
const byName = (a,nm) => a.layers.find(l => l.nm === nm)
const walk = xs => xs.flatMap(x => x.ty === 'gr' ? walk(x.it) : [x])
const path = l => walk(l.shapes).find(x => x.ty === 'sh').ks
const first = p => p.a ? p.k[0].s[0] : p.k
const rgb = h => [1,3,5].map(i => parseInt(h.slice(i,i+2),16)/255)
const tr = () => ({ty:'tr',p:{a:0,k:[0,0]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}})
const stroke = color => ({ty:'st',c:{a:0,k:[...rgb(color),1]},o:{a:0,k:100},w:{a:0,k:cfg.outline},lc:2,lj:2})
const group = (nm,it) => ({ty:'gr',nm,it:[...it,tr()]})
const model = structuredClone(first(path(byName(bust,'silhouette'))))
model.i[modelCfg.keep[0]] = [-modelCfg.jawHandle[0],modelCfg.jawHandle[1]]
model.o[modelCfg.keep.at(-1)] = modelCfg.jawHandle
const chin = model.v.length
model.v.push(modelCfg.chin)
model.i.push([-modelCfg.chinHandle,0]); model.o.push([modelCfg.chinHandle,0])
const sx = cfg.width/modelCfg.skullWidth, sy = cfg.height/(modelCfg.chin[1]-modelCfg.crown)
function fit(p,closed,keep=p.v.map((_,i) => i)) {
  return {c:closed,v:keep.map(i => [(p.v[i][0]-modelCfg.axis)*sx+cfg.center[0],
    (p.v[i][1]-modelCfg.crown)*sy-cfg.height/2+cfg.center[1]]),
    i:keep.map(i => [p.i[i][0]*sx,p.i[i][1]*sy]),o:keep.map(i => [p.o[i][0]*sx,p.o[i][1]*sy])}
}
const head = byName(anim,'BODY')
head.shapes = [
  group('Блик макушки',[{ty:'sh',ks:{a:0,k:fit(first(path(byName(bust,'top'))),false)}},stroke(style.rim)]),
  group('Голова',[{ty:'sh',ks:{a:0,k:fit(model,true,[...modelCfg.keep,chin])}},stroke(style.outline),
    {ty:'gf',o:{a:0,k:100},r:1,bm:0,t:1,s:{a:0,k:[cfg.center[0],cfg.center[1]+cfg.height/2]},
      e:{a:0,k:[cfg.center[0],cfg.center[1]-cfg.height/2]},
      g:{p:style.body.stops.length,k:{a:0,k:style.body.stops.flatMap(([at,color]) => [at,...rgb(color)])}}}]),
]

// По уточнению пользователя — только рот, без глаз и бровей. Сохраняем исходные
// контуры линии и полости рта, их ключи и transform; исключаем тёплые подложки/блики.
const mouth = byName(anim,'Mouth')
mouth.shapes = structuredClone(byName(source,'Mouth').shapes.filter(g => ['Group 1','Group 2'].includes(g.nm)))
for (const paint of walk(mouth.shapes).filter(x => x.c)) paint.c = {a:0,k:[1,1,1,1]}
// Единая исходная толщина обводки для головы и всех пальцев/ладоней.
for (const name of ['Hand L','Hand R']) for (const p of walk(byName(anim,name).shapes))
  if (p.ty === 'st') p.w = {a:0,k:cfg.outline}

const bytes = await writeTgs(anim)
const checks = telegramChecks(anim,bytes.length)
if (!checks.every(c => c.ok)) throw Error(JSON.stringify(checks.filter(c => !c.ok)))
await writeFile(join(ROOT,'exports/blue/peeking-face.tgs'),bytes)
const eng = await engine(), rows = [source,anim].map(a => eng.create(JSON.stringify(a)))
const frames = [0,20,38,52,64,73,80,88,97,110,140,179], C = 256
const sheet = new Canvas(C*6,(C+20)*4)
await mkdir(join(ROOT,'exports/sheets/peeking-face'),{recursive:true})
for (const [i,f] of frames.entries()) for (const [row,p] of rows.entries()) {
  const x = i%6*C, y = (Math.floor(i/6)*2+row)*(C+20)
  sheet.text(`f ${f}`,x+4,y+4,[70,70,70]);sheet.draw(p.render(f,C,C).slice(),C,x,y+20)
}
for (const f of [0,38,52,73,80,88,97,110,140,179])
  await writeFile(join(ROOT,`exports/sheets/peeking-face/blue-${f}.png`),encodePng(rows[1].render(f,1024,1024).slice(),1024,1024))
await writeFile(join(ROOT,'exports/sheets/blue-peeking-face.png'),encodePng(sheet.px,sheet.width,sheet.height))
rows.forEach(p => p.drop())
console.log(`exports/blue/peeking-face.tgs: ${sizeKb(bytes)} KB; exports/sheets/blue-peeking-face.png`)
