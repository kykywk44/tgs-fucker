"""Local Telegram pack publisher. Python 3.10+, no third-party dependencies."""
import csv
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import threading
import time
import urllib.error
import urllib.request
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]


def load_env(path):
    if path.exists():
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            key, sep, value = line.strip().partition('=')
            if sep and not key.startswith('#'):
                os.environ.setdefault(key.strip(), value.strip().strip('\"\''))


def validate_static_properties(node):
    if isinstance(node, dict):
        value = node.get('k')
        if node.get('a') == 0 and isinstance(value, list) and len(value) == 1 and isinstance(value[0], (int, float)):
            raise ValueError('Статическое числовое свойство записано массивом вместо числа')
        for value in node.values():
            validate_static_properties(value)
    elif isinstance(node, list):
        for value in node:
            validate_static_properties(value)


def read_pack(path, max_files=50):
    """Read in memory, never extract ZIP paths; validate hashes and TGS limits."""
    with ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError('Повторяющиеся имена в ZIP')
        if sum(item.file_size for item in archive.infolist()) > 20 * 1024 * 1024:
            raise ValueError('Архив слишком большой')
        rows = list(csv.DictReader(io.StringIO(archive.read('manifest.csv').decode('utf-8-sig'))))
        if not 1 <= len(rows) <= max_files:
            raise ValueError(f'Нужно от 1 до {max_files} TGS в manifest.csv')
        files = []
        seen = set()
        for row in rows:
            name = row['file']
            if PurePosixPath(name).name != name or '\\' in name or not name.endswith('.tgs') or name in seen:
                raise ValueError('Некорректное имя файла в манифесте')
            seen.add(name)
            info = archive.getinfo('tgs/' + name)
            if info.file_size > 65536:
                raise ValueError(f'{name}: больше 64 КиБ')
            data = archive.read(info)
            digest = hashlib.sha256(data).hexdigest()
            if digest != row['sha256'] or len(data) != int(row['bytes']):
                raise ValueError(f'{name}: размер или SHA-256 не совпадает')
            # Limit decompression before parsing untrusted Lottie JSON.
            with gzip.GzipFile(fileobj=io.BytesIO(data)) as zipped:
                raw = zipped.read(10 * 1024 * 1024 + 1)
            if len(raw) > 10 * 1024 * 1024:
                raise ValueError(f'{name}: слишком большой JSON')
            anim = json.loads(raw)
            try:
                validate_static_properties(anim)
            except ValueError as error:
                raise ValueError(f'{name}: {error}') from None
            if anim.get('tgs') != 1:
                raise ValueError(f'{name}: отсутствует маркер tgs:1')
            if (anim['w'], anim['h'], anim['fr']) != (512, 512, 60) or not 0 < anim['op'] - anim['ip'] <= 180:
                raise ValueError(f'{name}: неверный формат анимации')
            # Grapheme clusters preserve ZWJ families, variation selectors and skin tones.
            emoji = split_emoji(row['emoji'])
            files.append({'name': name, 'data': data, 'hash': digest, 'emoji': emoji})
        if {n for n in names if n.endswith('.tgs')} != {'tgs/' + n for n in seen}:
            raise ValueError('TGS в архиве не соответствуют манифесту')
        return files


def split_emoji(text):
    # Our manifest uses complete clusters separated implicitly (e.g. 👉👌).
    result = []
    join = False
    for char in text.strip():
        cp = ord(char)
        if char.isspace():
            join = False
            continue
        extender = char in ('\ufe0f', '\ufe0e', '\u200d', '\u20e3') or 0x1F3FB <= cp <= 0x1F3FF or 0xE0020 <= cp <= 0xE007F
        regional_pair = 0x1F1E6 <= cp <= 0x1F1FF and result and len(result[-1]) == 1 and 0x1F1E6 <= ord(result[-1]) <= 0x1F1FF
        if result and (join or extender or regional_pair):
            result[-1] += char
        else:
            result.append(char)
        join = char == '\u200d'
    if not 1 <= len(result) <= 20:
        raise ValueError('Привязка должна содержать 1–20 эмодзи')
    return result


def set_name(text, username, kind, both=False):
    text = text.strip().rstrip('/').split('/')[-1]
    suffix = '_by_' + username
    if text.lower().endswith(suffix.lower()):
        text = text[:-len(suffix)]
    if both:
        text += '_emoji' if kind == 'custom_emoji' else '_stickers'
    name = text + suffix
    if len(name) > 64 or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*', name) or '__' in name:
        raise ValueError('Ссылка: латиница, цифры, одиночные подчёркивания; первая буква латинская. До 64 знаков вместе с суффиксом бота.')
    return name


class ApiError(Exception):
    def __init__(self, method, code, description):
        self.code = code
        super().__init__(f'{method}: {description}')


class API:
    def __init__(self, token):
        self.token = token
        self.on_wait = lambda method, seconds: None

    def call(self, method, params=None, file=None):
        params = params or {}
        for attempt in range(5):
            if file:
                boundary = 'tg' + secrets.token_hex(16)
                chunks = []
                for key, value in params.items():
                    chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
                filename, data = file
                chunks.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="sticker"; filename="{filename}"\r\nContent-Type: application/x-tgsticker\r\n\r\n'.encode(), data, f'\r\n--{boundary}--\r\n'.encode()])
                body = b''.join(chunks)
                content_type = 'multipart/form-data; boundary=' + boundary
            else:
                body = json.dumps(params).encode()
                content_type = 'application/json'
            request = urllib.request.Request(f'https://api.telegram.org/bot{self.token}/{method}', data=body, headers={'Content-Type': content_type})
            try:
                with urllib.request.urlopen(request, timeout=90) as response:
                    result = json.load(response)
            except urllib.error.HTTPError as error:
                try:
                    result = json.loads(error.read())
                except (ValueError, OSError):
                    raise ApiError(method, error.code, 'Ошибка HTTP') from None
            except (urllib.error.URLError, TimeoutError, OSError):
                # Never print the URL: it contains the bot token.
                raise ApiError(method, 0, 'Сетевая ошибка. Повторите действие; загруженные файлы сохранены.') from None
            if result.get('ok'):
                return result['result']
            if result.get('error_code') == 429 and attempt < 4:
                seconds = max(1, int(result.get('parameters', {}).get('retry_after', 3))) + 1
                self.on_wait(method, seconds)
                time.sleep(seconds)
                continue
            raise ApiError(method, result.get('error_code', 0), result.get('description', 'Ошибка Telegram').replace(self.token, '[TOKEN]'))


class Publisher:
    def __init__(self, api, path):
        self.api, self.path = api, path
        self.lock = threading.RLock()
        self.state = json.loads(path.read_text('utf-8')) if path.exists() else {'cache': {}, 'sets': {}}

    def save(self):
        with self.lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix('.tmp')
            temporary.write_text(json.dumps(self.state, ensure_ascii=False, indent=2), 'utf-8')
            # Windows: an antivirus or indexer may hold the file for a moment.
            for attempt in range(10):
                try:
                    temporary.replace(self.path)
                    break
                except PermissionError:
                    if attempt == 9:
                        raise
                    time.sleep(0.05)

    def publish(self, owner, title, name, kind, files, progress):
        stickers = []
        for i, item in enumerate(files):
            key = f"{owner}:{item['hash']}"
            cached = self.state['cache'].get(key)
            if not cached:
                progress(f"Загружаю {i + 1}/{len(files)}: {item['name']}…")
                cached = self.api.call('uploadStickerFile', {'user_id': owner, 'sticker_format': 'animated'}, file=(item['name'], item['data']))
                with self.lock:
                    self.state['cache'][key] = cached
                    self.save()
            stickers.append({'sticker': cached['file_id'], 'format': 'animated', 'emoji_list': item['emoji']})
            progress(f'Загружено {i + 1}/{len(files)}.')
        signature = {'owner': owner, 'title': title, 'kind': kind,
                     'items': [{'hash': f['hash'], 'emoji': f['emoji']} for f in files]}
        previous = self.state['sets'].get(name)
        if previous and previous != signature:
            raise ValueError('Эта ссылка уже использована с другими настройками. Выберите другую.')
        try:
            existing = self.api.call('getStickerSet', {'name': name})
        except ApiError as error:
            if error.code != 400 or 'STICKERSET_INVALID' not in str(error):
                raise
            existing = None
        if existing:
            if previous == signature and existing['sticker_type'] == kind and existing['title'] == title and len(existing['stickers']) == len(files):
                return self.link(name, kind)
            raise ValueError('Такая ссылка уже занята. Выберите другую.')
        # Store intent before the request: a timeout may happen after Telegram creates the set.
        with self.lock:
            self.state['sets'][name] = signature
            self.save()
        progress(f'Все {len(files)} файлов загружены. Создаю набор…')
        self.api.call('createNewStickerSet', {'user_id': owner, 'name': name, 'title': title,
                                            'stickers': stickers, 'sticker_type': kind})
        return self.link(name, kind)

    @staticmethod
    def link(name, kind):
        return 'https://t.me/' + ('addemoji/' if kind == 'custom_emoji' else 'addstickers/') + name


class Bot:
    def __init__(self, api, publisher, username, files, owner=None):
        self.api, self.pub, self.username, self.files = api, publisher, username, files
        self.owner = owner or publisher.state.get('owner')
        self.pair = secrets.token_hex(3)
        self.pending = None
        self.running = False
        self.status = 'Загрузка ещё не запускалась.'
        self.wait_until = 0
        self.wait_method = ''

    def on_wait(self, method, seconds):
        self.wait_method = method
        self.wait_until = time.time() + seconds
        resume = time.strftime('%H:%M:%S', time.localtime(self.wait_until))
        print(f'Telegram: {method}, лимит 429. Ожидание {seconds} сек., повтор в {resume}.', flush=True)

    def status_text(self):
        remaining = max(0, int(self.wait_until - time.time()))
        if remaining and self.wait_method in ('uploadStickerFile', 'createNewStickerSet'):
            return self.status + f'\nTelegram ограничил частоту запросов (429). Повтор через {remaining} сек. Файлы в кэше сохранены.'
        return self.status

    def say(self, chat, text, buttons=None):
        markup = {'keyboard': [[{'text': b}] for b in buttons], 'resize_keyboard': True} if buttons else {'remove_keyboard': True}
        return self.api.call('sendMessage', {'chat_id': chat, 'text': text, 'reply_markup': markup})

    def handle(self, update):
        message = update.get('message', {})
        if message.get('chat', {}).get('type') != 'private' or not message.get('text'):
            return
        owner = message['from']['id']
        chat, text = message['chat']['id'], message['text'].strip()
        if not self.owner:
            if text != '/start ' + self.pair:
                self.say(chat, 'Пришли /start КОД. Код привязки показан в локальной консоли.')
                return
            self.owner = owner
            with self.pub.lock:
                self.pub.state['owner'] = owner
                self.pub.save()
        if owner != self.owner:
            self.say(chat, 'Это личный локальный бот другого пользователя.')
            return
        if text == '/status':
            self.say(chat, self.status_text())
            return
        if self.running:
            self.say(chat, 'Идёт загрузка. /status — прогресс. Если связь оборвётся, повтори создание с теми же настройками.')
            return
        if text in ('/cancel', 'Отмена'):
            self.pending = None
            self.say(chat, 'Отменено. /newpack — начать снова.')
            return
        if text.startswith('/start') or text == '/newpack':
            self.pending = {'step': 'type'}
            self.say(chat, f'В архиве {len(self.files)} анимаций. Что создаём?', ['Эмодзи', 'Стикерпак', 'Оба'])
            return
        p = self.pending
        if not p:
            self.say(chat, '/newpack — создать пак\n/status — прогресс\n/cancel — отменить настройку')
            return
        if p['step'] == 'type':
            kinds = {'Эмодзи': ['custom_emoji'], 'Стикерпак': ['regular'], 'Оба': ['custom_emoji', 'regular']}
            if text not in kinds:
                self.say(chat, 'Выбери тип кнопкой.', list(kinds))
                return
            p.update(kinds=kinds[text], step='title')
            self.say(chat, 'Как назвать набор? От 1 до 64 символов. Для двух наборов название будет одинаковым.')
        elif p['step'] == 'title':
            if not 1 <= len(text) <= 64:
                self.say(chat, 'Название должно содержать от 1 до 64 символов.')
                return
            p.update(title=text, step='name')
            self.say(chat, f'Введи короткое имя ссылки, например blue_people. Telegram добавит _by_{self.username}. Для двух наборов добавлю ещё _emoji и _stickers.')
        elif p['step'] == 'name':
            try:
                p['names'] = [set_name(text, self.username, k, len(p['kinds']) == 2) for k in p['kinds']]
            except ValueError as error:
                self.say(chat, str(error))
                return
            p['step'] = 'confirm'
            links = '\n'.join(Publisher.link(n, k) for n, k in zip(p['names'], p['kinds']))
            self.say(chat, f"Название: {p['title']}\nВладелец: твой аккаунт ({owner})\nПо {len(self.files)} анимаций с привязками из архива.\n{links}\n\nСоздать и опубликовать?", ['Создать', 'Отмена'])
        elif p['step'] == 'confirm' and text == 'Создать':
            self.running = True
            self.say(chat, 'Начинаю загрузку. Можно смотреть /status.')
            threading.Thread(target=self.publish, args=(chat, owner, dict(p)), daemon=True).start()
        else:
            self.say(chat, 'Нажми «Создать» или «Отмена».', ['Создать', 'Отмена'])

    def publish(self, chat, owner, config):
        links = []
        try:
            for name, kind in zip(config['names'], config['kinds']):
                def progress(text):
                    self.status = text
                    print(text, flush=True)
                self.status = 'Загружаю файлы…'
                links.append(self.pub.publish(owner, config['title'], name, kind, self.files, progress))
                self.say(chat, 'Набор готов:\n' + links[-1] + '\nОткрой ссылку и нажми «Добавить».')
            self.status = 'Готово:\n' + '\n'.join(links)
            self.pending = None
        except (ApiError, ValueError, OSError) as error:
            self.status = 'Не удалось завершить: ' + str(error)
            if links:
                self.status += '\nУже создано:\n' + '\n'.join(links)
            self.status += '\nПовтори «Создать» с теми же настройками для продолжения или /newpack для другой ссылки.'
            try:
                self.say(chat, self.status, ['Создать', 'Отмена'])
            except ApiError:
                pass
        finally:
            self.running = False


def main():
    load_env(ROOT / '.env')
    token = os.getenv('TELEGRAM_BOT_TOKEN', '').strip()
    if not token:
        raise ValueError('Заполни TELEGRAM_BOT_TOKEN в .env (образец — .env.example).')
    files = read_pack(ROOT / os.getenv('PACK_ARCHIVE', 'exports/blue-pack.zip'))
    api = API(token)
    me = api.call('getMe')
    pub = Publisher(api, ROOT / f"exports/telegram-bot/{me['id']}.json")
    owner = int(os.getenv('TELEGRAM_OWNER_ID') or 0) or None
    bot = Bot(api, pub, me['username'], files, owner)
    api.on_wait = bot.on_wait
    if api.call('getWebhookInfo').get('url'):
        raise ValueError('У бота настроен webhook. Используй отдельный токен бота без webhook.')
    print(f"@{me['username']}: {len(files)} TGS из архива. Ctrl+C — остановить.", flush=True)
    if not bot.owner:
        print(f'Для привязки своего аккаунта отправь боту: /start {bot.pair}', flush=True)
    else:
        print(f'Владелец {bot.owner}. Отправь боту /newpack.', flush=True)
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
        print('\nОстановлен. Кэш загрузки сохранён.')
    except (ValueError, OSError, ApiError) as error:
        print(str(error))
        raise SystemExit(1)
