"""Send the user-approved SVG variants privately as standalone stickers; never edit packs."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import secrets
import time
import urllib.request
import urllib.error

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('v1',ROOT/'scripts/telegram-pack-bot.py')
v1=importlib.util.module_from_spec(spec);spec.loader.exec_module(v1)
v1.load_env(ROOT/'.env')
token=os.environ['TELEGRAM_BOT_TOKEN'].strip()
owner=int(os.environ.get('TELEGRAM_OWNER_ID') or 1336169515)
folder=ROOT/'exports/clipboard-signs'
manifest=json.loads((folder/'manifest.json').read_text('utf-8'))
path=folder/'private-messages.json'
receipts=json.loads(path.read_text('utf-8')) if path.exists() else {}

def save(): path.write_text(json.dumps(receipts,ensure_ascii=False,indent=2),'utf-8')

def send(item):
    key=str(item['number']);data=(folder/item['file']).read_bytes();digest=hashlib.sha256(data).hexdigest()
    prior=receipts.get(key,{})
    if prior.get('message_id'):
        assert prior['hash']==digest,'File changed after sending'
        return
    assert not prior.get('attempted'),'Uncertain previous send; reconcile before retrying'
    boundary='tg'+secrets.token_hex(16)
    # Direct multipart sendSticker creates a sticker document even without a set.
    # Reusing uploadStickerFile's generic file_id may instead send a document.
    params={'chat_id':owner,'emoji':'📝',
            'reply_markup':json.dumps({'inline_keyboard':[[{'text':f"Вариант {item['number']}",'callback_data':f"clipboard_sign_{item['number']}"}]]})}
    chunks=[]
    for k,v in params.items():
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    chunks.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="sticker"; filename="{item["file"]}"\r\nContent-Type: video/webm\r\n\r\n'.encode(),data,f'\r\n--{boundary}--\r\n'.encode()])
    receipts[key]={'hash':digest,'svg':item['svg'],'attempted':True};save()
    req=urllib.request.Request(f'https://api.telegram.org/bot{token}/sendSticker',data=b''.join(chunks),headers={'Content-Type':'multipart/form-data; boundary='+boundary})
    try:
        with urllib.request.urlopen(req,timeout=90) as response: result=json.load(response)
    except urllib.error.HTTPError as error:
        result=json.loads(error.read())
    except Exception:
        raise RuntimeError('Network error: send outcome uncertain; do not retry blindly') from None
    if not result.get('ok'):
        receipts[key]['attempted']=False;save()
        raise RuntimeError(str(result.get('description','Telegram error')).replace(token,'[REDACTED]'))
    message=result['result'];sticker=message.get('sticker',{})
    receipts[key].update(message_id=message['message_id'],sticker=sticker);save()
    assert sticker.get('is_video') and sticker['width']==512 and sticker['height']==512
    assert not sticker.get('set_name'),'Must be a standalone sticker'
    print(f"Variant {key}: sent as standalone sticker, message {message['message_id']}",flush=True)
    time.sleep(3)

if __name__=='__main__':
    try:
        for item in manifest: send(item)
    except Exception as error:
        print(str(error).replace(token,'[REDACTED]'),flush=True)
        raise SystemExit(1)
