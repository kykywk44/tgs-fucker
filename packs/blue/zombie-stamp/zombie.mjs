// A blue zombie from one of 207, 208, 209 (woman, kid, man: arms out, clawing, the head rolling):
// restyled by its own recipe (packs/blue/zombie-stamp-<n>: hair, eyes, brows and nose out, skin
// the body gradient), then made one of the pack's silhouettes:
//   head   its skull path (the biggest in HEAD, keyed: it squashes as it rolls) becomes the 👤 head
//          without a neck, fitted into that path's box key by key, a little bigger (Z.head_scale);
//   body   no shirt, but its shape: as wide as the arms, cut with them at the bottom, moving with
//          them; a neck instead of the collar, light rims on the shoulders (Z.body);
//   hands  the palm creases out (Z.creases: groups of the Wrist layers);
//   mouth  a white sad mouth (∩) that opens and shuts (Z.mouth: keys of its opening, 0…1).
// zombie(n, Z) → the animation. Z: motion.json → zombie.
import {execFileSync} from 'node:child_process'
import {rm} from 'node:fs/promises'
import {join} from 'node:path'
import {ROOT} from '../../../scripts/lib/sheets.mjs'
import {read,head,walk,group,stroke,gradient,style,rgb} from '../lib/silhouette.mjs'

const box=(p)=>{const xs=p.v.map((v)=>v[0]),ys=p.v.map((v)=>v[1]);return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]}
const first=(k)=>k.a?k.k[0].s[0]:k.k

export async function blueZombie(n,Z){
  const part=`zombie-stamp-${n}`
  execFileSync(process.execPath,[join(ROOT,'scripts/restyle.mjs'),`blue/${part}`],{stdio:'ignore'})
  const anim=await read(`exports/blue/${part}.tgs`)
  // only a part: not left among the drafts
  await rm(join(ROOT,`exports/blue/${part}.tgs`),{force:true})
  await rm(join(ROOT,`exports/sheets/blue-${part}.png`),{force:true})
  const by=(nm)=>anim.layers.find((l)=>l.nm===nm)

  // ---- head ----
  const HEAD=by('HEAD')
  const size=(sh)=>{const [x0,y0,x1,y1]=box(first(sh.ks));return (x1-x0)*(y1-y0)}
  const skull=walk(HEAD.shapes).filter((x)=>x.ty==='sh').sort((a,b)=>size(b)-size(a))[0]
  HEAD.shapes=head(skull.ks,{outline:8})
  const grow=(s)=>s.map((v,i)=>i<2?v*Z.head_scale/100:v)
  HEAD.ks.s=!HEAD.ks.s?{a:0,k:grow([100,100,100])}:HEAD.ks.s.a?{...HEAD.ks.s,k:HEAD.ks.s.k.map((k)=>({...k,s:grow(k.s)}))}:{...HEAD.ks.s,k:grow(HEAD.ks.s.k)}

  // ---- body: the shirt's own shape, a neck in place of its collar ----
  // The shirt is as wide as the arms and moves with them (both hang on NULL BODY), its lower
  // corners rounded away behind the hands: so it is kept, key by key; its V collar (the points
  // after the left shoulder) gives way to a neck up under the head. Outline open along the bottom.
  const B=Z.body,BODY=by('BODY')
  const shirt=walk(BODY.shapes.find((g)=>g.nm===B.shirt).it).find((x)=>x.ty==='sh').ks
  const torsoOf=(p)=>{
    const keep=p.v.slice(0,B.collar),[l,r]=[keep[B.collar-1],keep[0]]
    const v=[...keep,[l[0]+B.neck[0],l[1]-B.neck[1]],[r[0]-B.neck[0],r[1]-B.neck[1]]]
    const i=[...p.i.slice(0,B.collar),[0,0],[0,0]],o=[...p.o.slice(0,B.collar),[0,0],[0,0]]
    // the lower corners pulled in to the middle of the forearms, which always cover them
    for(const k of B.corners){v[k]=[Math.sign(v[k][0])*Math.min(Math.abs(v[k][0]),B.half),v[k][1]];i[k]=[0,0];o[k]=[0,0]}
    return {c:true,v,i,o}
  }
  // the same path, open: from just after the bottom edge round to just before it
  // the outline: from the left side up over the shoulders and down the right side, ending above
  // the bottom corners, behind the forearms
  const openOf=(p)=>{const n=p.v.length,ix=[...Array(n-B.skip)].map((_,k)=>(B.start+k)%n)
    return {c:false,v:ix.map((k)=>p.v[k]),i:ix.map((k)=>p.i[k]),o:ix.map((k)=>p.o[k])}}
  // the light rims: each shoulder's slope, neck to arm
  const rimOf=(p,[a,b])=>({c:false,v:[p.v[a],p.v[b]],i:[[0,0],p.i[b]],o:[p.o[a],[0,0]]})
  const keyed=(fn)=>shirt.a?{a:1,k:shirt.k.map((k)=>({...k,s:[fn(torsoOf(k.s[0]))],...(k.e&&{e:[fn(torsoOf(k.e[0]))]})}))}:{a:0,k:fn(torsoOf(shirt.k))}
  const [, , , bottom]=box(torsoOf(first(shirt))),top=Math.min(...torsoOf(first(shirt)).v.map((v)=>v[1]))
  BODY.shapes=[
    group('Плечи · блик',B.rims.map((pair)=>({ty:'sh',ks:keyed((p)=>rimOf(p,pair))})).concat([stroke(8,style.rim)])),
    group('Контур тела',[{ty:'sh',ks:keyed(openOf)},stroke(8)]),
    group('Тело',[{ty:'sh',ks:keyed((p)=>p)},gradient([0,bottom],[0,top])]),
  ]

  // ---- hands: no creases ----
  for(const [layer,paths] of Object.entries(Z.creases)){
    const l=by(layer)
    for(const p of paths){
      const names=p.split(' > '),owner=names.slice(0,-1).reduce((list,g)=>list.find((x)=>x.nm===g).it,l.shapes)
      owner.splice(owner.findIndex((x)=>x.nm===names[names.length-1]),1)
    }
  }

  // ---- mouth: white, sad, opening and shutting ----
  const M=Z.mouth,[cx,cy]=M.center,w=M.width/2
  const mouth=(open)=>{
    const h=M.closed+(M.open-M.closed)*open,arch=M.arch
    // top edge: an arch (corners low, middle high); bottom edge: the same arch h lower in the
    // middle, meeting it at the corners
    return {c:true,v:[[cx-w,cy+arch],[cx,cy],[cx+w,cy+arch],[cx,cy+h]],
      i:[[w*0.25,(h-arch)*0.6],[-w*0.5,0],[-w*0.2,-arch*0.8],[w*0.5,0]],
      o:[[w*0.2,-arch*0.8],[w*0.5,0],[-w*0.25,(h-arch)*0.6],[-w*0.5,0]]}
  }
  const MOUTH=by('Mouth')
  MOUTH.shapes=[group('Рот',[{ty:'sh',ks:{a:1,k:M.keys.map(([t,open],k)=>({t,s:[mouth(open)],
    ...(k<M.keys.length-1&&{o:{x:0.4,y:0},i:{x:0.6,y:1}})}))}},{ty:'fl',c:{a:0,k:[...rgb('#ffffff'),1]},o:{a:0,k:100},r:1}])]
  return anim
}
