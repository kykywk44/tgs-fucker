// Download every TGS in every gift model directory, with restart-safe caching.
// node scripts/download-gifts.mjs
import{mkdir,readFile,writeFile,rename}from'node:fs/promises'
import{join,resolve,relative}from'node:path'
import{gunzipSync}from'node:zlib'
import{createHash}from'node:crypto'
const ROOT=resolve(import.meta.dirname,'..'),DIR=join(ROOT,'library/gifts')
const CDN='https://cdn.changes.tg/gifts/models/',API='https://api.changes.tg/'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let pauseUntil=0
async function request(url){
 for(let attempt=0;attempt<6;attempt++){
  await sleep(Math.max(0,pauseUntil-Date.now()))
  try{
   const r=await fetch(url,{signal:AbortSignal.timeout(45000),headers:{'User-Agent':'TGS-Editor-Gift-Library/1.0'}})
   if(r.ok)return Buffer.from(await r.arrayBuffer())
   if(r.status===429||r.status>=500){const h=r.headers.get('retry-after'),sec=Number(h),wait=h?(Number.isFinite(sec)?sec*1000:Date.parse(h)-Date.now()):2000*2**attempt;pauseUntil=Math.max(pauseUntil,Date.now()+Math.max(1000,wait));await r.body?.cancel();continue}
   await r.body?.cancel();throw Object.assign(new Error(`HTTP ${r.status}: ${url}`),{permanent:true})
  }catch(e){if(e.permanent||attempt===5)throw e;await sleep(1000*2**attempt)}
 }throw new Error(`Retry limit: ${url}`)
}
const json=async url=>JSON.parse((await request(url)).toString())
async function pool(items,work,n=4){let cursor=0;await Promise.all(Array.from({length:n},async()=>{while(cursor<items.length){const i=cursor++;await work(items[i],i);await sleep(75)}}))}
const safe=name=>{if(typeof name!=='string'||!name||/[<>:"/\\|?*\x00-\x1f]/.test(name)||/[. ]$/.test(name)||name==='..'||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw new Error('Unsafe filename '+JSON.stringify(name));return name}
// Some remote models are named e.g. AC\DC; encode Windows-reserved characters
// losslessly while keeping the original display name in the catalog.
const localFile=name=>safe(name.replace(/[%<>:"/\\|?*\x00-\x1f]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase().padStart(2,'0')).replace(/[. ]+$/,s=>[...s].map(c=>'%'+c.charCodeAt(0).toString(16).toUpperCase()).join('')).replace(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?=\.|$)/i,s=>'%'+s.charCodeAt(0).toString(16).toUpperCase()+s.slice(1)))
function links(html,base){return[...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(m=>new URL(m[1].replaceAll('&amp;','&'),base)).filter(u=>u.origin===new URL(CDN).origin)}
function valid(bytes){if(bytes.length<20||bytes.length>8*1024*1024||bytes[0]!==31||bytes[1]!==139)throw new Error('Not a TGS gzip file');const a=JSON.parse(gunzipSync(bytes,{maxOutputLength:64*1024*1024}));if(!Array.isArray(a.layers)||!(a.fr>0))throw new Error('Invalid Lottie');return a}
async function atomic(path,value){const tmp=path+'.tmp';await writeFile(tmp,JSON.stringify(value));await rename(tmp,path)}
await mkdir(DIR,{recursive:true})
console.log('Источник: GiftChanges — https://api.changes.tg/; TGS сохраняются локально.')
const total=await json(API+'total'),apiGifts=await json(API+'gifts')
const rootHtml=(await request(CDN)).toString()
const folders=[...new Set(links(rootHtml,CDN).filter(u=>u.pathname.startsWith('/gifts/models/')&&u.pathname.endsWith('/')&&u.pathname.slice('/gifts/models/'.length).split('/').length===2).map(u=>safe(decodeURIComponent(u.pathname.split('/').at(-2)))))].sort()
if(!folders.length)throw new Error('Empty gift directory listing')
for(const gift of apiGifts)if(!folders.includes(gift))throw new Error('API gift missing from CDN folders: '+gift)
const catalog=[]
await pool(folders,async gift=>{
 const url=CDN+encodeURIComponent(gift)+'/',html=(await request(url)).toString()
 const files=[...new Set(links(html,url).filter(u=>u.pathname.startsWith(new URL(url).pathname)&&u.pathname.endsWith('.tgs')&&u.pathname.slice(new URL(url).pathname.length).split('/').length===1).map(u=>decodeURIComponent(u.pathname.split('/').at(-1))))].sort()
 if(!files.length)throw new Error('No TGS models for '+gift)
 for(const file of files)catalog.push({id:gift+'/'+file.slice(0,-4),gift,model:file.slice(0,-4),file:gift+'/'+localFile(file),url:url+encodeURIComponent(file)})
})
catalog.sort((a,b)=>a.file.localeCompare(b.file,'en'))
const metadata={source:CDN,api:API,attribution:'GiftChanges',fetchedAt:new Date().toISOString(),apiTotal:total,gifts:folders.length,expected:catalog.length,items:catalog}
await atomic(join(DIR,'catalog.pending.json'),metadata)
console.log(`Каталог: ${folders.length} подарков, ${catalog.length} TGS (включая Original.tgs в папках моделей).`)
let downloaded=0,cached=0,bytesTotal=0,finished=0;const errors=[]
await pool(catalog,async item=>{
 const target=resolve(DIR,'models',item.file)
 if(relative(DIR,target).startsWith('..'))throw new Error('Escaped gift directory')
 try{
  let bytes;try{bytes=await readFile(target);valid(bytes);cached++}catch{bytes=await request(item.url);valid(bytes);await mkdir(join(DIR,'models',item.gift),{recursive:true});const temp=target+'.part';await writeFile(temp,bytes);await rename(temp,target);downloaded++}
  item.bytes=bytes.length;item.sha256=createHash('sha256').update(bytes).digest('hex');bytesTotal+=bytes.length
 }catch(e){errors.push({file:item.file,error:String(e.message??e)})}
 finished++;if(finished%100===0||finished===catalog.length)console.log(`${finished}/${catalog.length}; новых ${downloaded}, кэш ${cached}, ошибок ${errors.length}`)
})
const result={...metadata,completedAt:new Date().toISOString(),downloaded,cached,bytes:bytesTotal,errors,complete:errors.length===0}
await atomic(join(DIR,'download-report.json'),result)
// Keep the last complete, working catalog while a later update is downloading.
if(result.complete)await atomic(join(DIR,'catalog.json'),result)
console.log(JSON.stringify({gifts:folders.length,models:catalog.length,downloaded,cached,MiB:Math.round(bytesTotal/1024/1024),errors:errors.length,complete:result.complete}))
if(errors.length){console.error(errors.slice(0,10));process.exitCode=1}
