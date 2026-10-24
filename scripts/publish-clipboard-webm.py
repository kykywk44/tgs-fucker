"""Add the two user-approved 6s clipboard WebMs. Never sends chat messages or edits live bot state."""
import hashlib, importlib.util, json, os, secrets, time, urllib.request, urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('publisher',ROOT/'scripts/telegram-pack-bot.py')
v1=importlib.util.module_from_spec(spec);spec.loader.exec_module(v1)
v1.load_env(ROOT/'.env')
token=os.environ['TELEGRAM_BOT_TOKEN'].strip()
owner=int(os.environ.get('TELEGRAM_OWNER_ID') or 1336169515)
folder=ROOT/'exports/clipboard-6s'; receipt_file=folder/'telegram-publication.json'
receipt=json.loads(receipt_file.read_text('utf-8')) if receipt_file.exists() else {'items':{}}
def save(): receipt_file.write_text(json.dumps(receipt,ensure_ascii=False,indent=2),'utf-8')
def call(method,params,file=None):
    if file:
        boundary='tg'+secrets.token_hex(16); parts=[]
        for k,v in params.items(): parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        name,data=file
        parts.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="sticker"; filename="{name}"\r\nContent-Type: video/webm\r\n\r\n'.encode(),data,f'\r\n--{boundary}--\r\n'.encode()])
        body=b''.join(parts);ctype='multipart/form-data; boundary='+boundary
    else: body=json.dumps(params).encode();ctype='application/json'
    req=urllib.request.Request(f'https://api.telegram.org/bot{token}/{method}',data=body,headers={'Content-Type':ctype})
    try:
        with urllib.request.urlopen(req,timeout=90) as r: result=json.load(r)
    except urllib.error.HTTPError as e:
        try: result=json.loads(e.read())
        except Exception: raise RuntimeError(f'{method}: HTTP {e.code}') from None
    except Exception: raise RuntimeError(f'{method}: network error; receipts preserved') from None
    if not result.get('ok'): raise RuntimeError(f"{method}: {result.get('description')} retry_after={result.get('parameters',{}).get('retry_after')}")
    time.sleep(3)
    return result['result']
def main():
    # Read the running bot's status without changing its process or state.
    control=os.environ.get('BOT_CONTROL_TOKEN','')
    if control:
        req=urllib.request.Request('http://127.0.0.1:'+os.environ.get('BOT_CONTROL_PORT','8790')+'/status',headers={'Authorization':'Bearer '+control})
        try:
            with urllib.request.urlopen(req,timeout=5) as r: status=json.load(r)
            print('Bot status:',json.dumps(status,ensure_ascii=False),flush=True)
            if status.get('running') or status.get('busy'): raise RuntimeError('Bot busy; no Telegram changes made')
        except urllib.error.URLError: pass
    me=call('getMe',{});receipt['bot_id']=me['id']
    for kind,name,size in [('emoji','blues_emoji_by_jhthkjbot',100),('sticker','blues_stickers_by_jhthkjbot',512)]:
        path=folder/f'clipboard-{kind}-6s-spoof.webm'; data=path.read_bytes();digest=hashlib.sha256(data).hexdigest()
        record=receipt['items'].setdefault(name,{'hash':digest,'file':str(path),'emoji':['📝']})
        assert record['hash']==digest,'File changed since prior upload'
        existing=call('getStickerSet',{'name':name})
        assert existing['sticker_type']==('custom_emoji' if kind=='emoji' else 'regular')
        if record.get('verified'): print(name,'already verified',flush=True);continue
        if not record.get('upload'):
            record['upload']=call('uploadStickerFile',{'user_id':owner,'sticker_format':'video'},(path.name,data));save()
            print(name,'uploaded',flush=True)
        upload=record['upload']
        if not record.get('added'):
            # On an uncertain add response, reconcile the live set by downloaded bytes before retrying.
            found=None
            for s in existing['stickers']:
                if s.get('file_size')!=len(data) or not s.get('is_video'): continue
                f=call('getFile',{'file_id':s['file_id']})
                try:
                    with urllib.request.urlopen(f"https://api.telegram.org/file/bot{token}/{f['file_path']}",timeout=60) as r: remote=r.read()
                except Exception: raise RuntimeError('getFile: download failed') from None
                if hashlib.sha256(remote).hexdigest()==digest: found=s;break
            if found: record['added']=True;record['sticker']=found;save()
            else:
                record['before_count']=len(existing['stickers']);save()
                call('addStickerToSet',{'user_id':owner,'name':name,'sticker':{'sticker':upload['file_id'],'format':'video','emoji_list':['📝']}})
                record['added']=True;save()
        actual=call('getStickerSet',{'name':name})
        matches=[s for s in actual['stickers'] if s.get('is_video') and s['width']==size and s['height']==size and s.get('file_size')==len(data)]
        assert matches,'Added video missing from live set'
        s=record.get('sticker') or matches[-1]
        f=call('getFile',{'file_id':s['file_id']})
        try:
            with urllib.request.urlopen(f"https://api.telegram.org/file/bot{token}/{f['file_path']}",timeout=60) as r: remote=r.read()
        except Exception: raise RuntimeError('getFile: verification download failed') from None
        assert hashlib.sha256(remote).hexdigest()==digest,'Server changed video bytes'
        record.update(verified=True,sticker=s,count=len(actual['stickers']),server_bytes_unchanged=True)
        save();print(name,'ADDED AND VERIFIED',size,'count',len(actual['stickers']),flush=True)
try: main()
except Exception as e:
    save();print(str(e).replace(token,'[REDACTED]'),flush=True);raise SystemExit(1)
