import assert from 'node:assert/strict'
import{readFile,writeFile}from'node:fs/promises'
import{createHash}from'node:crypto'
import{read,walk,rgb}from'../lib/silhouette.mjs'
import{getShape}from'../clipboard/scene.mjs'
import{engine,ROOT,load}from'../../../scripts/lib/sheets.mjs'
import{join}from'node:path'
const source=await read('packs/blue/censorship-saw/source.tgs'),anim=await read('exports/blue/censorship-saw.tgs')
assert.equal(createHash('sha256').update(await readFile(join(ROOT,'packs/blue/censorship-saw/source.tgs'))).digest('hex'),'2c96b25629ee3a56151a19a94cd2fd252cf75fa5757c9af768ee18f701d4e03d','Original censpoop.tgs bytes')
for(const k of ['w','h','fr','ip','op'])assert.equal(anim[k],source[k])
for(const nm of ['MUHA','MUHA Stroke WIDE','Eyes L','Eye R','fiii','fiii 3','fiii 4','SHadow'])assert.ok(!anim.layers.some(l=>l.nm===nm))
const by=(a,n)=>a.layers.find(l=>l.nm===n)
for(const nm of ['Arm L','Arm R']){assert.equal(by(anim,nm).ty,3);assert.ok(!by(anim,nm).shapes)}
for(const l of anim.layers.filter(l=>l.ind<40)){
 const old=source.layers.find(p=>p.ind===l.ind);assert.ok(old);for(const k of ['ks','parent','ip','op','st','sr'])assert.deepEqual(l[k],old[k],`Original rig/timing ${l.nm}.${k}`)
}
for(const nm of ['Round','Red','White','Drops','Drops 2','Drops 3','Drops 4'])assert.deepEqual(by(anim,nm),by(source,nm),'Preserve sign/saw action '+nm)
function structure(items){return items.filter(p=>!['fl','gf','st','gs'].includes(p.ty)).map(p=>p.ty==='gr'?{...p,it:structure(p.it)}:p)}
for(const nm of ['rot','rot stroke','Teeth','SAW R','SAW Back','SAW Shadow'])assert.deepEqual(structure(by(anim,nm).shapes),structure(by(source,nm).shapes),'Original paths and group motion '+nm)
assert.deepEqual(structure(by(anim,'2 Hand L').shapes.filter(g=>g.nm!=='Синяя перемычка кисти')),structure(by(source,'2 Hand L').shapes),'Original moving fingers')
assert.deepEqual(walk(by(anim,'Hand L Shadow').shapes).filter(p=>p.ty==='sh'),walk(by(source,'Hand L Shadow').shapes).filter(p=>p.ty==='sh'),'Left cuff contour')
for(const p of walk(by(anim,'Hand L Shadow').shapes)){
 if(p.ty==='tr')assert.equal(p.o.k,100,'Opaque blue cuff, no white sign showing through')
 if(p.ty==='fl')assert.deepEqual(p.c.k,[...rgb('#6086a7'),1])
}
for(const p of walk(by(anim,'SAW Shadow').shapes).filter(p=>p.ty==='st'))assert.deepEqual(p.c.k,[...rgb('#335375'),1],'Right hand overlay uses blue outline')
const headPaths=walk(by(anim,'BODY').shapes).filter(p=>p.ty==='sh');assert.equal(headPaths.length,2)
const p=getShape(headPaths[1].ks,0);const extent=d=>Math.max(...p.v.map(v=>v[d]))-Math.min(...p.v.map(v=>v[d]))
assert.ok(Math.abs(extent(1)/extent(0)-421/314)<.005)
for(const f of [0,15,35,179])assert.deepEqual(getShape(headPaths[1].ks,f),p,'Restored front ears at '+f)
const side=getShape(headPaths[1].ks,25)
assert.ok(Math.abs(side.i[2][0])<Math.abs(p.i[2][0])*.1&&Math.abs(side.o[6][0])<Math.abs(p.o[6][0])*.1,'Ear bulges retract during turn')
const eng=await engine(),player=eng.create(JSON.stringify(anim))
assert.deepEqual(player.render(0,512,512).slice(),player.render(179,512,512).slice(),'Exact loop')
const face=structuredClone(anim),mouth=structuredClone(anim)
for(const l of face.layers)if(l.ty===4&&l.nm!=='BODY')l.shapes=[]
for(const l of mouth.layers)if(l.ty===4&&!['rot','rot stroke','Teeth'].includes(l.nm)&&!l.nm.startsWith('Face matte'))l.shapes=[]
const fp=eng.create(JSON.stringify(face)),mp=eng.create(JSON.stringify(mouth));let facePixels=0,mouthPixels=0
for(let f=0;f<180;f++){
 const full=player.render(f,256,256).slice(),face=fp.render(f,256,256).slice(),mouth=mp.render(f,256,256).slice()
 assert.ok(full.some((v,i)=>i%4===3&&v>0),'Empty frame '+f)
 let count=0;for(let i=3;i<face.length;i+=4){if(face[i])facePixels++;if(mouth[i]){assert.ok(face[i]>0,`Mouth outside head f${f}`);count++;mouthPixels++}}
 if([40,60,90,120,150].includes(f))assert.ok(count>30,'Mouth missing '+f)
}
player.drop();fp.drop();mp.drop()
const bytes=await readFile(join(ROOT,'exports/blue/censorship-saw.tgs'))
const {telegramChecks}=await load('src/core/checks.ts');assert.ok(telegramChecks(anim,bytes.length).every(c=>c.ok))
const report={sourceExact:true,sourceSha256:createHash('sha256').update(await readFile(join(ROOT,'packs/blue/censorship-saw/source.tgs'))).digest('hex'),frames:180,fps:60,bytes:bytes.length,rigAndActionExact:true,headRatio:extent(1)/extent(0),noFlyGasEyesOrArmLines:true,blueCuffAndRightOutline:true,earsRetractAndReturn:true,mouthInsideHeadEveryFrame:true,mouthPixels,facePixels,pixelExactLoop:true}
await writeFile(join(ROOT,'exports/censorship-saw/verification.json'),JSON.stringify(report,null,2)+'\n');console.log(report)
