// 211–213 → один синий 🤦. Только голова, тело и голая рука, без одежды/шеи.
// node packs/blue/facepalm/build.mjs
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Canvas, ROOT, encodePng, engine, load } from '../../../scripts/lib/sheets.mjs'
const { readTgs, writeTgs, sizeKb } = await load('src/core/tgs.ts')
const { telegramChecks } = await load('src/core/checks.ts')
const { easeAt } = await load('src/core/motion/easing.ts')
const read = async p => readTgs(new Uint8Array(await readFile(join(ROOT,p))))
const source = await read('packs/blue/facepalm/source.tgs'), anim = structuredClone(source)
const style = JSON.parse(await readFile(join(ROOT,'packs/blue/style.json'),'utf8'))
const cfg = JSON.parse(await readFile(join(ROOT,'packs/blue/family/heads.json'),'utf8')).bust
const bust = await read('packs/blue/base/bust.tgs')
const originals = source.assets.find(a => a.id === 'comp_0').layers
const comp = anim.assets.find(a => a.id === 'comp_0')
const keep = ['NULL FACE','Splash','Sleeve','Hand','Mouth','HEAD','BODY']
comp.layers = comp.layers.filter(l => keep.includes(l.nm))
const by = (ls,n) => ls.find(l => l.nm === n)
const layer = n => by(comp.layers,n)
const walk = xs => xs.flatMap(x => x.ty === 'gr' ? walk(x.it) : [x])
const path = l => walk(l.shapes).find(x => x.ty === 'sh').ks
const first = p => p.a ? p.k[0].s[0] : p.k
const rgb = h => [1,3,5].map(i => parseInt(h.slice(i,i+2),16)/255)
const tr = () => ({ty:'tr',p:{a:0,k:[0,0]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}})
const group = (nm,it) => ({ty:'gr',nm,it:[...it,tr()]})
const stroke = color => ({ty:'st',c:{a:0,k:[...rgb(color),1]},o:{a:0,k:100},w:{a:0,k:8},lc:2,lj:2})
const gradient = (bottom,top) => ({ty:'gf',o:{a:0,k:100},r:1,t:1,bm:0,
  s:{a:0,k:bottom},e:{a:0,k:top},g:{p:style.body.stops.length,
    k:{a:0,k:style.body.stops.flatMap(([s,c]) => [s,...rgb(c)])}}})
function mapProperty(prop,fn) {
  return !prop.a ? {...prop,k:fn(prop.k)} : {...prop,k:prop.k.map(k => ({...k,
    ...(k.s && {s:k.s.map(fn)}),...(k.e && {e:k.e.map(fn)})}))}
}

// Одобренный контур family: череп/уши, замкнутые подбородком, без шеи.
const model = structuredClone(first(path(by(bust.layers,'silhouette'))))
model.i[cfg.keep[0]] = [-cfg.jawHandle[0],cfg.jawHandle[1]]
model.o[cfg.keep.at(-1)] = cfg.jawHandle
const chin = model.v.length
model.v.push(cfg.chin); model.i.push([-cfg.chinHandle,0]); model.o.push([cfg.chinHandle,0])
const crown = first(path(by(bust.layers,'top')))
function fit(model,old,closed,indices=model.v.map((_,i) => i)) {
  const xs=old.v.map(v=>v[0]),ys=old.v.map(v=>v[1])
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys)
  const sx=(x1-x0)/cfg.skullWidth,sy=(y1-y0)/(cfg.chin[1]-cfg.crown)
  return {c:closed,v:indices.map(i=>[(model.v[i][0]-cfg.axis)*sx+(x0+x1)/2,(model.v[i][1]-cfg.crown)*sy+y0]),
    i:indices.map(i=>[model.i[i][0]*sx,model.i[i][1]*sy]),o:indices.map(i=>[model.o[i][0]*sx,model.o[i][1]*sy])}
}
const oldHead = path(layer('HEAD'))
layer('HEAD').shapes = [
  group('Блик макушки',[{ty:'sh',ks:mapProperty(oldHead,p=>fit(crown,p,false))},stroke(style.rim)]),
  group('Голова без шеи',[{ty:'sh',ks:mapProperty(oldHead,p=>fit(model,p,true,[...cfg.keep,chin]))},
    stroke(style.outline),gradient([0,206],[0,-185])]),
]
// От исходного тела оставляем только внешнюю форму плеч и нижнюю заливку.
const body = layer('BODY')
body.shapes = body.shapes.filter(g=>g.nm === 'Group 2')
for (const x of walk(body.shapes)) {
  if(x.ty === 'st') Object.assign(x,stroke(style.outline))
  if(x.ty === 'gf') Object.assign(x,gradient([0,206],[0,-185]))
}
const mouth = layer('Mouth')
mouth.shapes = mouth.shapes.filter(g=>g.nm === 'Group 2')
for(const x of walk(mouth.shapes)) if(x.c) x.c = {a:0,k:[1,1,1,1]}

// Кисть сохраняет все морфы и детали пальцев. У контура размыкаем только запястье,
// чтобы не было поперечной линии рукава между кистью и новым предплечьем.
const hand = layer('Hand'), handPath = structuredClone(path(hand))
// Старые три тени ладони обрывались поперёк запястья. Оставляем детали пальцев,
// а основной объём ладони/предплечья задаёт общий непрерывный градиент.
hand.shapes[1].it = hand.shapes[1].it.filter(g=>!['Group 3','Group 4','Group 5'].includes(g.nm))
const order = [...Array.from({length:18},(_,i)=>i+10),...Array.from({length:10},(_,i)=>i)]
hand.shapes[0].it.find(x=>x.ty === 'sh').ks = mapProperty(handPath,p=>({c:false,
  ...Object.fromEntries(['v','i','o'].map(k=>[k,order.map(i=>p[k][i])]))}))
for(const x of walk(hand.shapes)) {
  if(x.ty === 'st') Object.assign(x,stroke(style.outline))
  if(x.ty === 'fl') {
    const [r,g,b]=x.c.k
    if(g<0.7) x.c={a:0,k:[...rgb('#44688b'),1]}
    else if(b>0.2) x.c={a:0,k:[...rgb('#8cb7d3'),1]}
    else { delete x.c; Object.assign(x,gradient([0,234],[0,-150])) }
  }
}

// Предплечье заканчивается точно на анимированном запястье. Это векторные ключи,
// без выражений и масок. Остальной риг и его easing остаются исходными.
const pick=(x,d)=>Array.isArray(x)?x[Math.min(d,x.length-1)]:x
const mix=(a,b,u)=>typeof a === 'number'?a+(b-a)*u:Array.isArray(a)?a.map((v,i)=>mix(v,b[i],u)):
  {...a,...Object.fromEntries(['v','i','o'].map(k=>[k,mix(a[k],b[k],u)]))}
function at(p,f,fallback) {
  if(!p)return fallback
  if(!p.a)return p.k
  const ks=p.k
  if(f<=ks[0].t)return ks[0].s
  for(let n=0;n<ks.length-1;n++) {
    const a=ks[n],b=ks[n+1],to=b.s??a.e
    if(f>=b.t)continue
    if(a.h || !to)return a.s
    const x=(f-a.t)/(b.t-a.t)
    const ease=d=>a.o&&a.i?easeAt({x1:pick(a.o.x,d),y1:pick(a.o.y,d),x2:pick(a.i.x,d),y2:pick(a.i.y,d)},x):x
    if(a.to&&a.ti) {
      const u=ease(0)
      const cubic=t=>a.s.map((v,d)=>(1-t)**3*v+3*(1-t)**2*t*(v+a.to[d])+3*(1-t)*t*t*(to[d]+a.ti[d])+t**3*to[d])
      // Lottie progresses by distance along spatial curves, after temporal easing.
      const points=Array.from({length:97},(_,i)=>cubic(i/96)),lengths=[0]
      for(let i=1;i<points.length;i++) lengths.push(lengths.at(-1)+Math.hypot(...points[i].map((v,d)=>v-points[i-1][d])))
      const distance=u*lengths.at(-1)
      const i=Math.max(1,lengths.findIndex(l=>l>=distance))
      return mix(points[i-1],points[i],lengths[i]===lengths[i-1]?0:(distance-lengths[i-1])/(lengths[i]-lengths[i-1]))
    }
    return typeof a.s[0] === 'object'?mix(a.s,to,ease(0)):a.s.map((v,d)=>mix(v,to[d],ease(d)))
  }
  return ks.at(-1).s??ks.at(-2).e
}
function handPoint(v,f,inverse=false) {
  const p=at(hand.ks.p,f,[0,0]),a=at(hand.ks.a,f,[0,0]),s=at(hand.ks.s,f,[100,100])
  const r=Number(at(hand.ks.r,f,0))*Math.PI/180,c=Math.cos(r),sn=Math.sin(r)
  const x=inverse?v[0]-p[0]:(v[0]-a[0])*s[0]/100
  const y=inverse?v[1]-p[1]:(v[1]-a[1])*s[1]/100
  return (inverse?[(c*x+sn*y)*100/s[0]+a[0],(-sn*x+c*y)*100/s[1]+a[1]]:
    [p[0]+c*x-sn*y,p[1]+sn*x+c*y]).map(v=>Math.round(v*1000)/1000)
}
function armShape(f,closed) {
  const h=at(handPath,f)[0]
  // Tiny overlap inside the palm keeps the joint sealed during subframe playback.
  const overlap=v=>handPoint([v[0],v[1]-(closed?4:0)],f)
  const left=overlap(h.v[10]),right=overlap(h.v[9])
  const v=[right,[183.32,236.436],[44.083,232.52],left]
  return {c:closed,v,i:v.map(()=>[0,0]),o:v.map(()=>[0,0])}
}
const baked = closed => ({a:1,k:Array.from({length:180},(_,t)=>({t,s:[armShape(t,closed)],
  ...(t<179&&{o:{x:0.333,y:0.333},i:{x:0.667,y:0.667}})}))})
layer('Sleeve').nm = 'Forearm'
layer('Forearm').shapes = [
  group('Предплечье без манжеты',[{ty:'sh',ks:baked(true)},gradient([0,234],[0,-150])]),
]
// One uninterrupted outline around the fingers AND forearm. Separate round caps at
// the wrist made two visible ticks; the join now has no endpoints at all.
hand.shapes.shift()
function armOutline(f){
  const h=at(handPath,f)[0],origin=handPoint([0,0],f)
  const vector=v=>handPoint(v,f).map((x,d)=>Math.round((x-origin[d])*100)/100)
  const round=v=>v.map(x=>Math.round(x*100)/100)
  return {c:true,v:[...order.map(i=>round(handPoint(h.v[i],f))),[183.32,236.44],[44.08,232.52]],
    i:[...order.map(i=>vector(h.i[i])),[0,0],[0,0]],
    o:[...order.map(i=>vector(h.o[i])),[0,0],[0,0]]}
}
const outlineFrames=[...Array.from({length:90},(_,i)=>i*2),179]
const unifiedOutline={ddd:0,ind:100,ty:4,nm:'Continuous arm outline',parent:layer('Forearm').ind,
  ks:{...tr(),o:structuredClone(hand.ks.o)},ip:anim.ip,op:anim.op,st:0,sr:1,bm:0,
  shapes:[group('Единый контур руки',[{ty:'sh',ks:{a:1,k:outlineFrames.map(t=>({t,s:[armOutline(t)],
    ...(t<179&&{o:{x:0.333,y:0.333},i:{x:0.667,y:0.667}})}))}},stroke(style.outline)])]}
// Один градиент на всю руку в координатах предплечья: при повороте кисти на запястье
// не возникает цветного края, похожего на манжету.
for(const x of walk(hand.shapes)) if(x.ty === 'gf') for(const [key,v] of [['s',[0,234]],['e',[0,-150]]])
  x[key]={a:1,k:Array.from({length:180},(_,t)=>({t,s:handPoint(v,t,true),
    ...(t<179&&{o:{x:0.333,y:0.333},i:{x:0.667,y:0.667}})}))}
// Кисть перекрывает стык заливок, как одно целое с предплечьем.
comp.layers.splice(comp.layers.indexOf(hand),1)
comp.layers.splice(comp.layers.indexOf(layer('Forearm')),0,hand)
comp.layers.splice(comp.layers.indexOf(hand),0,unifiedOutline)

for(const l of comp.layers.filter(l=>l.ind<100)) assert.deepEqual(l.ks,by(originals,l.nm==='Forearm'?'Sleeve':l.nm).ks)
assert.deepEqual(await readFile(join(ROOT,'packs/blue/facepalm/source.tgs')),await readFile(join(ROOT,'library/emoji/213.tgs')))
for(const l of comp.layers) if(l.parent!=null) assert.ok(comp.layers.some(p=>p.ind===l.parent))
for(const p of walk(body.shapes).filter(p=>p.ty==='sh'))
  assert.ok(walk(by(originals,'BODY').shapes).some(x=>x.ty==='sh'&&JSON.stringify(x.ks)===JSON.stringify(p.ks)))
const originalMouth=by(originals,'Mouth').shapes.find(g=>g.nm==='Group 2')
assert.deepEqual(path(mouth),path({shapes:[originalMouth]}))
assert.deepEqual(layer('Splash'),by(originals,'Splash'))
const bytes=await writeTgs(anim)
assert.ok(telegramChecks(anim,bytes.length).every(c=>c.ok))
await writeFile(join(ROOT,'exports/blue/facepalm.tgs'),bytes)
const eng=await engine(),rows=[source,anim].map(a=>eng.create(JSON.stringify(a)))
const frames=[0,28,42,54,75,94,106,116,122,126,140,179],C=256,sheet=new Canvas(C*6,(C+20)*4)
await mkdir(join(ROOT,'exports/sheets/facepalm'),{recursive:true})
for(const [i,f] of frames.entries())for(const [r,p] of rows.entries()) {
  const x=i%6*C,y=(Math.floor(i/6)*2+r)*(C+20)
  sheet.text(`f ${f}`,x+4,y+4,[70,70,70]);sheet.draw(p.render(f,C,C).slice(),C,x,y+20)
}
await writeFile(join(ROOT,'exports/sheets/blue-facepalm.png'),encodePng(sheet.px,sheet.width,sheet.height))
for(const f of frames)await writeFile(join(ROOT,`exports/sheets/facepalm/blue-${f}.png`),encodePng(rows[1].render(f,1024,1024).slice(),1024,1024))
const all=new Canvas(128*15,144*12)
for(let f=0;f<180;f++) {
  const x=f%15*128,y=Math.floor(f/15)*144,px=rows[1].render(f,128,128).slice()
  assert.ok(px.some((v,i)=>i%4===3&&v>0),`Пустой кадр ${f}`)
  all.text(`f ${f}`,x+2,y+2,[70,70,70]);all.draw(px,128,x,y+16)
}
await writeFile(join(ROOT,'exports/sheets/facepalm/all.png'),encodePng(all.px,all.width,all.height))
rows.forEach(p=>p.drop())
console.log(`exports/blue/facepalm.tgs: ${sizeKb(bytes)} KB; exports/sheets/blue-facepalm.png`)
