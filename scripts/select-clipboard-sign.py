from pathlib import Path
exec(Path('scripts/publish-clipboard-webm.py').read_text('utf-8-sig').split('def main():')[0])
logpath=folder/'sign-selection.json'; log=json.loads(logpath.read_text('utf-8')) if logpath.exists() else {}
try:
 for kind,name,size in [('emoji','blues_emoji_by_jhthkjbot',100),('sticker','blues_stickers_by_jhthkjbot',512)]:
  if log.get(name,{}).get('verified'): print(name,'already replaced',flush=True);continue
  old=receipt['items'][name]; live=call('getStickerSet',{'name':name}); targets=[(i,s) for i,s in enumerate(live['stickers']) if s['file_unique_id']==old['sticker']['file_unique_id']]
  assert len(targets)==1,'Old sticker not found uniquely; no mutation'
  pos,prior=targets[0]; path=ROOT/'exports/clipboard-selected'/f'clipboard-{kind}-6s-spoof.webm';data=path.read_bytes(); digest=hashlib.sha256(data).hexdigest()
  record=log.setdefault(name,{'before_count':len(live['stickers']),'position':pos,'old_sticker':prior,'hash':digest})
  if not record.get('upload'):
   record['upload']=call('uploadStickerFile',{'user_id':owner,'sticker_format':'video'},(path.name,data));logpath.write_text(json.dumps(log,indent=2),'utf-8')
  assert not record.get('attempted'),'An uncertain replacement needs reconciliation'
  record['attempted']=True;logpath.write_text(json.dumps(log,indent=2),'utf-8')
  call('replaceStickerInSet',{'user_id':owner,'name':name,'old_sticker':prior['file_id'],'sticker':{'sticker':record['upload']['file_id'],'format':'video','emoji_list':['📝']}})
  after=call('getStickerSet',{'name':name});assert len(after['stickers'])==len(live['stickers']),'Set size changed'
  actual=after['stickers'][pos];assert actual['width']==size and actual['height']==size and actual['is_video']
  f=call('getFile',{'file_id':actual['file_id']})
  try:
   with urllib.request.urlopen(f"https://api.telegram.org/file/bot{token}/{f['file_path']}",timeout=60) as response: remote=response.read()
  except Exception: raise RuntimeError('Verification download failed') from None
  assert hashlib.sha256(remote).hexdigest()==digest,'Downloaded replacement differs'
  record.update(verified=True,sticker=actual);logpath.write_text(json.dumps(log,indent=2),'utf-8')
  old.update(file=str(path),hash=digest,upload=record['upload'],sticker=actual,verified=True);save()
  print(name,'REPLACED; count',len(after['stickers']),'position',pos,'bytes unchanged',flush=True)
except Exception as e:
 print(type(e).__name__,str(e).replace(token,'[REDACTED]'));raise SystemExit(1)

