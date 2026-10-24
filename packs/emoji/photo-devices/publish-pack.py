"""Publish the nine explicitly selected drafts as a new user-owned sticker set."""
import hashlib, importlib.util, json, os, secrets, time, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('bot_env', ROOT / 'scripts/telegram-pack-bot.py')
env = importlib.util.module_from_spec(spec); spec.loader.exec_module(env); env.load_env(ROOT / '.env')
TOKEN = os.environ['TELEGRAM_BOT_TOKEN'].strip()
FOLDER = ROOT / 'exports/photo-devices'
RECEIPT = FOLDER / 'pack-publication.json'
state = json.loads(RECEIPT.read_text('utf8')) if RECEIPT.exists() else {'items': {}}
ITEMS = [('ballot-photo-632', '🗳'), ('flag-photo-950', '🏳'), ('id-photo-573', '🪪'), ('laptop-photo-556', '💻'), ('letter-photo-621', '💌'), ('painting-photo-606', '🖼'), ('phone-photo-554', '📱'), ('printer-photo-558', '🖨'), ('stas-704', '🚼')]

def save():
    RECEIPT.write_text(json.dumps(state, ensure_ascii=False, indent=2), 'utf8')

def call(method, params, file=None):
    if file:
        path, data = file; boundary = 'tg' + secrets.token_hex(16); chunks = []
        for key, value in params.items():
            chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
        mime = 'application/x-tgsticker' if path.suffix == '.tgs' else 'video/webm'
        chunks.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="sticker"; filename="{path.name}"\r\nContent-Type: {mime}\r\n\r\n'.encode(), data, f'\r\n--{boundary}--\r\n'.encode()])
        body, ctype = b''.join(chunks), 'multipart/form-data; boundary=' + boundary
    else:
        body, ctype = json.dumps(params).encode(), 'application/json'
    req = urllib.request.Request(f'https://api.telegram.org/bot{TOKEN}/{method}', data=body, headers={'Content-Type': ctype})
    try:
        with urllib.request.urlopen(req, timeout=90) as response: result = json.load(response)
    except urllib.error.HTTPError as error:
        try: result = json.loads(error.read())
        except Exception: raise RuntimeError(f'{method}: HTTP {error.code}') from None
    except Exception: raise RuntimeError(f'{method}: network outcome uncertain; rerun reconciles receipts') from None
    if not result.get('ok'):
        wait = result.get('parameters', {}).get('retry_after')
        if wait:
            raise RuntimeError(f'{method}: rate limited, retry after {wait}s')
        raise RuntimeError(f"{method}: {result.get('description')}")
    time.sleep(2.5)
    return result['result']

def inspect(name):
    try: return call('getStickerSet', {'name': name})
    except RuntimeError as error:
        if 'STICKERSET_INVALID' in str(error): return None
        raise

def main():
    me = call('getMe', {})
    live_file = ROOT / f"exports/telegram-bot/{me['id']}.json"
    live = json.loads(live_file.read_text('utf8')) if live_file.exists() else {}
    owner = int(os.environ.get('TELEGRAM_OWNER_ID') or live.get('owner') or 0)
    assert owner, 'Configured bot owner missing'
    assert state.get('owner', owner) == owner and state.get('bot_id', me['id']) == me['id'], 'Owner/bot changed'
    control = os.environ.get('BOT_CONTROL_TOKEN')
    if control:
        req = urllib.request.Request('http://127.0.0.1:' + os.environ.get('BOT_CONTROL_PORT', '8790') + '/status', headers={'Authorization': 'Bearer ' + control})
        try:
            with urllib.request.urlopen(req, timeout=5) as response: status = json.load(response)
            assert not status.get('running') and not status.get('busy'), 'Running bot is busy; retry later'
        except urllib.error.URLError: pass
    state.update(owner=owner, bot_id=me['id'])
    if 'name' not in state:
        state.update(name=f"stas_photo_{secrets.token_hex(4)}_by_{me['username']}", title='Стас · Фото')
        assert inspect(state['name']) is None, 'New name already exists'
        save()
    stickers = []
    for index, (name, emoji) in enumerate(ITEMS):
        fmt = 'animated' if name == 'stas-704' else 'video'
        path = ROOT / 'exports/emoji' / (name + ('.tgs' if fmt == 'animated' else '.webm'))
        data = path.read_bytes(); digest = hashlib.sha256(data).hexdigest()
        assert len(data) <= (65536 if fmt == 'animated' else 262144)
        record = state['items'].setdefault(name, {'hash': digest, 'format': fmt, 'emoji': emoji})
        assert record['hash'] == digest, f'{name}: file changed since publication started'
        if 'upload' not in record:
            record['upload'] = call('uploadStickerFile', {'user_id': owner, 'sticker_format': fmt}, (path, data)); save()
        stickers.append({'sticker': record['upload']['file_id'], 'format': fmt, 'emoji_list': [emoji]})
        print(f'{index+1}/9 {name}: uploaded', flush=True)
    existing = inspect(state['name'])
    if not existing:
        state['create_attempted'] = True; save()
        call('createNewStickerSet', {'user_id': owner, 'name': state['name'], 'title': state['title'], 'sticker_type': 'regular', 'stickers': stickers})
        existing = inspect(state['name'])
    assert existing and existing['sticker_type'] == 'regular' and len(existing['stickers']) == 9, 'Unexpected set content'
    for (name, _), sticker in zip(ITEMS, existing['stickers']):
        record = state['items'][name]
        # Telegram can assign a different unique_id when converting an uploaded
        # file to a sticker. Verify actual contents rather than upload metadata.
        remote = call('getFile', {'file_id': sticker['file_id']})
        try:
            with urllib.request.urlopen(f"https://api.telegram.org/file/bot{TOKEN}/{remote['file_path']}", timeout=60) as response: uploaded = response.read()
        except Exception: raise RuntimeError(f'{name}: verification download failed') from None
        assert hashlib.sha256(uploaded).hexdigest() == record['hash'], f'{name}: sticker/order mismatch'
        assert sticker.get('is_animated' if name == 'stas-704' else 'is_video'), f'{name}: format mismatch'
    state.update(verified=True, link='https://t.me/addstickers/' + state['name'], stickers=existing['stickers']); save()
    print('VERIFIED:', state['link'], '9 stickers, user-owned', flush=True)

if __name__ == '__main__':
    try: main()
    except Exception as error:
        save(); print(str(error).replace(TOKEN, '[REDACTED]'), flush=True); raise SystemExit(1)
