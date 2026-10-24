import {readFile} from 'node:fs/promises'
import {join,resolve,sep} from 'node:path'
import {createRequire} from 'node:module'
import opentype from 'opentype.js'
import {ROOT} from '../../../scripts/lib/sheets.mjs'
export async function textOptions(cfg){
 const jobArg=process.argv.find(a=>a.startsWith('--job='))?.slice(6)
 let job=null
 if(jobArg){
  job=resolve(jobArg);if(!job.startsWith(resolve(ROOT,'exports/photo-custom')+sep))throw Error('Invalid job folder')
  const data=JSON.parse(await readFile(join(job,'input.json'),'utf8'))
  cfg.text=String(data.text).normalize('NFC').trim().toUpperCase()
  if(!cfg.text||[...cfg.text].length>32)throw Error('Введите от 1 до 32 символов.')
 }
 const require=createRequire(import.meta.url),fonts=[]
 for(const subset of ['cyrillic','latin','latin-ext']){
  const b=await readFile(join(require.resolve('@fontsource/roboto/LICENSE'),'..','files',`roboto-${subset}-900-normal.woff`))
  fonts.push(opentype.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)))
 }
 const fontFor=char=>{const font=fonts.find(f=>f.charToGlyphIndex(char));if(!font)throw Error(`Нет символа «${char}» в шрифте. Используй кириллицу, латиницу, цифры и знаки.`);return font}
 return {job,fontFor}
}
