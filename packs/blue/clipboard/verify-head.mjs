import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {read,walk,at} from '../lib/silhouette.mjs';
import {engine} from '../../../scripts/lib/sheets.mjs';
const eng=await engine(),out=[];
for(const file of ['exports/blue/clipboard.tgs','exports/blue/clipboard-6s-preview.tgs']){
 const a=await read(file),head=a.layers.find(l=>l.nm==='HEAD');
 const p=walk(head.shapes).filter(s=>s.ty==='sh').at(-1),v=at(p.ks,0),s=v.v?v:v[0],extent=d=>Math.max(...s.v.map(p=>p[d]))-Math.min(...s.v.map(p=>p[d]));
 assert.ok(Math.abs(extent(1)/extent(0)-1.341)<.005);
 for(const l of [...a.layers,...a.assets.flatMap(x=>x.layers??[])])if(l.ty===4&&l!==head)l.shapes=[];
 for(const l of a.layers)if(l.parent==null)l.parent=999;
 a.layers.push({ty:3,ind:999,ip:0,op:a.op,ks:{p:{a:0,k:[128,128]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}}});a.w=a.h=768;
 const pl=eng.create(JSON.stringify(a));let minX=768,minY=768,maxX=0,maxY=0;
 for(let f=0;f<a.op;f++){const px=pl.render(f,768,768);for(let i=0;i<768*768;i++)if(px[4*i+3]>0){const x=i%768,y=Math.floor(i/768);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}
 pl.drop();assert.ok(minX>=136&&minY>=136&&maxX<=631&&maxY<=631,JSON.stringify({file,minX,minY,maxX,maxY}));out.push({file,frames:a.op,headBounds:[minX-128,minY-128,maxX-128,maxY-128],ratio:extent(1)/extent(0)});
}
await writeFile('exports/clipboard-6s/head-bounds.json',JSON.stringify(out,null,2));console.log(out);

