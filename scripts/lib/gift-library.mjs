// Cached local thumbnails: rebuilding the blue pack never re-renders all gifts.
import{readFile,writeFile,mkdir,stat}from'node:fs/promises'
import{existsSync}from'node:fs'
import{join}from'node:path'
import{createHash}from'node:crypto'
import{Canvas,ROOT,encodePng}from'./sheets.mjs'
export async function giftLibrary({eng,readTgs,bestFrame}){
 const dir=join(ROOT,'library/gifts'),catalogFile=join(dir,'catalog.json')
 if(!existsSync(catalogFile))return null
 const catalog=JSON.parse(await readFile(catalogFile,'utf8'))
 if(!catalog.complete){console.log('gifts: download incomplete; run node scripts/download-gifts.mjs');return null}
 const groups=Map.groupBy(catalog.items,i=>i.gift),items=[]
 await mkdir(join(dir,'cache'),{recursive:true})
 let rendered=0,cached=0
 for(const[gift,models]of [...groups].sort(([a],[b])=>a.localeCompare(b,'en'))){
  const stamps=await Promise.all(models.map(async m=>{const s=await stat(join(dir,'models',m.file));return[m.file,s.size,s.mtimeMs]}))
  const hash=createHash('sha256').update(JSON.stringify(['v1',128,stamps])).digest('hex').slice(0,20),cacheFile=join(dir,'cache',hash+'.json')
  let cachedItems
  try{cachedItems=JSON.parse(await readFile(cacheFile,'utf8'));if(!cachedItems.every(i=>existsSync(join(ROOT,'library/thumbs',i.sprite))))cachedItems=null}catch{/* new or changed gift */}
  if(cachedItems){items.push(...cachedItems);cached++;continue}
  const giftItems=[],count=100,cols=10,size=128
  for(let start=0;start<models.length;start+=count){const batch=models.slice(start,start+count),sprite=`gifts-${hash}-${start/count}.png`,canvas=new Canvas(cols*size,Math.ceil(batch.length/cols)*size);canvas.px.fill(0)
   for(const[cell,m]of batch.entries()){
    const bytes=await readFile(join(dir,'models',m.file)),anim=await readTgs(new Uint8Array(bytes)),player=eng.create(JSON.stringify(anim))
    if(!player)throw new Error('Gift cannot render: '+m.file)
    try{const rgba=player.render(bestFrame(player),size,size);for(let y=0;y<size;y++)canvas.px.set(rgba.subarray(y*size*4,(y+1)*size*4),((Math.floor(cell/cols)*size+y)*canvas.width+cell%cols*size)*4)
     giftItems.push({id:m.id,file:m.file,nm:m.model,gift:m.gift,model:m.model,kb:Math.round(bytes.length/102.4)/10,frames:player.frameCount,sprite,cell})
    }finally{player.drop()}
   }
   await writeFile(join(ROOT,'library/thumbs',sprite),encodePng(canvas.px,canvas.width,canvas.height))
  }
  await writeFile(cacheFile,JSON.stringify(giftItems));items.push(...giftItems);rendered++
  if(rendered%10===0)console.log(`gifts: ${rendered} gift sheets rendered, ${cached} cached`)
 }
 console.log(`gifts: ${groups.size} gifts, ${items.length} TGS; ${rendered} rendered, ${cached} cached`)
 // One small sprite of all covers for the overview: otherwise each card pulls its gift's whole sheet (~1 MB).
 const reps=[...Map.groupBy(items,i=>i.gift)].sort(([a],[b])=>a.localeCompare(b,'en')).map(([,ms])=>ms.find(m=>m.model==='Original')??ms[0])
 const cols=10,size=128,coverHash=createHash('sha256').update(JSON.stringify(['covers-v1',size,reps.map(r=>[r.file,r.sprite])])).digest('hex').slice(0,20),coverSprite=`gifts-covers-${coverHash}.png`
 if(!existsSync(join(ROOT,'library/thumbs',coverSprite))){
  const canvas=new Canvas(cols*size,Math.ceil(reps.length/cols)*size);canvas.px.fill(0)
  for(const[cell,r]of reps.entries()){const player=eng.create(JSON.stringify(await readTgs(new Uint8Array(await readFile(join(dir,'models',r.file))))))
   try{const rgba=player.render(bestFrame(player),size,size);for(let y=0;y<size;y++)canvas.px.set(rgba.subarray(y*size*4,(y+1)*size*4),((Math.floor(cell/cols)*size+y)*canvas.width+cell%cols*size)*4)}finally{player.drop()}}
  await writeFile(join(ROOT,'library/thumbs',coverSprite),encodePng(canvas.px,canvas.width,canvas.height))
 }
 const covers=Object.fromEntries(reps.map((r,cell)=>[r.gift,{id:r.id,sprite:coverSprite,cell}]))
 return{id:'gifts',title:'Подарки',dir:'library/gifts/models',items,covers}
}
