"""Compose four articulated vector characters in a periodic moving elevator."""
import argparse,json,math,shutil,subprocess,time,hashlib
from pathlib import Path
from PIL import Image,ImageDraw,ImageChops,ImageFilter

HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1]
CFG=json.loads((HERE/'scene.json').read_text('utf8'));OUT=ROOT/'exports/blue-elevator'
W,H,FPS,T=CFG['width'],CFG['height'],CFG['fps'],CFG['seconds'];N=FPS*T
parser=argparse.ArgumentParser();parser.add_argument('--preview',action='store_true');args=parser.parse_args()
motion=json.loads((OUT/'motion.json').read_text('utf8'))
bg=Image.open(HERE/CFG['background']).convert('RGB').resize((W,H),Image.Resampling.LANCZOS)
PICKED=[0,30,54,70,90,106,145,380,474,498,531,599]
# A tiny overscan gives the camera room to vibrate without exposing empty pixels.
ZOOM=1.028
depth_shades={}
for actor in CFG['actors']:
    # Keep ceiling-lit heads unchanged; progressively dim only the lower body.
    amount=.22 if actor['id'].startswith('back') else 0
    if amount:
        shade=Image.new('L',(1,963))
        shade.putdata([round(255*(1-amount*max(0,min(1,(y-290)/550))**1.15)) for y in range(963)])
        depth_shades[actor['id']]=shade.resize((481,963))
def frame(f):
    n=f%N;cab=motion['cabin'][n]
    canvas=bg.convert('RGBA')
    for actor in CFG['actors']:
        source=OUT/actor['id']/f'{n:04}.png'
        with Image.open(source) as im: sprite=im.convert('RGBA')
        if actor['id'] in depth_shades:
            alpha=sprite.getchannel('A');rgb=ImageChops.multiply(sprite.convert('RGB'),depth_shades[actor['id']].convert('RGB'))
            sprite=rgb.convert('RGBA');sprite.putalpha(alpha)
        if actor['mirror']:sprite=sprite.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        size=(round(481*actor['scale']),round(963*actor['scale']))
        sprite=sprite.resize(size,Image.Resampling.LANCZOS)
        # The original SVG has transparent margins; anchor its actual head center.
        center=(481-246 if actor['mirror'] else 246)*actor['scale']
        x=round(actor['x']-center);y=round(actor['y'])
        canvas.alpha_composite(sprite,(x,y))
    # Relative camera/cabin vibration is shared by architecture and feet;
    # independent spine/neck/arm response lives in the skinned SVG passes.
    theta=math.radians(cab['angle']);c=math.cos(theta)/ZOOM;s=math.sin(theta)/ZOOM
    cx,cy=W/2,H/2;dx,dy=cab['x'],cab['y']
    matrix=(c,s,cx-c*(cx+dx)-s*(cy+dy),-s,c,cy+s*(cx+dx)-c*(cy+dy))
    return canvas.convert('RGB').transform((W,H),Image.Transform.AFFINE,matrix,Image.Resampling.BICUBIC)

sheet=Image.new('RGB',(W//2*4,(H//2+28)*3),'#eef0f2');draw=ImageDraw.Draw(sheet)
for i,f in enumerate(PICKED):
    im=frame(f);x=(i%4)*W//2;y=(i//4)*(H//2+28)
    sheet.paste(im.resize((W//2,H//2),Image.Resampling.LANCZOS),(x,y+28))
    draw.text((x+9,y+8),f'{f/FPS:.2f}s',fill='#335375')
sheet.save(OUT/'storyboard.jpg',quality=94)
first,last=frame(0),frame(N)
assert first.tobytes()==last.tobytes(),'Loop endpoints differ'
first.save(OUT/'loop-start.png');last.save(OUT/'loop-end.png');frame(90).save(OUT/'poster.png')
report={'loop_pixel_exact':True,'frames':N,'fps':FPS,'seconds':T,'resolution':[W,H],
        'actors':CFG['actors'],'palette':CFG['palette'],'source_sha256':hashlib.sha256((HERE/'source.svg').read_bytes()).hexdigest(),
        'background_sha256':hashlib.sha256((HERE/'background.png').read_bytes()).hexdigest()}
(OUT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8')
print('Storyboard and pixel-exact loop endpoints verified',flush=True)
if args.preview:raise SystemExit(0)
ffmpeg=shutil.which('ffmpeg') or 'C:/Program Files/FFmpeg 8/ffmpeg.exe'
target=OUT/'blue-elevator-v6.mp4'
command=[ffmpeg,'-y','-hide_banner','-loglevel','error','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W}x{H}',
         '-framerate',str(FPS),'-i','pipe:0','-an','-c:v','libopenh264','-b:v','6500k','-maxrate','8500k','-bufsize','13000k',
         '-g','120','-vf','scale=out_color_matrix=bt709:out_range=tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',
         '-pix_fmt','yuv420p','-movflags','+faststart',str(target)]
process=subprocess.Popen(command,stdin=subprocess.PIPE);started=time.monotonic()
try:
    for n in range(N):
        process.stdin.write(frame(n).tobytes())
        if n%120==0:print(f'Compositing {n}/{N}, {time.monotonic()-started:.1f}s',flush=True)
finally:process.stdin.close()
assert process.wait()==0,'Encoder failed'
small=OUT/'blue-elevator-telegram-v6.mp4'
subprocess.run([ffmpeg,'-y','-hide_banner','-loglevel','error','-i',str(target),'-vf','scale=960:720:flags=lanczos,fps=30',
                '-an','-c:v','libopenh264','-profile:v','high','-coder','cabac','-b:v','1600k','-maxrate','2200k','-bufsize','3200k',
                '-g','60','-pix_fmt','yuv420p','-movflags','+faststart',str(small)],check=True)
for p in [target,small]:
    subprocess.run([ffmpeg,'-v','error','-i',str(p),'-f','null','-'],check=True)
    print(f'{p.name}: {p.stat().st_size/1e6:.2f} MB; full decode PASS',flush=True)
