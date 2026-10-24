// Local experiment for Telegram video stickers. Patches only the EBML Duration
// float, leaving every encoded frame and its timestamp intact. No network calls.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'

function vint(bytes,start,identifier=false){
 const first=bytes[start]
 assert.ok(first>0,'Invalid/truncated EBML variable integer')
 let length=1,mask=128
 while(!(first&mask)){length++;mask>>=1}
 assert.ok(length<=8&&start+length<=bytes.length,'Truncated EBML integer')
 let value=identifier?first:first&(mask-1),unknown=!identifier&&value===mask-1
 for(let i=1;i<length;i++){value=value*256+bytes[start+i];unknown=unknown&&bytes[start+i]===255}
 return {length,value,unknown}
}
function elements(bytes,start,end){
 const out=[]
 while(start<end){
  const id=vint(bytes,start,true),size=vint(bytes,start+id.length)
  const data=start+id.length+size.length,stop=size.unknown?end:data+size.value
  assert.ok(stop<=end&&stop>start,'EBML element exceeds its parent')
  out.push({id:id.value,data,end:stop,size:stop-data});start=stop
 }
 return out
}
export function durationElement(bytes){
 const segment=elements(bytes,0,bytes.length).find(e=>e.id===0x18538067)
 assert.ok(segment,'Missing WebM Segment')
 const info=elements(bytes,segment.data,segment.end).find(e=>e.id===0x1549a966)
 assert.ok(info,'Missing WebM Info')
 const fields=elements(bytes,info.data,info.end)
 // A CRC would become invalid after changing Duration. ffmpeg WebM has none.
 assert.ok(!fields.some(e=>e.id===0xbf),'Info CRC present; refusing an invalid patch')
 const duration=fields.find(e=>e.id===0x4489),scale=fields.find(e=>e.id===0x2ad7b1)
 assert.ok(duration&&(duration.size===4||duration.size===8),'Missing/invalid WebM Duration float')
 const nanoseconds=scale?bytes.readUIntBE(scale.data,scale.size):1_000_000
 const units=duration.size===8?bytes.readDoubleBE(duration.data):bytes.readFloatBE(duration.data)
 return {...duration,nanoseconds,seconds:units*nanoseconds/1e9}
}
export function spoofDuration(input,seconds=2.99){
 assert.ok(Number.isFinite(seconds)&&seconds>0&&seconds<=3,'Metadata duration must be in (0, 3] seconds')
 const out=Buffer.from(input),d=durationElement(out),value=seconds*1e9/d.nanoseconds
 if(d.size===8)out.writeDoubleBE(value,d.data);else out.writeFloatBE(value,d.data)
 return out
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [input,output,seconds='2.99']=process.argv.slice(2)
 assert.ok(input&&output,'Usage: node scripts/spoof-webm-duration.mjs input.webm output.webm [seconds=2.99]')
 const bytes=await readFile(input),out=spoofDuration(bytes,+seconds)
 await writeFile(output,out)
 console.log(`Metadata ${durationElement(bytes).seconds}s → ${durationElement(out).seconds}s; video packets unchanged`)
}
