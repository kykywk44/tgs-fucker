"""Send requested generated stickers individually through the configured bot; never change a set."""
import hashlib,importlib.util,json,os,secrets,urllib.request,urllib.error,argparse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('bot_env',ROOT/'scripts/telegram-pack-bot.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);mod.load_env(ROOT/'.env')
token=os.environ['TELEGRAM_BOT_TOKEN'].strip()
parser=argparse.ArgumentParser();parser.add_argument('--job',type=Path);args=parser.parse_args()
folder=ROOT/'exports/photo-devices'
if args.job:
    folder=args.job.resolve()
    assert folder.parent==(ROOT/'exports/photo-custom').resolve(),'Invalid job folder'
receipt_path=folder/'telegram-receipts.json'
receipts=json.loads(receipt_path.read_text()) if receipt_path.exists() else {}
def save():receipt_path.write_text(json.dumps(receipts,ensure_ascii=False,indent=2),'utf8')
def request(method,body,ctype):
    req=urllib.request.Request(f'https://api.telegram.org/bot{token}/{method}',data=body,headers={'Content-Type':ctype})
    try:
        with urllib.request.urlopen(req,timeout=60) as r:return json.load(r)
    except urllib.error.HTTPError as e:return json.loads(e.read())
    except Exception:raise RuntimeError('Network error; outcome uncertain, inspect receipts before retry') from None
def main():
    me=request('getMe',b'{}','application/json')
    assert me.get('ok'),'Cannot identify configured bot'
    state_path=ROOT/f"exports/telegram-bot/{me['result']['id']}.json"
    state=json.loads(state_path.read_text('utf8')) if state_path.exists() else {}
    owner=int(os.getenv('TELEGRAM_OWNER_ID') or state.get('owner') or 0)
    assert owner,'Bot owner not configured'
    names=[('laptop-photo-556','💻'),('printer-photo-558','🖨'),('phone-photo-554','📱'),('painting-photo-606','🖼'),('id-photo-573','🪪'),('letter-photo-621','💌'),('ballot-photo-632','🗳'),('flag-photo-950','🏳'),('barrel','🛢'),('stas-704','🚼')]
    names.extend([('egg-photo-255','🐣'),('hat-photo-222','🎩')])
    if args.job:names=[(n,e) for n,e in names if (folder/f'{n}.webm').is_file() or (folder/f'{n}.tgs').is_file()]
    else:names=names[:2]
    assert names,'No generated sticker'
    for name,emoji in names:
        animated=name in ['barrel','stas-704']
        path=folder/f"{name}.{'tgs' if animated else 'webm'}";data=path.read_bytes();digest=hashlib.sha256(data).hexdigest()
        old=receipts.get(name,{})
        if old.get('message_id'):
            assert old['hash']==digest,'Already sent file changed'
            print(name,'already sent');continue
        assert not old.get('attempted'),'Previous outcome uncertain; no duplicate sent'
        boundary='tg'+secrets.token_hex(16);parts=[]
        for k,v in {'chat_id':owner,'emoji':emoji}.items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        mime='application/x-tgsticker' if animated else 'video/webm'
        parts.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="sticker"; filename="{path.name}"\r\nContent-Type: {mime}\r\n\r\n'.encode(),data,f'\r\n--{boundary}--\r\n'.encode()])
        receipts[name]={'hash':digest,'attempted':True};save()
        result=request('sendSticker',b''.join(parts),'multipart/form-data; boundary='+boundary)
        if not result.get('ok'):
            receipts[name]['attempted']=False;save()
            raise RuntimeError(str(result.get('description','Telegram rejected sticker')).replace(token,'[REDACTED]'))
        msg=result['result'];sticker=msg.get('sticker',{})
        receipts[name].update(message_id=msg['message_id'],sticker=sticker);save()
        assert sticker.get('is_animated' if animated else 'is_video') and not sticker.get('set_name'),'Expected standalone sticker'
        print(name,'sent as standalone sticker; message',msg['message_id'],flush=True)
if __name__=='__main__':
    try:main()
    except Exception as e:
        print(str(e).replace(token,'[REDACTED]'));raise SystemExit(1)
