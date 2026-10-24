"""Project the untouched private photo onto the already-rendered paper plane."""
import json,sys
from pathlib import Path
from PIL import Image
photo_path,folder=Path(sys.argv[1]),Path(sys.argv[2])
root=Path(__file__).resolve().parents[3]
photo=Image.open(photo_path).convert('RGBA')
frames=json.loads((folder/'projection.json').read_text())
(folder/'frames').mkdir(exist_ok=True)
for i,matrix in enumerate(frames):
    base=Image.open(root/f'exports/clipboard-6s/frames/f{i:04d}.png').convert('RGBA')
    if matrix:
        projected=photo.transform((512,512),Image.Transform.PERSPECTIVE,matrix,Image.Resampling.BICUBIC)
        base=Image.alpha_composite(base,projected)
    base.save(folder/f'frames/f{i:04d}.png')
    if i==132: base.save(folder/'preview.png')
assert (folder/'frames/f0000.png').read_bytes()==(folder/'frames/f0179.png').read_bytes(),'Loop seam'
