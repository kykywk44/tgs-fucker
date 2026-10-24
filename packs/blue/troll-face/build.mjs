// Restyle the user's animated troll face without replacing its silhouette or grin.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {ROOT,engine,Canvas,encodePng} from '../../../scripts/lib/sheets.mjs'
import {read,walk,rgb,stroke,gradient,mapProperty,nullify,finish} from '../lib/silhouette.mjs'

const cfg=JSON.parse(await readFile(join(import.meta.dirname,'recipe.json'),'utf8'))
const source=await read('packs/blue/troll-face/source.tgs')
const palette=(node,color)=>{node.c={a:0,k:[...rgb(color),1]}}
const by=(layers,name)=>{const layer=layers.find(l=>l.nm===name);assert.ok(layer,name);return layer}

export function restyle(smooth=false){
  const anim=structuredClone(source)
  anim.nm=smooth?'Troll face · Без складок':'Troll face · Со складками'
  const layers=anim.assets.find(a=>a.id==='comp_0').layers
  // Keep hidden feature layers as transform-only parents. The original rig runs through them.
  for(const name of ['brows Outlines','nose1 Outlines','eye1 Outlines'])nullify(by(layers,name))

  const head=by(layers,'head1 Outlines')
  const outline=structuredClone(head.shapes.find(g=>g.nm==='Group 2'))
  const contour=outline.it.find(p=>p.ty==='sh')
  const localTransform=outline.it.find(p=>p.ty==='tr')
  // The original has an inset peach fill over a larger peach outline. Use one
  // blue gradient over the outer silhouette so there is no inset colour seam.
  outline.it=[contour,stroke(cfg.outlineWidth),gradient([0,194],[0,-195]),localTransform]
  head.shapes=[outline]
  const rim=by(layers,'head1 Outlines 2')
  const rimGroup=rim.shapes[0]
  const rimPath=rimGroup.it.find(p=>p.ty==='sh')
  rimPath.ks=mapProperty(rimPath.ks,p=>({c:false,...Object.fromEntries(['v','i','o'].map(k=>[k,cfg.crownVertices.map(i=>p[k][i])]))}))
  rimGroup.it=[rimPath,stroke(cfg.outlineWidth,'#a5d6ea'),rimGroup.it.find(p=>p.ty==='tr')]

  for(const name of ['forhead Outlines','chin Outlines','cheecks Outlines']){
    const layer=by(layers,name)
    if(smooth){nullify(layer);continue}
    for(const paint of walk(layer.shapes))if(paint.c){
      palette(paint,cfg.creaseColor)
      paint.o={a:0,k:cfg.creaseOpacity*(paint.o?.k??100)/100}
      if(paint.w)paint.w={a:0,k:Math.min(paint.w.k,7)}
    }
  }
  const lip=by(layers,'mouth2 Outlines')
  lip.shapes=lip.shapes.filter(g=>!smooth||['Group 4','Group 5'].includes(g.nm))
  for(const g of lip.shapes){
    const border=['Group 4','Group 5'].includes(g.nm)
    for(const paint of walk([g]))if(paint.c){
      palette(paint,cfg.creaseColor)
      if(!border){paint.o={a:0,k:cfg.creaseOpacity};if(paint.w)paint.w={a:0,k:7}}
    }
  }
  for(const paint of walk(by(layers,'mouth Outlines').shapes))if(paint.c)palette(paint,'#335375')
  for(const name of ['teeth1 Outlines','teeth2 Outlines']){
    const layer=by(layers,name)
    // The source has wide purple gaps and a shadow band over each tooth row.
    // Keep the white row silhouette, replacing only those gaps with the pack's
    // fine blue separators, derived from the original animated gap positions.
    const bands=name==='teeth1 Outlines'?['Group 1']:['Group 1','Group 2']
    layer.shapes=layer.shapes.filter(g=>!bands.includes(g.nm))
    for(const g of layer.shapes){
      const fill=g.it.find(p=>p.ty==='fl')
      assert.ok(fill)
      if(fill.c.k.slice(0,3).every(v=>v>.95)){palette(fill,'#ffffff');continue}
      const path=g.it.find(p=>p.ty==='sh')
      path.ks=mapProperty(path.ks,p=>{
        const mean=[0,1].map(d=>p.v.reduce((sum,v)=>sum+v[d],0)/p.v.length)
        const slope=p.v.reduce((sum,v)=>sum+(v[0]-mean[0])*(v[1]-mean[1]),0)/
          Math.max(1e-9,p.v.reduce((sum,v)=>sum+(v[1]-mean[1])**2,0))
        const ys=[Math.min(...p.v.map(v=>v[1])),Math.max(...p.v.map(v=>v[1]))]
        return {c:false,v:ys.map(y=>[mean[0]+slope*(y-mean[1]),y]),i:[[0,0],[0,0]],o:[[0,0],[0,0]]}
      })
      g.it=g.it.map(p=>p===fill?stroke(cfg.toothSeparatorWidth,cfg.toothSeparators):p)
    }
  }
  function cleanNeutralSkew(node){
    if(!node||typeof node!=='object')return
    if(node.sk){
      const values=node.sk.a?node.sk.k.flatMap(k=>[...(k.s??[]),...(k.e??[])]):[node.sk.k].flat()
      assert.ok(values.length&&values.every(v=>v===0),'Non-neutral skew would need baking')
      // The source keys an always-zero skew. Telegram rejects even that unused
      // property; dropping it and its axis is a visual identity operation.
      delete node.sk;delete node.sa
    }
    Object.values(node).forEach(cleanNeutralSkew)
  }
  cleanNeutralSkew(anim)
  return anim
}

const variants=[restyle(false),restyle(true)]
const frames=[0,20,40,60,80,100,120,140,160,179]
for(const [i,anim]of variants.entries())await finish(cfg.variants[i],source,anim,frames)
// A compact comparison for choosing the version in chat: original, creases, clean.
const eng=await engine(),players=[source,...variants].map(a=>eng.create(JSON.stringify(a)))
const chosen=[0,90,140],size=320,sheet=new Canvas(size*chosen.length,(size+20)*players.length)
for(const[row,player]of players.entries())for(const[col,f]of chosen.entries()){
  sheet.text(`f ${f}`,col*size+4,row*(size+20)+4,[70,70,70])
  sheet.draw(player.render(f,size,size).slice(),size,col*size,row*(size+20)+20)
}
await writeFile(join(ROOT,'exports/sheets/blue-troll-face-compare.png'),encodePng(sheet.px,sheet.width,sheet.height))
const options=new Canvas(size*2,size)
for(const [index,player]of players.slice(1).entries())options.draw(player.render(0,size,size).slice(),size,index*size,0)
await writeFile(join(ROOT,'exports/sheets/blue-troll-face-options.png'),encodePng(options.px,options.width,options.height))
players.forEach(p=>p.drop())
