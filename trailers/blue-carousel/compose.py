"""White ultrawide emoji strip: opening pop, accelerating cuts, one flag cycle."""
import json,math,subprocess,shutil
from pathlib import Path
from PIL import Image,ImageDraw,ImageChops
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'exports/blue-carousel'
cfg=json.loads((OUT/'timeline.json').read_text('utf8'));W,H,FPS=cfg['width'],cfg['height'],cfg['fps']
def smooth(x):
    x=max(0,min(1,x));return x*x*x*(x*(x*6-15)+10)
def frame(n):
    info=cfg['frameInfo'][n%cfg['frames']];t=n%cfg['frames']/FPS
    im=Image.open(OUT/'stages'/f"{n%cfg['frames']:04}.png").convert('RGBA')
    scale,angle,alpha=cfg['iconSize']/360,0,1
    if info['kind']=='intro':
        u=t/.8
        base=.015+.985*(1-(1-min(1,u))**3)
        bump=.065*math.sin(math.pi*max(0,min(1,(t-.30)/.7))) if .3<t<1 else 0
        scale*=base+bump
        angle=-28*(1-smooth(t/.9)) # PIL is counterclockwise-positive; start clockwise.
        alpha=smooth(t/.12)
    elif info['kind']=='exit':
        # A straight, quick shrink: no rotation, easing tail or wash to white.
        u=max(0,min(1,info['local']/.18))
        scale*=1-u
        if u>=1:alpha=0
    # Exact white first/last frames keep the restart invisible.
    if n%cfg['frames']==0 or n%cfg['frames']==cfg['frames']-1:alpha=0
    size=max(1,round(360*scale));im=im.resize((size,size),Image.Resampling.LANCZOS)
    if angle:im=im.rotate(angle,Image.Resampling.BICUBIC,expand=True)
    if alpha<1:im.putalpha(im.getchannel('A').point(lambda v:round(v*alpha)))
    bg=Image.new('RGBA',(W,H),'white');bg.alpha_composite(im,((W-im.width)//2,(H-im.height)//2))
    return bg.convert('RGB')
first,last=frame(0),frame(cfg['frames']-1);assert first.tobytes()==last.tobytes()
first.save(OUT/'loop-start.png');last.save(OUT/'loop-end.png')
frame(65).save(OUT/'poster.png')
key=[0,65]+[round(s['start']*FPS)+min(5,round((s['end']-s['start'])*FPS)-1) for s in cfg['segments'] if s['kind'] in ('opening','ending')]+[round(cfg['flagStart']*FPS),round((cfg['flagStart']+1.5)*FPS),cfg['frames']-1]
sheet=Image.new('RGB',(960*3,220*4),'#eef1f4');draw=ImageDraw.Draw(sheet)
for i,n in enumerate(key):
    x=i%3*960;y=i//3*220;im=frame(min(n,cfg['frames']-1)).resize((960,180))
    sheet.paste(im,(x,y+30));draw.text((x+8,y+8),f'{n/60:.2f}s',fill='#335375')
sheet.save(OUT/'storyboard.jpg',quality=94)
ffmpeg=shutil.which('ffmpeg') or 'C:/Program Files/FFmpeg 8/ffmpeg.exe'
target=OUT/'blue-emoji-strip-v3.mp4'
cmd=[ffmpeg,'-y','-hide_banner','-loglevel','error','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W}x{H}',
     '-framerate',str(FPS),'-i','pipe:0','-an','-c:v','libopenh264','-b:v','5000k','-g','120','-pix_fmt','yuv420p','-movflags','+faststart',str(target)]
p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
try:
    for n in range(cfg['frames']):p.stdin.write(frame(n).tobytes())
finally:p.stdin.close()
assert p.wait()==0
small=OUT/'blue-emoji-strip-telegram-v3.mp4'
subprocess.run([ffmpeg,'-y','-hide_banner','-loglevel','error','-i',str(target),'-vf','scale=1280:240:flags=lanczos,fps=30','-an',
                '-c:v','libopenh264','-b:v','1400k','-g','60','-pix_fmt','yuv420p','-movflags','+faststart',str(small)],check=True)
for f in [target,small]:
    subprocess.run([ffmpeg,'-v','error','-i',str(f),'-f','null','-'],check=True)
    print(f'{f.name}: {f.stat().st_size/1e6:.2f} MB; full decode PASS')
