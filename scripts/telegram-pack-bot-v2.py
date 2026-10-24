"""V2: append-only sync, paced requests, persisted cooldowns and live progress.

Run only after the original publisher has finished. Importing this module never
reads .env, touches the live state, or connects to Telegram.
"""
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
import os
from pathlib import Path
import random
import threading
import time
import urllib.request
from urllib.parse import urlparse

_spec = importlib.util.spec_from_file_location('pack_bot_v1', Path(__file__).with_name('telegram-pack-bot.py'))
v1 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(v1)
ROOT, ApiError = v1.ROOT, v1.ApiError
HEAVY = {'uploadStickerFile', 'createNewStickerSet', 'addStickerToSet', 'getStickerSet'}
CHAT = {'sendMessage', 'editMessageText', 'sendSticker'}


class Pacer:
    """One serial queue per request class; no lock is held while waiting."""
    def __init__(self, interval, state=None, save=None, clock=None, sleep=None):
        self.base = interval
        self.clock, self.sleep = clock or time.time, sleep or time.sleep
        self.save = save or (lambda _: None)
        self.lock = threading.RLock()
        state = state or {}
        self.interval = max(interval, min(120, state.get('interval', interval)))
        self.next_at = state.get('next_at', 0)
        self.blocked_until = state.get('blocked_until', 0)
        self.successes = 0

    def snapshot(self):
        return {'interval': self.interval, 'next_at': self.next_at, 'blocked_until': self.blocked_until}

    def before(self):
        while True:
            with self.lock:
                delay = self.next_at - self.clock()
                if delay <= 0:
                    self.next_at = self.clock() + self.interval
                    self.save(self.snapshot())
                    return
            self.sleep(delay)

    def penalize(self, seconds):
        with self.lock:
            self.interval = min(120, max(self.base, self.interval * 2))
            self.blocked_until = max(self.blocked_until, self.clock() + seconds)
            self.next_at = max(self.next_at, self.blocked_until)
            self.successes = 0
            self.save(self.snapshot())

    def defer(self, seconds):
        with self.lock:
            self.next_at = max(self.next_at, self.clock() + seconds)
            self.save(self.snapshot())

    def success(self):
        with self.lock:
            # Also covers a retry performed inside V1's retry_after handler.
            self.next_at = max(self.next_at, self.clock() + self.interval)
            self.successes += 1
            if self.successes >= 10:
                self.interval = max(self.base, self.interval * .9)
                self.successes = 0
            self.save(self.snapshot())


class API(v1.API):
    def __init__(self, token, interval=8):
        super().__init__(token)
        self.transfer = Pacer(max(2, interval))
        self.chat = Pacer(1.2)
        self.on_wait = self.rate_limited
        self.wait_notice = lambda method, seconds: None

    def attach(self, publisher):
        def save(snapshot):
            with publisher.lock:
                publisher.state['throttle'] = snapshot
                publisher.save()
        # Only called on real startup, never by tests against the live state.
        self.transfer = Pacer(self.transfer.base, publisher.state.get('throttle'), save)

    def rate_limited(self, method, seconds):
        gate = self.transfer if method in HEAVY else self.chat if method in CHAT else None
        if gate:
            gate.penalize(seconds)
        self.wait_notice(method, seconds)

    def call(self, method, params=None, file=None):
        gate = self.transfer if method in HEAVY else self.chat if method in CHAT else None
        # createNewStickerSet/sendMessage are not retried on uncertain network outcomes.
        retry_safe = method in {'uploadStickerFile', 'getStickerSet', 'getMe', 'getWebhookInfo', 'editMessageText', 'addStickerToSet'}
        for attempt in range(3):
            if gate:
                gate.before()
            try:
                result = super().call(method, params, file)
                if gate:
                    gate.success()
                return result
            except ApiError as error:
                if not retry_safe or error.code not in (0, 500, 502, 503, 504) or attempt == 2:
                    raise
                delay = 3 * 2 ** attempt + random.uniform(0, 1)
                if gate:
                    gate.defer(delay)
                else:
                    time.sleep(delay)


def download(api, file_id):
    """A set's sticker file, as uploaded: Telegram keeps the TGS bytes unchanged."""
    path = api.call('getFile', {'file_id': file_id})['file_path']
    try:
        with urllib.request.urlopen(f'https://api.telegram.org/file/bot{api.token}/{path}', timeout=60) as response:
            return response.read()
    except OSError:
        # Never print the URL: it contains the bot token.
        raise ApiError('getFile', 0, 'Не удалось скачать файл набора.') from None


class Publisher(v1.Publisher):
    def __init__(self, api, path):
        super().__init__(api, path)
        # Optional receipts from individually verified fixes, scoped to this bot.
        imported = False
        for receipt_path in (path.parent / 'receipts').glob('*.json'):
            receipt = v1.json.loads(receipt_path.read_text('utf-8'))
            if str(receipt.get('bot_id')) == path.stem:
                key = f"{receipt['owner']}:{receipt['hash']}"
                if key not in self.state['cache']:
                    self.state['cache'][key] = receipt['file']
                    imported = True
        if imported:
            self.save()

    def known(self, owner, name):
        record = self.state['sets'].get(name)
        if not record or record['owner'] != owner:
            raise ValueError('Нужен набор, созданный этим ботом для твоего аккаунта. Его история должна быть в локальном кэше.')
        return record

    def inventory(self, name):
        return self.state.setdefault('inventory', {}).setdefault(name, {})

    def remember(self, name, item, cached):
        with self.lock:
            self.inventory(name)[item['hash']] = {'file_id': cached['file_id'], 'file_unique_id': cached.get('file_unique_id')}
            self.save()

    @staticmethod
    def present(cached, existing):
        if not cached:
            return False
        return any(s.get('file_id') == cached['file_id'] or
                   (cached.get('file_unique_id') and s.get('file_unique_id') == cached['file_unique_id'])
                   for s in existing['stickers'])

    def cached(self, owner, item):
        return self.state['cache'].get(f"{owner}:{item['hash']}")

    def upload(self, owner, item):
        cached = self.cached(owner, item)
        if not cached:
            cached = self.api.call('uploadStickerFile', {'user_id': owner, 'sticker_format': 'animated'}, file=(item['name'], item['data']))
            with self.lock:
                self.state['cache'][f"{owner}:{item['hash']}"] = cached
                self.save()
        return cached

    @staticmethod
    def input_sticker(item, cached):
        return {'sticker': cached['file_id'], 'format': 'animated', 'emoji_list': item['emoji']}

    def inspect(self, owner, name):
        record = self.known(owner, name)
        existing = self.api.call('getStickerSet', {'name': name})
        if existing['sticker_type'] != record['kind']:
            raise ValueError('Тип набора не совпадает с локальной историей.')
        return existing

    def contents(self, existing, sizes):
        """SHA-256 of the set's stickers whose size matches a file about to be added. A sticker in a set
        gets another file_unique_id than its upload, so the ids alone never recognise it; the bytes do.
        Hashes are kept by the set's file_unique_id, so each sticker is downloaded once."""
        known = self.state.setdefault('set_hashes', {})
        found = set()
        for sticker in existing['stickers']:
            uid, size = sticker.get('file_unique_id'), sticker.get('file_size')
            if not uid or size not in sizes:
                continue
            if uid not in known:
                known[uid] = hashlib.sha256(self.download(sticker['file_id'])).hexdigest()
                with self.lock:
                    self.save()
            found.add(known[uid])
        return found

    def download(self, file_id):
        return download(self.api, file_id)

    def placed(self, name, files):
        """Each of `files` as it is now in the set (the set's own sticker, found by its bytes), in
        the order of `files`; those the set does not have are left out."""
        existing = self.api.call('getStickerSet', {'name': name})
        self.contents(existing, {len(item['data']) for item in files})
        by_hash = {}
        for sticker in existing['stickers']:
            digest = self.state['set_hashes'].get(sticker.get('file_unique_id'))
            if digest:
                by_hash.setdefault(digest, sticker)
        return [(item, by_hash[item['hash']]) for item in files if item['hash'] in by_hash]

    def append(self, owner, name, files, progress):
        existing = self.inspect(owner, name)
        kind = existing['sticker_type']
        inside = self.contents(existing, {len(item['data']) for item in files})
        limit = 200 if kind == 'custom_emoji' else 120
        pending = []
        skipped = 0
        seen = set()
        for item in files:
            if item['hash'] in seen:
                skipped += 1
                continue
            seen.add(item['hash'])
            cached = self.cached(owner, item) or self.inventory(name).get(item['hash'])
            if item['hash'] in inside or self.present(cached, existing):
                skipped += 1
                if cached:
                    self.remember(name, item, cached)
            else:
                pending.append(item)
        if len(existing['stickers']) + len(pending) > limit:
            raise ValueError(f'В наборе {len(existing["stickers"])} элементов, новых {len(pending)}. Лимит — {limit}. Ничего не добавлено.')
        progress(f'Новых: {len(pending)}. Уже в наборе: {skipped}.')
        for i, item in enumerate(pending):
            progress(f"Добавляю {i + 1}/{len(pending)}: {item['name']}\nПропущено готовых: {skipped}.")
            cached = self.upload(owner, item)
            # Covers a prior successful add whose reply was lost before saving inventory.
            if not self.present(cached, existing):
                self.api.call('addStickerToSet', {'user_id': owner, 'name': name, 'sticker': self.input_sticker(item, cached)})
                existing['stickers'].append(cached)
            self.remember(name, item, cached)
        progress(f'Готово. Добавлено: {len(pending)}. Пропущено: {skipped}.')
        return self.link(name, kind)

    def publish(self, owner, title, name, kind, files, progress):
        limit = 200 if kind == 'custom_emoji' else 120
        if not 1 <= len(files) <= limit:
            raise ValueError(f'Для этого типа нужно от 1 до {limit} анимаций.')
        try:
            existing = self.api.call('getStickerSet', {'name': name})
        except ApiError as error:
            if error.code != 400 or 'STICKERSET_INVALID' not in str(error).upper():
                raise
            existing = None
        initial = files[:50]
        signature = {'owner': owner, 'title': title, 'kind': kind,
                     'items': [{'hash': f['hash'], 'emoji': f['emoji']} for f in initial]}
        previous = self.state['sets'].get(name)
        if previous and previous != signature:
            raise ValueError('Эта ссылка уже использована. Для новых файлов выбери /add, для нового пака — другую ссылку.')
        if existing:
            if previous != signature or existing['sticker_type'] != kind:
                raise ValueError('Такая ссылка уже занята. Выбери другую.')
            return self.append(owner, name, files, progress)
        stickers = []
        for i, item in enumerate(initial):
            progress(f"Загружаю {i + 1}/{len(initial)}: {item['name']}…")
            stickers.append(self.input_sticker(item, self.upload(owner, item)))
        with self.lock:
            self.state['sets'][name] = signature
            self.save()
        progress('Создаю набор…')
        self.api.call('createNewStickerSet', {'user_id': owner, 'name': name, 'title': title, 'stickers': stickers, 'sticker_type': kind})
        # The real set is inspected before deduplication, including old V1 sets.
        return self.append(owner, name, files, progress)


class LiveProgress:
    """A single thread creates and edits an optional notification, independently of uploads."""
    def __init__(self, api, chat, message_id, render, interval=5):
        self.api, self.chat, self.message_id, self.render = api, chat, message_id, render
        self.interval = max(5, interval)
        self.wake = threading.Event()
        self.done = False
        self.last = None
        self.thread = None
        self.final_text = None

    def update(self):
        text = (self.final_text if self.final_text is not None else self.render())[:4096]
        if text == self.last:
            return
        try:
            params = {'chat_id': self.chat, 'text': text, 'link_preview_options': {'is_disabled': True}}
            if self.message_id is None:
                message = self.api.call('sendMessage', params)
                self.message_id = message['message_id']
            else:
                self.api.call('editMessageText', dict(params, message_id=self.message_id))
        except ApiError as error:
            if error.code == 400 and 'message is not modified' in str(error).lower():
                self.last = text
                return
            raise
        self.last = text

    def start(self):
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()

    def run(self):
        if self.message_id is None:
            try:
                self.update()
            except ApiError as error:
                # A lost sendMessage response may still have created the message.
                # Do not resend blindly or stop the independent publication job.
                print(f'Не удалось отправить прогресс: {error}\nОчередь продолжает работу; статус доступен на сайте и по /status.', flush=True)
                return
        failures = 0
        while True:
            self.wake.wait(self.interval)
            self.wake.clear()
            # Reading done BEFORE rendering means an in-flight stale edit is
            # followed by another iteration that renders the final status.
            final = self.done
            try:
                self.update()
                failures = 0
                if final:
                    return
            except ApiError as error:
                failures += 1
                print(f'Не удалось обновить прогресс: {error}', flush=True)
                if error.code in (400, 403) or (final and failures >= 3):
                    return

    def finish(self, text=None):
        self.final_text = text
        self.done = True
        self.wake.set()


class Bot(v1.Bot):
    def __init__(self, api, publisher, username, files, owner=None, archive=None):
        super().__init__(api, publisher, username, files, owner)
        self.archive = archive
        self.live = None
        self.started_at = 0
        self.links = []
        # The chat and the local control server (the editor's «В Telegram») start jobs from two threads.
        self.start_lock = threading.Lock()

    def reload(self):
        if self.archive:
            self.files = v1.read_pack(self.archive, max_files=200)

    def status_text(self):
        lines = [self.status]
        if self.links:
            lines.extend(self.links)
        if self.running:
            elapsed = max(0, int(time.time() - self.started_at))
            lines.append(f'Прошло: {elapsed // 60}:{elapsed % 60:02d}.')
        transfer = getattr(self.api, 'transfer', None)
        if transfer:
            remaining = max(0, int(transfer.blocked_until - time.time()))
            if remaining:
                lines.append(f'Telegram просит подождать: {remaining} сек. Очередь продолжится сама.')
            elif self.running:
                lines.append(f'Пауза между запросами: {transfer.interval:.0f} сек.')
        return '\n'.join(lines)

    def existing_name(self, text, owner):
        text = text.strip()
        if '://' in text:
            parsed = urlparse(text)
            if parsed.hostname not in ('t.me', 'telegram.me'):
                raise ValueError('Пришли ссылку t.me/addemoji/... или t.me/addstickers/... либо короткое имя набора.')
            parts = parsed.path.strip('/').split('/')
            if len(parts) != 2 or parts[0] not in ('addemoji', 'addstickers'):
                raise ValueError('Некорректная ссылка на набор.')
            text = parts[1]
        if not v1.re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,63}', text):
            raise ValueError('Некорректное короткое имя набора.')
        if not text.lower().endswith(('_by_' + self.username).lower()):
            raise ValueError('Этот набор создан другим ботом. Bot API разрешает добавлять только в наборы своего бота.')
        self.pub.known(owner, text)
        return text

    def handle(self, update):
        message = update.get('message', {})
        if message.get('chat', {}).get('type') != 'private' or not message.get('text'):
            return
        owner = message['from']['id']
        chat, text = message['chat']['id'], message['text'].strip()
        if not self.owner or owner != self.owner:
            return super().handle(update)
        if text == '/status' and self.live:
            if self.live.thread and self.live.thread.is_alive():
                self.live.wake.set()
            else:
                self.say(chat, self.status_text())
            return
        if self.running:
            return super().handle(update)
        if text == '/packs':
            links = [self.pub.link(n, s['kind']) for n, s in self.pub.state['sets'].items() if s['owner'] == owner]
            self.say(chat, '\n'.join(links) if links else 'Пока нет наборов. /newpack — создать.')
            return
        if text in ('/newpack', '/add') or text.startswith('/start'):
            try:
                self.reload()
            except (ValueError, OSError, KeyError) as error:
                self.say(chat, 'Не удалось прочитать архив: ' + str(error))
                return
        if text == '/add':
            self.pending = {'step': 'target', 'mode': 'append'}
            self.say(chat, f'В архиве {len(self.files)} анимаций. Пришли ссылку или имя существующего пака. /packs — твои наборы. Уже добавленные файлы пропущу.')
            return
        p = self.pending
        if p and p['step'] == 'target' and text not in ('/cancel', 'Отмена', '/newpack'):
            try:
                name = self.existing_name(text, owner)
                record = self.pub.known(owner, name)
            except ValueError as error:
                self.say(chat, str(error))
                return
            p.update(step='confirm', names=[name], kinds=[record['kind']], title=record['title'])
            self.say(chat, f"Дозагрузка в «{record['title']}»\n{self.pub.link(name, record['kind'])}\n\nПроверю {len(self.files)} файлов из архива, добавлю только отсутствующие. Существующие не изменяю.", ['Добавить', 'Отмена'])
            return
        if p and p['step'] == 'confirm' and text in ('Создать', 'Добавить'):
            with self.start_lock:
                if self.running:
                    return super().handle(update)
                self.start_job(owner, chat, p)
            return
        if not p and text not in ('/newpack', '/cancel', 'Отмена') and not text.startswith('/start'):
            self.say(chat, '/newpack — новый пак\n/add — добавить новые файлы\n/packs — ссылки на твои наборы')
            return
        return super().handle(update)

    def start_job(self, owner, chat, config, files=None):
        """The caller holds start_lock and has checked that nothing is running."""
        self.status, self.links = 'Подготавливаю загрузку…', []
        self.started_at, self.running = time.time(), True
        # No Telegram requests on the control HTTP thread: a notification can
        # take 90 seconds or fail without preventing the accepted job from running.
        live = LiveProgress(self.api, chat, None, self.status_text)
        self.live = live
        live.start()
        threading.Thread(target=self.publish_job, args=(owner, dict(config), list(files if files is not None else self.files), live), daemon=True).start()

    # ---------- the local control server (the editor's «В Telegram» button) ----------

    def owned_sets(self):
        return [{'name': n, 'title': s['title'], 'kind': s['kind'], 'link': self.pub.link(n, s['kind'])}
                for n, s in self.pub.state['sets'].items() if self.owner and s['owner'] == self.owner]

    def control_status(self):
        return {'running': self.running, 'status': self.status_text(), 'links': list(self.links)}

    def remote_append(self, names, only=None):
        """The editor's «Добавить»: the archive is re-read and the files named in `only` (all of them
        if None, as /add in the chat) are added, in that order, to each of the sets `names` in turn,
        unless a set already has them — one getStickerSet per set decides that. Progress is one
        message in the owner's chat; then the bot sends each file as it came out in each set."""
        if not self.owner:
            raise ValueError('Бот ещё не привязан к владельцу.')
        names = [names] if isinstance(names, str) else list(dict.fromkeys(names))
        if not names:
            raise ValueError('Не выбран набор.')
        with self.start_lock:
            if self.running:
                raise RuntimeError('Бот уже загружает. Дождись конца — прогресс в чате.')
            records = [self.pub.known(self.owner, name) for name in names]
            self.reload()
            if only is None:
                files = self.files
            else:
                by_name = {f['name']: f for f in self.files}
                missing = [n for n in dict.fromkeys(only) if n not in by_name]
                if missing:
                    raise ValueError('Этих файлов нет в архиве: ' + ', '.join(missing))
                files = [by_name[n] for n in dict.fromkeys(only)]
            self.start_job(self.owner, self.owner, {'mode': 'append', 'names': names, 'kinds': [r['kind'] for r in records],
                                                    'title': records[0]['title'], 'show': only is not None}, files)
        return {'started': True, 'files': len(files), 'links': [self.pub.link(n, r['kind']) for n, r in zip(names, records)]}

    def show(self, chat, name, files):
        """Sends each file as the set has it now: a sticker as a sticker; a custom emoji (which
        sendSticker refuses: «can't send emoji stickers in messages») as a message of that emoji."""
        record = self.pub.state['sets'][name]
        try:
            self.api.call('sendMessage', {'chat_id': chat, 'text': f"«{record['title']}»: как получилось",
                                          'link_preview_options': {'is_disabled': True}})
            for item, sticker in self.pub.placed(name, files):
                if sticker.get('custom_emoji_id'):
                    text = sticker.get('emoji') or '⭐'
                    self.api.call('sendMessage', {'chat_id': chat, 'text': text, 'entities': [
                        {'type': 'custom_emoji', 'offset': 0, 'length': len(text.encode('utf-16-le')) // 2,
                         'custom_emoji_id': sticker['custom_emoji_id']}]})
                else:
                    self.api.call('sendSticker', {'chat_id': chat, 'sticker': sticker['file_id']})
        except (ApiError, OSError) as error:
            print(f'Не удалось прислать результат: {error}', flush=True)

    def publish_job(self, owner, config, files, live):
        try:
            for name, kind in zip(config['names'], config['kinds']):
                def progress(text):
                    self.status = text
                    print(text, flush=True)
                if config.get('mode') == 'append':
                    link = self.pub.append(owner, name, files, progress)
                else:
                    link = self.pub.publish(owner, config['title'], name, kind, files, progress)
                self.links.append(link)
                if config.get('show'):
                    self.show(owner, name, files)
            self.status = 'Готово. Наборы обновлены. Открой ссылки ниже.'
            self.pending = None
        except (ApiError, ValueError, OSError) as error:
            action = 'Добавить' if config.get('mode') == 'append' else 'Создать'
            stage = self.status
            self.status = 'Загрузка приостановлена: ' + str(error) + f'\nЭтап: {stage}\nПовтори «{action}» с теми же настройками. Готовые файлы сохранятся.'
            print(self.status, flush=True)
        finally:
            live.finish(self.status + ('\n' + '\n'.join(self.links) if self.links else ''))
            self.running = False


class Control(BaseHTTPRequestHandler):
    """127.0.0.1 only, Bearer BOT_CONTROL_TOKEN: GET /sets, GET /status,
    POST /append {"names": [set, …] (or "name"), "files": ["x.tgs", …]} (no "files": everything the
    set is missing; with "files", the bot then sends them as they came out)."""
    bot = None
    token = ''

    def log_message(self, *args):
        pass

    def reply(self, code, body):
        data = json.dumps(body, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def authorized(self):
        return bool(self.token) and hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + self.token)

    def do_GET(self):
        if not self.authorized():
            return self.reply(403, {'error': 'forbidden'})
        if self.path == '/sets':
            return self.reply(200, {'sets': self.bot.owned_sets()})
        if self.path == '/status':
            return self.reply(200, self.bot.control_status())
        self.reply(404, {'error': 'not found'})

    def do_POST(self):
        if not self.authorized():
            return self.reply(403, {'error': 'forbidden'})
        if self.path != '/append':
            return self.reply(404, {'error': 'not found'})
        try:
            length = min(int(self.headers.get('Content-Length') or 0), 65536)
            data = json.loads(self.rfile.read(length) or b'{}')
            only = data.get('files')
            names = data.get('names') if isinstance(data.get('names'), list) else [data.get('name', '')]
            self.reply(202, self.bot.remote_append([str(n) for n in names if n], [str(f) for f in only] if isinstance(only, list) else None))
        except RuntimeError as error:
            self.reply(409, {'error': str(error)})
        except (ValueError, OSError, KeyError, ApiError) as error:
            self.reply(400, {'error': str(error)})


def serve_control(bot, token, port):
    handler = type('BoundControl', (Control,), {'bot': bot, 'token': token})
    server = ThreadingHTTPServer(('127.0.0.1', port), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def main():
    v1.load_env(ROOT / '.env')
    token = os.getenv('TELEGRAM_BOT_TOKEN', '').strip()
    if not token:
        raise ValueError('Заполни TELEGRAM_BOT_TOKEN в .env.')
    archive = ROOT / os.getenv('PACK_ARCHIVE', 'exports/blue-pack.zip')
    files = v1.read_pack(archive, max_files=200)
    api = API(token, float(os.getenv('PACK_REQUEST_INTERVAL', '8')))
    me = api.call('getMe')
    pub = Publisher(api, ROOT / f"exports/telegram-bot/{me['id']}.json")
    api.attach(pub)
    owner = int(os.getenv('TELEGRAM_OWNER_ID') or 0) or None
    bot = Bot(api, pub, me['username'], files, owner, archive)
    api.wait_notice = bot.on_wait
    if api.call('getWebhookInfo').get('url'):
        raise ValueError('У бота настроен webhook. Используй отдельного бота без webhook.')
    print(f"V2 @{me['username']}: {len(files)} TGS. /newpack — создать, /add — дозагрузить. Ctrl+C — остановить.", flush=True)
    if not bot.owner:
        print(f'Для привязки отправь /start {bot.pair}', flush=True)
    control_token = os.getenv('BOT_CONTROL_TOKEN', '').strip()
    if control_token:
        port = int(os.getenv('BOT_CONTROL_PORT') or 8790)
        serve_control(bot, control_token, port)
        print(f'Управление из редактора: http://127.0.0.1:{port} (только этот компьютер).', flush=True)
    offset = pub.state.get('offset', 0)
    while True:
        try:
            updates = api.call('getUpdates', {'offset': offset, 'timeout': 30, 'allowed_updates': ['message']})
            for update in updates:
                try:
                    bot.handle(update)
                except (ApiError, ValueError, OSError) as error:
                    print(str(error), flush=True)
                offset = update['update_id'] + 1
                with pub.lock:
                    pub.state['offset'] = offset
                    pub.save()
        except ApiError as error:
            if error.code in (401, 409):
                raise
            print(str(error), flush=True)
            time.sleep(3)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\nОстановлен. Кэш и интервалы ожидания сохранены.')
    except (ValueError, OSError, ApiError) as error:
        print(str(error))
        raise SystemExit(1)
