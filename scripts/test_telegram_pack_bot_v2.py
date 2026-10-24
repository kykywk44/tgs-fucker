"""Offline V2 integration tests. Never open .env or the running bot's state."""
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('pack_v2', Path(__file__).with_name('telegram-pack-bot-v2.py'))
bot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bot)


class Clock:
    def __init__(self):
        self.now = 1000
        self.waits = []

    def time(self):
        return self.now

    def sleep(self, seconds):
        self.waits.append(seconds)
        self.now += seconds


class FakeAPI:
    def __init__(self):
        self.calls = []
        self.sets = {}
        self.files = {}
        self.fail_after_add = False
        self.fail_after_create = False
        self.fail_before_add_number = 0
        self.add_count = 0
        self.sizes = False

    def entry(self, file_id, kind):
        """A sticker as a set holds it: a custom emoji also has its custom_emoji_id."""
        entry = {k: v for k, v in self.files[file_id].items() if k != 'emoji_id'}
        if kind == 'custom_emoji':
            entry['custom_emoji_id'] = self.files[file_id]['emoji_id']
        return copy.deepcopy(entry)

    def call(self, method, params=None, file=None):
        self.calls.append((method, copy.deepcopy(params), file))
        if method == 'uploadStickerFile':
            cached = {'file_id': 'file-' + file[0], 'file_unique_id': 'unique-' + file[0]}
            # a set's sticker can also tell its size (then the bot looks at its bytes)
            self.files[cached['file_id']] = dict(cached, file_size=len(file[1])) if self.sizes else cached
            self.files[cached['file_id']]['emoji_id'] = 'emoji-' + file[0].removesuffix('.tgs')
            return copy.deepcopy(cached)
        if method == 'getStickerSet':
            if params['name'] not in self.sets:
                raise bot.ApiError(method, 400, 'STICKERSET_INVALID')
            return copy.deepcopy(self.sets[params['name']])
        if method == 'createNewStickerSet':
            self.sets[params['name']] = {'title': params['title'], 'sticker_type': params['sticker_type'],
                                        'stickers': [self.entry(s['sticker'], params['sticker_type']) for s in params['stickers']]}
            if self.fail_after_create:
                self.fail_after_create = False
                raise bot.ApiError(method, 0, 'timeout after creation')
            return True
        if method == 'addStickerToSet':
            self.add_count += 1
            if self.add_count == self.fail_before_add_number:
                raise bot.ApiError(method, 400, 'simulated invalid file')
            entry = self.entry(params['sticker']['sticker'], self.sets[params['name']]['sticker_type'])
            existing = self.sets[params['name']]['stickers']
            if entry not in existing:
                existing.append(copy.deepcopy(entry))
            if self.fail_after_add:
                self.fail_after_add = False
                raise bot.ApiError(method, 0, 'timeout after addition')
            return True
        if method in ('sendMessage', 'editMessageText', 'sendSticker'):
            return {'message_id': 42}
        raise AssertionError(method)


def items(count, start=0):
    return [{'name': f'{n}.tgs', 'hash': f'hash-{n}', 'data': str(n).encode(), 'emoji': ['💙']} for n in range(start, start + count)]


class V2Tests(unittest.TestCase):
    def setUp(self):
        base = (bot.ROOT / 'exports/bot-tests').resolve()
        assert base.is_relative_to(bot.ROOT.resolve())
        base.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=base)
        assert Path(self.temp.name).resolve().is_relative_to(base)
        self.addCleanup(self.temp.cleanup)
        self.api = FakeAPI()
        self.path = Path(self.temp.name) / '123.json'
        self.pub = bot.Publisher(self.api, self.path)
        self.name = 'blue_by_TestBot'
        self.progress = []

    def create(self, files=None, kind='custom_emoji'):
        return self.pub.publish(7, 'Blue', self.name, kind, files or items(2), self.progress.append)

    def test_append_only_new_and_repeat_is_noop(self):
        self.create()
        self.api.calls.clear()
        self.pub.append(7, self.name, items(3), self.progress.append)
        self.assertEqual(len(self.api.sets[self.name]['stickers']), 3)
        self.assertEqual([m for m, _, _ in self.api.calls], ['getStickerSet', 'uploadStickerFile', 'addStickerToSet'])
        self.api.calls.clear()
        self.pub.append(7, self.name, items(3), self.progress.append)
        self.assertEqual([m for m, _, _ in self.api.calls], ['getStickerSet'])

    def test_migrate_v1_without_inventory(self):
        legacy = bot.v1.Publisher(self.api, self.path)
        legacy.publish(7, 'Blue', self.name, 'custom_emoji', items(2), lambda _: None)
        self.pub = bot.Publisher(self.api, self.path)
        self.api.calls.clear()
        self.pub.append(7, self.name, items(3), self.progress.append)
        self.assertEqual(sum(m == 'uploadStickerFile' for m, _, _ in self.api.calls), 1)
        self.assertEqual(len(self.api.sets[self.name]['stickers']), 3)

    def test_rotated_file_id_dedup_uses_unique_id(self):
        self.create()
        for entry in self.api.sets[self.name]['stickers']:
            entry['file_id'] += '-rotated'
        self.api.calls.clear()
        self.pub.append(7, self.name, items(2), self.progress.append)
        self.assertEqual([m for m, _, _ in self.api.calls], ['getStickerSet'])

    def test_lost_add_reply_resume_never_duplicates(self):
        self.create()
        self.api.fail_after_add = True
        with self.assertRaises(bot.ApiError):
            self.pub.append(7, self.name, items(3), self.progress.append)
        self.pub = bot.Publisher(self.api, self.path)
        self.pub.append(7, self.name, items(3), self.progress.append)
        self.assertEqual(len(self.api.sets[self.name]['stickers']), 3)
        self.assertEqual(self.api.add_count, 1)

    def test_partial_batch_resume(self):
        self.create()
        self.api.fail_before_add_number = 2
        with self.assertRaises(bot.ApiError):
            self.pub.append(7, self.name, items(4), self.progress.append)
        self.pub = bot.Publisher(self.api, self.path)
        self.pub.append(7, self.name, items(4), self.progress.append)
        self.assertEqual(len(self.api.sets[self.name]['stickers']), 4)
        self.assertEqual(self.api.add_count, 3)

    def test_create_more_than_fifty_and_resume(self):
        self.create(items(52))
        creation = next(p for m, p, _ in self.api.calls if m == 'createNewStickerSet')
        self.assertEqual(len(creation['stickers']), 50)
        self.assertEqual(len(self.api.sets[self.name]['stickers']), 52)
        self.pub = bot.Publisher(self.api, self.path)
        self.create(items(52))
        self.assertEqual(sum(m == 'createNewStickerSet' for m, _, _ in self.api.calls), 1)
        self.assertEqual(self.api.add_count, 2)

    def test_uncertain_create_resumes(self):
        self.api.fail_after_create = True
        with self.assertRaises(bot.ApiError):
            self.create()
        self.pub = bot.Publisher(self.api, self.path)
        self.create()
        self.assertEqual(sum(m == 'createNewStickerSet' for m, _, _ in self.api.calls), 1)

    def test_capacity_rejected_before_any_upload_or_add(self):
        self.create(kind='regular')
        self.api.sets[self.name]['stickers'].extend([{'file_id': f'extra-{i}'} for i in range(118)])
        self.api.calls.clear()
        with self.assertRaisesRegex(ValueError, 'Лимит'):
            self.pub.append(7, self.name, items(3), self.progress.append)
        self.assertEqual([m for m, _, _ in self.api.calls], ['getStickerSet'])

    def test_other_owner_rejected_before_network(self):
        self.create()
        self.api.calls.clear()
        with self.assertRaises(ValueError):
            self.pub.append(8, self.name, items(3), self.progress.append)
        self.assertEqual(self.api.calls, [])

    def test_removed_sticker_can_be_added_again(self):
        self.create()
        self.api.sets[self.name]['stickers'].pop()
        self.pub.append(7, self.name, items(2), self.progress.append)
        self.assertEqual(len(self.api.sets[self.name]['stickers']), 2)
        self.assertEqual(self.api.add_count, 1)

    def test_duplicate_hash_in_archive_added_once(self):
        self.create()
        added = items(1, start=2)[0]
        self.pub.append(7, self.name, [added, added], self.progress.append)
        self.assertEqual(self.api.add_count, 1)

    def test_receipts_only_for_same_bot(self):
        folder = self.path.parent / 'receipts'
        folder.mkdir()
        receipt = {'owner': 7, 'hash': 'verified', 'bot_id': '456', 'file': {'file_id': 'cached'}}
        path = folder / 'fix.json'
        path.write_text(json.dumps(receipt))
        self.assertNotIn('7:verified', bot.Publisher(self.api, self.path).state['cache'])
        receipt['bot_id'] = '123'
        path.write_text(json.dumps(receipt))
        self.assertEqual(bot.Publisher(self.api, self.path).state['cache']['7:verified']['file_id'], 'cached')

    def test_pacing_and_persisted_cooldown(self):
        clock, snapshots = Clock(), []
        gate = bot.Pacer(8, save=lambda data: snapshots.append(dict(data)), clock=clock.time, sleep=clock.sleep)
        gate.before()
        gate.before()
        self.assertEqual(clock.waits, [8])
        gate.penalize(176)
        self.assertEqual(gate.interval, 16)
        restarted = bot.Pacer(8, state=snapshots[-1], clock=clock.time, sleep=clock.sleep)
        restarted.before()
        self.assertEqual(clock.waits[-1], 176)
        self.assertEqual(restarted.interval, 16)

    def test_slow_recovery_never_faster_than_base(self):
        clock = Clock()
        gate = bot.Pacer(8, clock=clock.time, sleep=clock.sleep)
        gate.penalize(1)
        for _ in range(10):
            gate.success()
        self.assertAlmostEqual(gate.interval, 14.4)
        for _ in range(200):
            gate.success()
        self.assertEqual(gate.interval, 8)

    def test_429_retry_and_next_request_stay_spaced(self):
        clock = Clock()
        api = bot.API('TEST_TOKEN')
        api.transfer = bot.Pacer(8, clock=clock.time, sleep=clock.sleep)
        responses = [io.BytesIO(json.dumps(value).encode()) for value in [
            {'ok': False, 'error_code': 429, 'parameters': {'retry_after': 120}},
            {'ok': True, 'result': {'file_id': 'a'}}, {'ok': True, 'result': {'file_id': 'b'}}]]
        with patch.object(bot.v1.urllib.request, 'urlopen', side_effect=responses), patch.object(bot.v1.time, 'sleep', side_effect=clock.sleep):
            api.call('uploadStickerFile')
            first_end = clock.now
            api.call('uploadStickerFile')
        self.assertEqual(first_end, 1121)
        self.assertGreaterEqual(clock.now - first_end, 16)

    def test_live_progress_edits_same_message_and_freezes_final(self):
        text = ['Загружаю 1/44']
        live = bot.LiveProgress(self.api, 7, 42, lambda: text[0])
        live.update()
        live.update()
        text[0] = 'Загружаю 2/44'
        live.update()
        live.finish('Готово')
        text[0] = 'Следующая задача'
        live.update()
        edits = [p for m, p, _ in self.api.calls if m == 'editMessageText']
        self.assertEqual([p['text'] for p in edits], ['Загружаю 1/44', 'Загружаю 2/44', 'Готово'])
        self.assertTrue(all(p['message_id'] == 42 for p in edits))
        self.assertFalse(any(m == 'sendMessage' for m, _, _ in self.api.calls))

    def test_live_progress_creates_one_message_then_edits_it(self):
        text = ['Начинаю']
        live = bot.LiveProgress(self.api, 7, None, lambda: text[0])
        live.update()
        text[0] = 'Загружаю'
        live.update()
        live.finish('Готово')
        text[0] = 'Другая задача'
        live.update()
        self.assertEqual([m for m, _, _ in self.api.calls], ['sendMessage', 'editMessageText', 'editMessageText'])
        self.assertEqual([p['text'] for _, p, _ in self.api.calls], ['Начинаю', 'Загружаю', 'Готово'])
        self.assertTrue(all(p['message_id'] == 42 for m, p, _ in self.api.calls if m == 'editMessageText'))

    def test_add_wizard_and_owner_boundary(self):
        self.create()
        app = bot.Bot(self.api, self.pub, 'TestBot', items(3), owner=7)
        def message(uid, text):
            return {'message': {'from': {'id': uid}, 'chat': {'id': uid, 'type': 'private'}, 'text': text}}
        app.handle(message(8, '/add'))
        self.assertIsNone(app.pending)
        app.handle(message(7, '/add'))
        self.assertEqual(app.pending['step'], 'target')
        app.handle(message(7, 'https://t.me/addemoji/' + self.name))
        self.assertEqual(app.pending['mode'], 'append')
        self.assertEqual(app.pending['step'], 'confirm')
        with self.assertRaises(ValueError):
            app.existing_name('https://example.com/addemoji/' + self.name, 7)

    def wait_idle(self, app):
        for _ in range(200):
            if not app.running:
                return
            time.sleep(0.01)
        self.fail('job did not finish')

    def test_remote_append_adds_missing_and_refuses_while_busy(self):
        self.create()
        app = bot.Bot(self.api, self.pub, 'TestBot', items(3), owner=7)
        result = app.remote_append(self.name)
        self.assertTrue(result['started'])
        self.wait_idle(app)
        self.assertEqual(len(self.api.sets[self.name]['stickers']), 3)
        app.running = True
        with self.assertRaises(RuntimeError):
            app.remote_append(self.name)
        app.running = False
        with self.assertRaises(ValueError):
            app.remote_append('other_by_TestBot')
        self.assertEqual([s['name'] for s in app.owned_sets()], [self.name])

    def test_failed_progress_message_does_not_stop_upload_or_retry_message(self):
        self.create()
        app = bot.Bot(self.api, self.pub, 'TestBot', items(3), owner=7)
        original = self.api.call
        def fail_notification(method, params=None, file=None):
            if method == 'sendMessage':
                self.api.calls.append((method, params, file))
                raise bot.ApiError(method, 0, 'simulated lost response')
            return original(method, params, file)
        self.api.calls.clear()
        with patch.object(self.api, 'call', side_effect=fail_notification):
            self.assertTrue(app.remote_append(self.name)['started'])
            self.wait_idle(app)
            app.live.thread.join(1)
        self.assertFalse(app.live.thread.is_alive())
        self.assertTrue(app.status.startswith('Готово.'))
        self.assertEqual(len(self.api.sets[self.name]['stickers']), 3)
        self.assertEqual(sum(m == 'sendMessage' for m, _, _ in self.api.calls), 1)
        self.assertTrue(self.pub.state['cache'].get('7:hash-2'))

    def test_control_accepts_and_uploads_while_start_message_is_blocked(self):
        self.create()
        app = bot.Bot(self.api, self.pub, 'TestBot', items(3), owner=7)
        server = bot.serve_control(app, 'fixture-token', 0)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        entered, release, uploaded = threading.Event(), threading.Event(), threading.Event()
        original = self.api.call
        def slow_notification(method, params=None, file=None):
            if method == 'sendMessage':
                entered.set()
                release.wait(5)
            result = original(method, params, file)
            if method == 'addStickerToSet':
                uploaded.set()
            return result
        request = urllib.request.Request(f'http://127.0.0.1:{server.server_address[1]}/append',
            data=json.dumps({'names': [self.name], 'files': ['2.tgs']}).encode(),
            headers={'Authorization': 'Bearer fixture-token', 'Content-Type': 'application/json'})
        with patch.object(self.api, 'call', side_effect=slow_notification):
            try:
                with urllib.request.urlopen(request, timeout=1) as response:
                    self.assertEqual(response.status, 202)
                    self.assertTrue(json.load(response)['started'])
                self.assertTrue(entered.wait(1))
                self.assertTrue(uploaded.wait(1), 'uploads must not wait for the chat notification')
                self.assertFalse(release.is_set())
            finally:
                release.set()
                self.wait_idle(app)
                if app.live:
                    app.live.thread.join(1)
        self.assertTrue(app.status.startswith('Готово.'))
        self.assertEqual(len(self.api.sets[self.name]['stickers']), 3)

    def test_set_sticker_recognised_by_content_despite_new_ids(self):
        # Real Telegram: a set's sticker has another file_id and file_unique_id than its upload.
        self.create()
        for n, entry in enumerate(self.api.sets[self.name]['stickers']):
            entry.update(file_id=f'set-{n}', file_unique_id=f'set-uid-{n}', file_size=1)
        files = {'set-0': b'0', 'set-1': b'1'}
        self.pub.state['cache'].clear()
        self.pub.state.get('inventory', {}).clear()
        self.api.calls.clear()
        with patch.object(bot, 'download', lambda api, file_id: files[file_id]):
            self.pub.append(7, self.name, [dict(i, hash=bot.hashlib.sha256(i['data']).hexdigest()) for i in items(3)], self.progress.append)
            self.assertEqual(sum(m == 'addStickerToSet' for m, _, _ in self.api.calls), 1)
            self.assertEqual(len(self.pub.state['set_hashes']), 2)
            self.api.calls.clear()
            with patch.object(bot, 'download', side_effect=AssertionError('downloaded twice')):
                self.pub.append(7, self.name, [dict(i, hash=bot.hashlib.sha256(i['data']).hexdigest()) for i in items(2)], self.progress.append)
        self.assertFalse(any(m == 'addStickerToSet' for m, _, _ in self.api.calls))

    def test_remote_append_only_the_chosen_file(self):
        self.create()
        app = bot.Bot(self.api, self.pub, 'TestBot', items(4), owner=7)
        self.api.calls.clear()
        app.remote_append(self.name, ['3.tgs'])
        self.wait_idle(app)
        uploads = [f[0] for m, _, f in self.api.calls if m == 'uploadStickerFile']
        self.assertEqual(uploads, ['3.tgs'])
        self.assertEqual(len(self.api.sets[self.name]['stickers']), 3)
        # one to decide what to add, one to find what came out
        self.assertEqual(sum(m == 'getStickerSet' for m, _, _ in self.api.calls), 2)
        with self.assertRaises(ValueError):
            app.remote_append(self.name, ['missing.tgs'])

    def test_remote_append_several_files_to_several_sets_then_shows_them(self):
        files = [dict(i, hash=bot.hashlib.sha256(i['data']).hexdigest()) for i in items(4)]
        self.api.sizes = True
        app = bot.Bot(self.api, self.pub, 'TestBot', files, owner=7)
        with patch.object(bot, 'download', lambda api, file_id: file_id.removeprefix('file-').removesuffix('.tgs').encode()):
            self.create(files[:1])
            self.pub.publish(7, 'Blue stickers', 'stickers_by_TestBot', 'regular', files[:1], self.progress.append)
            self.api.calls.clear()
            result = app.remote_append([self.name, 'stickers_by_TestBot'], ['3.tgs', '0.tgs', '2.tgs'])
            self.wait_idle(app)
        self.assertEqual(len(result['links']), 2)
        for name in (self.name, 'stickers_by_TestBot'):
            self.assertEqual([s['file_id'] for s in self.api.sets[name]['stickers']], ['file-0.tgs', 'file-3.tgs', 'file-2.tgs'])
        # in the order asked, set after set, the one already there too
        # the stickers as stickers; the custom emoji (no sendSticker for them) as emoji in messages
        sent = [p['sticker'] for m, p, _ in self.api.calls if m == 'sendSticker']
        self.assertEqual(sent, ['file-3.tgs', 'file-0.tgs', 'file-2.tgs'])
        emoji = [p['entities'][0]['custom_emoji_id'] for m, p, _ in self.api.calls if m == 'sendMessage' and p.get('entities')]
        self.assertEqual(emoji, ['emoji-3', 'emoji-0', 'emoji-2'])
        self.assertEqual(app.links, result['links'])

    def test_control_server_needs_the_token(self):
        self.create()
        app = bot.Bot(self.api, self.pub, 'TestBot', items(2), owner=7)
        server = bot.serve_control(app, 'secret', 0)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        url = f'http://127.0.0.1:{server.server_address[1]}/sets'
        with self.assertRaises(urllib.error.HTTPError) as denied:
            urllib.request.urlopen(url)
        self.assertEqual(denied.exception.code, 403)
        request = urllib.request.Request(url, headers={'Authorization': 'Bearer secret'})
        sets = json.loads(urllib.request.urlopen(request).read())['sets']
        self.assertEqual(sets[0]['name'], self.name)

    def test_archive_reloaded_for_each_operation(self):
        app = bot.Bot(self.api, self.pub, 'TestBot', items(1), owner=7, archive=Path('new.zip'))
        with patch.object(bot.v1, 'read_pack', return_value=items(3)) as read:
            app.reload()
        self.assertEqual(len(app.files), 3)
        read.assert_called_once_with(Path('new.zip'), max_files=200)


if __name__ == '__main__':
    unittest.main()
