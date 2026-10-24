"""User-authorized hand replacements in both existing blue sets, with exact-byte receipts.
Prepare is read-only; --apply uses the reviewed local plan, never sends chat messages.
"""
import gzip, hashlib, importlib.util, json, os, sys, time, urllib.request, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('hands_bot',ROOT/'scripts/telegram-pack-bot-v2.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.v1.load_env(ROOT/'.env');token=os.environ['TELEGRAM_BOT_TOKEN'].strip();bot_id=token.split(':',1)[0]
state=json.loads((ROOT/f'exports/telegram-bot/{bot_id}.json').read_text('utf-8'));owner=int(os.getenv('TELEGRAM_OWNER_ID') or 1336169515)
names=['blues_emoji_by_jhthkjbot','blues_stickers_by_jhthkjbot']
api=m.API(token,5);api.transfer=m.Pacer(5,{'next_at':state.get('throttle',{}).get('blocked_until',0)})
m.HEAVY.add('replaceStickerInSet')
api.wait_notice=lambda method,seconds:print(f'Telegram cooldown {method}: {seconds}s',flush=True)
folder=ROOT/'exports/hand-publication';folder.mkdir(parents=True,exist_ok=True)
planfile=folder/'plan.json';resultfile=folder/'result.json'
digest=lambda data:hashlib.sha256(data).hexdigest()
def save(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n','utf-8')
control_unavailable=False
def idle():
 global control_unavailable
 key=os.environ.get('BOT_CONTROL_TOKEN','');port=os.environ.get('BOT_CONTROL_PORT','8790')
 if not key:raise RuntimeError('Missing bot control credential; no mutation')
 req=urllib.request.Request(f'http://127.0.0.1:{port}/status',headers={'Authorization':'Bearer '+key})
 try:
  if control_unavailable:raise ConnectionError()
  with urllib.request.urlopen(req,timeout=5) as r:s=json.load(r)
 except Exception:
  # If the local service is stopped, confirm the actual publisher process is
  # absent. Never start/kill it, and never expose command lines or credentials.
  command="$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^python(w)?\\.exe$' -and $_.CommandLine -match 'telegram-pack-bot(?:-v2)?\\.py' }).Count"
  try:count=int(subprocess.check_output(['powershell','-NoProfile','-Command',command],text=True,creationflags=subprocess.CREATE_NO_WINDOW).strip())
  except Exception:raise RuntimeError('Cannot confirm absence of local publisher; no mutation') from None
  if count:raise RuntimeError('Local bot process exists but control status unavailable; no mutation')
  if not control_unavailable:print('Control service stopped; confirmed no local publisher process.',flush=True)
  control_unavailable=True;return
 if s.get('running') or s.get('busy'):raise RuntimeError('Bot is currently publishing; leave its process untouched')
def skeleton(x):
 if isinstance(x,list):return [skeleton(v) for v in x]
 if not isinstance(x,dict):return x
 return {k:skeleton(v) for k,v in x.items() if not(x.get('ty') in ('fl','st','gf','gs') and k in ('c','g','o'))}
def geom(data):return digest(json.dumps(skeleton(json.loads(gzip.decompress(data))),sort_keys=True,separators=(',',':')).encode())
def duplicate_version(item,key,number):
 # Some old sets already contain several colour revisions of the same L.
 # Retain those slots without hitting Telegram's identical-file constraint:
 # gzip headers differ, decoded Lottie/appearance/animation remain identical.
 data=gzip.compress(gzip.decompress(Path(item['path']).read_bytes()),compresslevel=9,mtime=number+1)
 path=folder/(key.replace('#','-copy')+'.tgs');path.write_bytes(data)
 return {**item,'path':str(path),'hash':digest(data),'size':len(data),'add':False,'base':item['name']}
def download(s):
 path=folder/(s['file_unique_id']+'.tgs')
 if not path.exists():path.write_bytes(m.download(api,s['file_id']))
 return path.read_bytes()
def files():
 changed=json.loads((ROOT/'exports/hand-highlights-report.json').read_text('utf-8'));items={}
 emoji={line.split()[0]:line.split()[1] for line in (ROOT/'packs/blue/emoji.txt').read_text('utf-8-sig').splitlines() if line.strip() and not line.startswith('#') and len(line.split())>=2}
 for row in changed:
  if not row.get('changed') or not row['file'].startswith('packs/blue/ready/'):continue
  name=Path(row['file']).stem;new=ROOT/row['file'];old=ROOT/'exports/hand-highlights-before/ready'/new.name
  a,b=old.read_bytes(),new.read_bytes();assert geom(a)==geom(b)
  items[name]={'name':name,'path':str(new),'old_hash':digest(a),'hash':digest(b),'old_size':len(a),'size':len(b),'geometry':geom(b),'emoji':emoji[name]}
 p=ROOT/'packs/blue/ready/pinching-hand.tgs';b=p.read_bytes();items['pinching-hand']={'name':'pinching-hand','path':str(p),'hash':digest(b),'size':len(b),'geometry':geom(b),'emoji':'🤏','add':True}
 return items

def prepare():
 idle();items=files();hashes={v[k]:v['name'] for v in items.values() for k in ('hash','old_hash') if k in v};geometry={v['geometry']:v['name'] for v in items.values()};sizes={v[k] for v in items.values() for k in ('size','old_size') if k in v}
 plan={'bot_id':bot_id,'owner':owner,'items':items,'sets':[]}
 for name in names:
  assert state['sets'][name]['owner']==owner
  live=api.call('getStickerSet',{'name':name});save(folder/('live-'+name+'.json'),live);matches={};seen=set();counts={}
  def scan(candidates):
   for index,s in candidates:
    if not s.get('is_animated') or s['file_unique_id'] in seen:continue
    seen.add(s['file_unique_id']);data=download(s);h=digest(data);key=hashes.get(h) or geometry.get(geom(data))
    if key:
     base=key;number=counts.get(base,0);counts[base]=number+1
     if number:
      key=base+'#'+str(number+1)
      if key not in plan['items']:plan['items'][key]=duplicate_version(items[base],key,number)
     matches[key]={'position':index,'old_uid':s['file_unique_id'],'old_file_id':s['file_id'],'old_hash':h,'emoji':s.get('emoji') or items[base]['emoji'],'current':h==plan['items'][key]['hash']}
  scan([(i,s) for i,s in enumerate(live['stickers']) if s.get('file_size') in sizes])
  scan(list(enumerate(live['stickers'])))
  record={'name':name,'count':len(live['stickers']),'uids':[s['file_unique_id'] for s in live['stickers']],'matches':matches,'missing':[k for k in items if k not in matches and k!='pinching-hand' and 'base' not in items[k]]}
  plan['sets'].append(record);save(planfile,plan)
  print(name,': count',record['count'],'matched',len(matches),'missing',record['missing'],'multiple versions',{k:v for k,v in counts.items() if v>1},'new149', 'present' if 'pinching-hand' in matches else 'to add',flush=True)
 print('Prepared exact hand matches; no Telegram changes yet.',flush=True)

def apply():
 plan=json.loads(planfile.read_text('utf-8'));assert plan['bot_id']==bot_id and plan['owner']==owner
 log=json.loads(resultfile.read_text('utf-8')) if resultfile.exists() else {'bot_id':bot_id,'owner':owner,'uploads':{},'sets':{}}
 for name,item in plan['items'].items():assert digest(Path(item['path']).read_bytes())==item['hash'],'Local file changed: '+name
 idle()
 # One upload is shared between the two sets. No append operation for an existing hand.
 for j,(key,item) in enumerate(plan['items'].items()):
  idle();pending=[]
  for record in plan['sets']:
   match=record['matches'].get(key);setlog=log['sets'].setdefault(record['name'],{})
   if setlog.get(key,{}).get('verified'):continue
   if match and match['current']:setlog[key]={'verified':True,'already_current':True};continue
   if match or item.get('add'):pending.append((record,match))
  if not pending:save(resultfile,log);continue
  if item['hash'] not in log['uploads']:
   log['uploads'][item['hash']]=api.call('uploadStickerFile',{'user_id':owner,'sticker_format':'animated'},file=(key+'.tgs',Path(item['path']).read_bytes()));save(resultfile,log)
  uploaded=log['uploads'][item['hash']]
  for record,match in pending:
   idle();name=record['name'];entry=log['sets'][name].setdefault(key,{})
   if entry.get('attempted'):
    live=api.call('getStickerSet',{'name':name});candidate=[s for s in live['stickers'] if s.get('is_animated') and s.get('file_size')==item['size'] and digest(download(s))==item['hash']]
    if len(candidate)==1:entry.update(verified=True,sticker=candidate[0],reconciled=True);save(resultfile,log);continue
    raise RuntimeError('Uncertain prior mutation; inspect receipt before retry: '+name+'/'+key)
   entry.update(attempted=True,operation='replace' if match else 'add');save(resultfile,log)
   sticker={'sticker':uploaded['file_id'],'format':'animated','emoji_list':[match['emoji'] if match else item['emoji']]}
   if match:api.call('replaceStickerInSet',{'user_id':owner,'name':name,'old_sticker':match['old_file_id'],'sticker':sticker})
   else:api.call('addStickerToSet',{'user_id':owner,'name':name,'sticker':sticker})
   entry.update(acknowledged=True);save(resultfile,log)
  print(f'{j+1}/{len(plan["items"])} {key}: applied to {len(pending)} sets',flush=True)
 # Verify counts, unchanged positions/other stickers, exact downloaded new bytes.
 for record in plan['sets']:
  name=record['name'];live=api.call('getStickerSet',{'name':name});added=1 if 'pinching-hand' not in record['matches'] else 0
  assert len(live['stickers'])==record['count']+added,'Unexpected count change'
  changed_positions={v['position'] for v in record['matches'].values() if not v['current']}
  for i,uid in enumerate(record['uids']):
   if i not in changed_positions:assert live['stickers'][i]['file_unique_id']==uid,'An unrelated sticker moved'
  for key,item in plan['items'].items():
   match=record['matches'].get(key)
   if not match and not item.get('add'):continue
   pos=match['position'] if match else len(live['stickers'])-1;s=live['stickers'][pos]
   assert digest(download(s))==item['hash'],name+'/'+key+': downloaded bytes differ'
   log['sets'][name][key].update(verified=True,position=pos,sticker=s);save(resultfile,log)
  print(name,'VERIFIED',len(live['stickers']),'items; replacements keep positions',flush=True)
 log['complete']=True;save(resultfile,log)
 # Importable upload receipts for a future bot restart; live state remains untouched.
 for h,file in log['uploads'].items():save(ROOT/f'exports/telegram-bot/receipts/hand-{h[:16]}.json',{'bot_id':bot_id,'owner':owner,'hash':h,'file':file})
try:
 if '--apply' in sys.argv:apply()
 else:prepare()
except Exception as e:
 print(type(e).__name__,str(e).replace(token,'[REDACTED]'),flush=True);raise SystemExit(1)
