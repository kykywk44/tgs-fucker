"""Compose six parallax rows from exact tlottie sprites; encode a seamless H.264 loop."""
import argparse, hashlib, json, math, shutil, subprocess, time
from pathlib import Path
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[2]
CFG=json.loads((Path(__file__).with_name('scene.json')).read_text('utf-8'))
OUT=ROOT/'exports/blue-crowd';OUT.mkdir(parents=True,exist_ok=True)
W,H,FPS=CFG['width'],CFG['height'],CFG['fps']
N=round(CFG['seconds']*FPS)
parser=argparse.ArgumentParser()
parser.add_argument('--preview',action='store_true')
parser.add_argument('--output',default='blue-crowd-trailer-v3.mp4')
args=parser.parse_args()

def camera(t):
    """Integral of cosine velocity ramps: continuous position, speed and acceleration."""
    b0,b1=CFG['camera']['brake'];a0,a1=CFG['camera']['resume'];T=CFG['seconds']
    travel=CFG['periodColumns']*CFG['pitch']
    effective=b0+(b1-b0)/2+(a1-a0)/2+(T-a1)
    speed=travel/effective
    if t<=b0:return speed*t
    x=t-b0;length=b1-b0
    if t<b1:return speed*(b0+x/2+length/(2*math.pi)*math.sin(math.pi*x/length))
    stopped=speed*(b0+length/2)
    if t<=a0:return stopped
    x=t-a0;length=a1-a0
    if t<a1:return stopped+speed*(x/2-length/(2*math.pi)*math.sin(math.pi*x/length))
    return stopped+speed*(length/2+t-a1)

start,end=json.loads((OUT/'assets.json').read_text())['hero']
PASSES=('body','laptop')
base={p:[Image.open(OUT/f'typing/{p}/{f:03d}.png').convert('RGBA') for f in range(120)] for p in PASSES}
banks=[]
print('Preparing six depth layers, bodies and laptops...',flush=True)
for row in CFG['rows']:
    bank={}
    for p in PASSES:
        bank[p]=[]
        for original in base[p]:
            sprite=original.resize((row['size'],row['size']),Image.Resampling.LANCZOS)
            bbox=sprite.getbbox()
            bank[p].append((sprite.crop(bbox),bbox))
    banks.append(bank)
del base
overlay=CFG['whiteOverlay']
white=Image.new('RGB',(W,H),'white')
gradient=Image.new('L',(1,H))
gradient.putdata([round(255*(overlay['opacityTop']+(overlay['opacityBottom']-overlay['opacityTop'])*
    max(0,min(1,(y-overlay['top'])/(overlay['bottom']-overlay['top']))))) for y in range(H)])
gradient=gradient.resize((W,H))

def paste(canvas,item,cx,y,size):
    sprite,bbox=item
    x=round(cx-size/2)+bbox[0];y=round(y)+bbox[1]
    canvas.paste(sprite,(x,y),sprite)

def frame(f):
    t=f/FPS
    cam=camera(t)
    canvas=Image.new('RGB',(W,H),'white')
    # Six staggered rows, farthest first. Their spacing and camera speed share
    # the same depth scale, so the periodic world is exact at the loop seam.
    for r in range(5,-1,-1):
        if r==0:
            # Exactly one screen-space white→transparent overlay above the five
            # background rows and below the untouched opaque foreground row.
            canvas.paste(white,(0,0),gradient)
        row=CFG['rows'][r];size=row['size'];scale=size/CFG['rows'][0]['size']
        pitch=CFG['pitch']*scale
        origin=W/2+(-6-W/2)*scale+(r%2)*pitch/2
        first=math.floor((cam*scale-origin-size/2)/pitch)-1
        last=math.ceil((W+cam*scale-origin+size/2)/pitch)+1
        actors=[]
        for col in range(first,last+1):
            x=origin+col*pitch-cam*scale
            identity=col%CFG['periodColumns']
            seed=(r*173+identity*97+41)%997
            cycles=[3,4,5,6][seed%4]
            phase=(f*cycles/N+seed/997)%1
            phase_index=round(phase*120)%120
            hero=r==0 and col==CFG['hero']['column'] and start<=f<=end
            if r==0 and identity==CFG['hero']['column']%CFG['periodColumns']:
                phase_index=round(((t/2)%1)*120)%120
            actors.append((x,phase_index,hero))
        # Row-local stacking: all bodies first, then every lid. A neighbour's
        # shoulder can never paint over a laptop, while row depth stays intact.
        for p in PASSES:
            for x,phase_index,hero in actors:
                if hero:
                    with Image.open(OUT/f'hero/{p}/{f:04d}.png') as original:
                        image=original.convert('RGBA').resize((size,size),Image.Resampling.LANCZOS)
                    bounds=image.getbbox();item=(image.crop(bounds),bounds)
                else:item=banks[r][p][phase_index]
                paste(canvas,item,x,row['y'],size)
    return canvas

keyframes=[180,240,285,330,390,435,480,540,615]
sheet=Image.new('RGB',(960*3,540*3+28*3),'white')
draw=ImageDraw.Draw(sheet)
for i,f in enumerate(keyframes):
    image=frame(f);x=i%3*960;y=i//3*568
    sheet.paste(image.resize((960,540),Image.Resampling.LANCZOS),(x,y+28))
    draw.text((x+12,y+6),f'{f/FPS:.2f}s',fill='#335375')
sheet.save(OUT/'storyboard.jpg',quality=92)
frame(345).save(OUT/'poster.png')
assert camera(0)==0
assert abs(camera(CFG['seconds'])-CFG['periodColumns']*CFG['pitch'])<1e-7
assert camera(CFG['camera']['brake'][1])==camera(CFG['camera']['resume'][0])
first,loop=frame(0),frame(N)
assert first.tobytes()==loop.tobytes(),'Loop is not pixel exact'
first.save(OUT/'loop-start.png');loop.save(OUT/'loop-end.png')
motion=json.loads((OUT/'motion.json').read_text())
assert all(m['typingWeight']==0 for m in motion if m['frame']/FPS>=CFG['hero']['settle'][1])
assert all(m['mouthOpacity']==100 for m in motion),'Smile must morph without fading'
assert CFG['camera']['resume'][0]<CFG['hero']['lowerHand'][0]
assert max(abs(m['handAngle']) for m in motion if 6.5<=m['frame']/FPS<=7.8)<=CFG['hero']['handSwayDegrees']+CFG['hero']['handWaveDegrees']+1e-8
assert max(abs(m['handAngle']) for m in motion if 7<=m['frame']/FPS<=7.65)>6
# At the transition frame the composited protagonist must still be the exact
# incoming typing pose; neither lid nor head can jump to another source frame.
size=CFG['rows'][0]['size'];incoming=Image.new('RGB',(size,size),'white');hero_start=incoming.copy()
index=round(((start/FPS)/2%1)*120)%120
for p in PASSES:
    paste(incoming,banks[0][p][index],size/2,0,size)
    with Image.open(OUT/f'hero/{p}/{start:04d}.png') as original:
        image=original.convert('RGBA').resize((size,size),Image.Resampling.LANCZOS)
    bbox=image.getbbox();paste(hero_start,(image.crop(bbox),bbox),size/2,0,size)
assert incoming.tobytes()==hero_start.tobytes(),'Incoming hero pose jumps'
print('Pixel-exact 12s loop verified; camera stops during the hero beat.',flush=True)
if args.preview:raise SystemExit(0)

ffmpeg=shutil.which('ffmpeg') or 'C:/Program Files/FFmpeg 8/ffmpeg.exe'
target=OUT/args.output
command=[ffmpeg,'-y','-hide_banner','-loglevel','warning','-f','rawvideo','-pixel_format','rgb24',
         '-video_size',f'{W}x{H}','-framerate',str(FPS),'-i','pipe:0','-an',
         '-c:v','libopenh264','-b:v','16M','-maxrate','20M','-bufsize','32M',
         '-vf','scale=out_color_matrix=bt709:out_range=tv','-colorspace','bt709',
         '-color_primaries','bt709','-color_trc','bt709',
         '-pix_fmt','yuv420p','-movflags','+faststart',str(target)]
started=time.monotonic()
with (OUT/'encode.log').open('w',encoding='utf-8') as log:
    process=subprocess.Popen(command,stdin=subprocess.PIPE,stderr=log)
    try:
        for f in range(N):
            process.stdin.write(frame(f).tobytes())
            if f%60==0:print(f'Render {f}/{N} ({time.monotonic()-started:.1f}s)',flush=True)
        process.stdin.close()
        if process.wait()!=0:raise RuntimeError('ffmpeg failed; see exports/blue-crowd/encode.log')
    except BaseException:
        process.kill();process.wait();raise
report={'width':W,'height':H,'fps':FPS,'seconds':CFG['seconds'],'frames':N,'rows':6,
        'loopPixelExact':True,'cameraHold':[CFG['camera']['brake'][1],CFG['camera']['resume'][0]],
        'rowStacking':['all bodies','all laptops'],'mirroredLeftHand':True,'gestureThrust':False,
        'handOutlineWidth':7.44,'smileMorph':True,'noTypingAfterGesture':True,
        'whiteSmile':True,'silent':True,'whiteOverlayAboveRows':[1,2,3,4,5],
        'opaqueCharacters':True,'bytes':target.stat().st_size,
        'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
(OUT/'verification.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(str(target),flush=True)
