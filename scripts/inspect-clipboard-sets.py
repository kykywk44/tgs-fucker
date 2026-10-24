from pathlib import Path
exec(Path('scripts/publish-clipboard-webm.py').read_text('utf-8-sig').split('def main():')[0])
for name in receipt['items']:
 d=call('getStickerSet',{'name':name}); print(name,len(d['stickers']),[(i,s.get('emoji'),s.get('file_size'),s.get('is_video'),s.get('file_unique_id')) for i,s in enumerate(d['stickers']) if s.get('emoji')=='📝'])
 (folder/('live-'+name+'.json')).write_text(json.dumps(d),encoding='utf-8')
