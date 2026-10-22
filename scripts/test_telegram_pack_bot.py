"""Offline tests: ZIP integrity, identity isolation, retries and creation payloads."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile, ZIP_DEFLATED

spec = importlib.util.spec_from_file_location('pack_bot', Path(__file__).with_name('telegram-pack-bot.py'))
bot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bot)


class FakeAPI:
    def __init__(self):
        self.calls = []
        self.sets = {}
        self.timeout_after_create = False

    def call(self, method, params=None, file=None):
        self.calls.append((method, params, file))
        if method == 'uploadStickerFile':
            return {'file_id': 'uploaded-' + file[0]}
        if method == 'getStickerSet':
            if params['name'] not in self.sets:
                raise bot.ApiError(method, 400, 'Bad Request: STICKERSET_INVALID')
            return self.sets[params['name']]
        if method == 'createNewStickerSet':
            self.sets[params['name']] = {'title': params['title'], 'sticker_type': params['sticker_type'], 'stickers': params['stickers']}
            if self.timeout_after_create:
                raise bot.ApiError(method, 0, 'Simulated timeout')
            return True
        if method == 'sendMessage':
            return {'message_id': 1}
        raise AssertionError(method)


class PackBotTests(unittest.TestCase):
    def setUp(self):
        base = (bot.ROOT / 'exports/bot-tests').resolve()
        assert base.is_relative_to(bot.ROOT.resolve())
        base.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=base)
        assert Path(self.temp.name).resolve().is_relative_to(base)
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'state.json'
        self.api = FakeAPI()
        self.pub = bot.Publisher(self.api, self.path)
        self.files = [{'name': 'a.tgs', 'hash': 'aaa', 'data': b'fixture', 'emoji': ['👉', '👌']}]

    def publish(self, owner=123, kind='custom_emoji'):
        return self.pub.publish(owner, 'Синий пак', 'blue_by_TestBot', kind, self.files, lambda _: None)

    def test_real_archive(self):
        files = bot.read_pack(bot.ROOT / 'exports/blue-pack.zip')
        self.assertEqual(len(files), len(list((bot.ROOT / 'packs/blue/ready').glob('*.tgs'))))
        self.assertFalse(any('technologist' in f['name'] for f in files))
        self.assertEqual(next(f for f in files if f['name'] == 'family.tgs')['emoji'], ['👨‍👩‍👧‍👦'])
        self.assertEqual(next(f for f in files if f['name'] == 'finger-ok.tgs')['emoji'], ['👉', '👌'])

    def test_corrupt_archive_rejected(self):
        source = bot.ROOT / 'exports/blue-pack.zip'
        target = Path(self.temp.name) / 'bad.zip'
        with ZipFile(source) as archive, ZipFile(target, 'w', ZIP_DEFLATED) as out:
            for item in archive.infolist():
                data = archive.read(item)
                if item.filename.endswith('family.tgs'):
                    data += b'changed'
                out.writestr(item.filename, data)
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            bot.read_pack(target)

    def test_emoji_clusters(self):
        self.assertEqual(bot.split_emoji('👨‍👩‍👧‍👦✌️👍🏽🇷🇺'), ['👨‍👩‍👧‍👦', '✌️', '👍🏽', '🇷🇺'])

    def test_static_scalars_must_be_numbers(self):
        with self.assertRaises(ValueError):
            bot.validate_static_properties({'ks': {'o': {'a': 0, 'k': [100]}}})
        bot.validate_static_properties({'ks': {'o': {'a': 0, 'k': 100}, 'p': {'a': 0, 'k': [10, 20]}}})

    def test_names(self):
        self.assertEqual(bot.set_name('blue', 'TestBot', 'regular'), 'blue_by_TestBot')
        self.assertEqual(bot.set_name('https://t.me/addemoji/blue_by_TestBot', 'TestBot', 'custom_emoji'), 'blue_by_TestBot')
        self.assertEqual(bot.set_name('blue', 'TestBot', 'regular', True), 'blue_stickers_by_TestBot')
        for value in ('123', 'a__b', 'a_', 'юзер', 'a' * 64):
            with self.assertRaises(ValueError):
                bot.set_name(value, 'TestBot', 'regular')

    def test_owner_payload_and_no_repainting(self):
        self.assertIn('/addemoji/', self.publish())
        payload = next(p for m, p, _ in self.api.calls if m == 'createNewStickerSet')
        self.assertEqual(payload['user_id'], 123)
        self.assertEqual(payload['stickers'][0]['emoji_list'], ['👉', '👌'])
        self.assertEqual(payload['stickers'][0]['format'], 'animated')
        self.assertNotIn('needs_repainting', payload)

    def test_persistent_cache_and_resume_after_uncertain_create(self):
        self.api.timeout_after_create = True
        with self.assertRaises(bot.ApiError):
            self.publish()
        self.pub = bot.Publisher(self.api, self.path)
        self.publish()
        self.assertEqual(sum(m == 'uploadStickerFile' for m, _, _ in self.api.calls), 1)
        self.assertEqual(sum(m == 'createNewStickerSet' for m, _, _ in self.api.calls), 1)

    def test_both_types_reuse_uploads(self):
        self.publish()
        link = self.pub.publish(123, 'Синий пак', 'stickers_by_TestBot', 'regular', self.files, lambda _: None)
        self.assertIn('/addstickers/', link)
        self.assertEqual(sum(m == 'uploadStickerFile' for m, _, _ in self.api.calls), 1)

    def test_taken_name_not_adopted(self):
        self.api.sets['blue_by_TestBot'] = {'title': 'Синий пак', 'sticker_type': 'custom_emoji', 'stickers': [1]}
        with self.assertRaisesRegex(ValueError, 'занята'):
            self.publish()
        self.assertFalse(any(m == 'createNewStickerSet' for m, _, _ in self.api.calls))

    def test_owner_change_does_not_reuse_other_users_upload(self):
        self.publish()
        with self.assertRaises(ValueError):
            self.publish(owner=456)
        self.assertEqual(sum(m == 'uploadStickerFile' for m, _, _ in self.api.calls), 2)

    def test_pairing_and_private_owner_only(self):
        app = bot.Bot(self.api, self.pub, 'TestBot', self.files)
        def message(uid, text, kind='private'):
            return {'message': {'from': {'id': uid}, 'chat': {'id': uid, 'type': kind}, 'text': text}}
        app.handle(message(123, '/start wrong'))
        self.assertIsNone(app.owner)
        app.handle(message(123, '/start ' + app.pair, 'group'))
        self.assertIsNone(app.owner)
        app.handle(message(123, '/start ' + app.pair))
        self.assertEqual(json.loads(self.path.read_text())['owner'], 123)
        app.handle(message(456, 'Стикерпак'))
        self.assertEqual(app.pending['step'], 'type')
        self.assertNotIn('kinds', app.pending)
        self.assertFalse(any(m == 'uploadStickerFile' for m, _, _ in self.api.calls))

    def test_rate_limit_is_reported_and_retry_after_honored(self):
        api = bot.API('TEST_TOKEN')
        waits = []
        api.on_wait = lambda method, seconds: waits.append((method, seconds))
        limited = io.BytesIO(json.dumps({'ok': False, 'error_code': 429, 'parameters': {'retry_after': 120}}).encode())
        success = io.BytesIO(json.dumps({'ok': True, 'result': {'file_id': 'cached'}}).encode())
        with patch.object(bot.urllib.request, 'urlopen', side_effect=[limited, success]), patch.object(bot.time, 'sleep') as sleep:
            self.assertEqual(api.call('uploadStickerFile')['file_id'], 'cached')
        self.assertEqual(waits, [('uploadStickerFile', 121)])
        sleep.assert_called_once_with(121)

    def test_status_distinguishes_upload_and_rate_limit(self):
        app = bot.Bot(self.api, self.pub, 'TestBot', self.files, 123)
        app.status = 'Загружаю 11/44: grimacing-face.tgs…'
        with patch.object(bot.time, 'time', return_value=100):
            app.on_wait('uploadStickerFile', 121)
            self.assertIn('121 сек.', app.status_text())
            self.assertIn('11/44', app.status_text())
        with patch.object(bot.time, 'time', return_value=222):
            self.assertEqual(app.status_text(), app.status)


if __name__ == '__main__':
    unittest.main()
