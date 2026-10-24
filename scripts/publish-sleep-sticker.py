"""Publish only the user-approved15s dozing clipboard to both existing blue sets."""
from pathlib import Path
# Reuse the proven credential/ownership/pacing/idle helpers, without running hand jobs.
exec(compile(Path('scripts/publish-hand-updates.py').read_text('utf-8-sig').split('\ndef skeleton')[0],__file__,'exec'))
import secrets,urllib.error
folder=ROOT/'exports/clipboard-sleep';receiptfile=folder/'telegram-publication.json'
receipt=json.loads(receiptfile.read_text('utf-8')) if receiptfile.exists() else {'bot_id':bot_id,'owner':owner,'items':{}}
assert receipt['bot_id']==bot_id and receipt['owner']==owner
api.transfer=m.Pacer(8)
def persist():save(receiptfile,receipt)
def upload(path):
 data=path.read_bytes()
 for attempt in range(5):
  api.transfer.before();boundary='tg'+secrets.token_hex(16);parts=[]
  for k,v in {'user_id':owner,'sticker_format':'video'}.items():parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
  parts.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="sticker"; filename="{path.name}"\r\nContent-Type: video/webm\r\n\r\n'.encode(),data,f'\r\n--{boundary}--\r\n'.encode()])
  req=urllib.request.Request(f'https://api.telegram.org/bot{token}/uploadStickerFile',data=b''.join(parts),headers={'Content-Type':'multipart/form-data; boundary='+boundary})
  try:
   with urllib.request.urlopen(req,timeout=90) as r:result=json.load(r)
  except urllib.error.HTTPError as e:
   try:result=json.loads(e.read())
   except Exception:raise RuntimeError('Upload HTTP error') from None
  except Exception:raise RuntimeError('Upload network error; receipt preserved') from None
  if result.get('ok'):api.transfer.success();return result['result']
  if result.get('error_code')==429:
   api.rate_limited('uploadStickerFile',int(result.get('parameters',{}).get('retry_after',5))+1);continue
  raise RuntimeError('uploadStickerFile: '+result.get('description','error'))
 raise RuntimeError('Upload retries exhausted; receipt preserved')
def matching(live,item):
 for s in live['stickers']:
  if s.get('is_video') and s.get('file_size')==item['bytes'] and s['width']==item['size'] and digest(m.download(api,s['file_id']))==item['sha256']:return s
 return None
try:
 idle();me=api.call('getMe');assert str(me['id'])==bot_id
 manifest=json.loads((folder/'telegram-files.json').read_text('utf-8'))
 for item in manifest:
  name='blues_emoji_by_jhthkjbot' if item['kind']=='emoji' else 'blues_stickers_by_jhthkjbot';path=Path(item['file'])
  assert state['sets'][name]['owner']==owner;assert digest(path.read_bytes())==item['sha256']
  record=receipt['items'].setdefault(name,{'hash':item['sha256'],'file':str(path),'emoji':['📝','😴']});assert record['hash']==item['sha256']
  if record.get('verified'):print(name,'already verified',flush=True);continue
  idle();live=api.call('getStickerSet',{'name':name});assert live['sticker_type']==('custom_emoji' if item['kind']=='emoji' else 'regular')
  if 'before_count' not in record:
   record.update(before_count=len(live['stickers']),before_uids=[s['file_unique_id'] for s in live['stickers']]);persist()
  found=matching(live,item)
  if found:
   record.update(added=True,sticker=found,preexisting=len(live['stickers'])==record['before_count']);persist()
  if not record.get('added'):
   if record.get('attempted'):raise RuntimeError('Prior add uncertain; no duplicate retry: '+name)
   if not record.get('upload'):
    idle();record['upload']=upload(path);persist();print(name,'uploaded',item['bytes'],'bytes',flush=True)
   idle();record['attempted']=True;persist()
   api.call('addStickerToSet',{'user_id':owner,'name':name,'sticker':{'sticker':record['upload']['file_id'],'format':'video','emoji_list':record['emoji']}})
   record['added']=True;persist()
  after=api.call('getStickerSet',{'name':name});expected=record['before_count']+(0 if record.get('preexisting') else 1)
  assert len(after['stickers'])==expected,'Unexpected set count'
  assert [s['file_unique_id'] for s in after['stickers'][:record['before_count']]]==record['before_uids'],'Unrelated positions changed'
  actual=matching(after,item);assert actual,'Downloaded video differs'
  record.update(verified=True,sticker=actual,count=len(after['stickers']),position=next(i for i,s in enumerate(after['stickers']) if s['file_unique_id']==actual['file_unique_id']),server_bytes_unchanged=True);persist()
  print(name,'ADDED AND VERIFIED',item['size'],'count',record['count'],flush=True)
 receipt['complete']=True;persist()
except Exception as e:
 persist();print(type(e).__name__,str(e).replace(token,'[REDACTED]'),flush=True);raise SystemExit(1)
