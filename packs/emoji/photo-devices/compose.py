import json,sys,subprocess,shutil,argparse
from pathlib import Path
import numpy as np
from PIL import Image,ImageChops,ImageDraw,ImageOps
from mesh import texture_mesh
parser=argparse.ArgumentParser()
parser.add_argument('src',type=Path);parser.add_argument('cache',type=Path)
parser.add_argument('--id',type=int,choices=[554,556,558,573,606,621,632,950,255,222]);parser.add_argument('--photo',type=Path);parser.add_argument('--dest',type=Path)
args=parser.parse_args();src,cache=args.src,args.cache;out=args.dest or cache
out.mkdir(parents=True,exist_ok=True)
Image.MAX_IMAGE_PIXELS=25000000
with Image.open(args.photo or src/'private/photo.png') as im:
    assert im.width*im.height<=25000000,'Image too large'
    photo=ImageOps.exif_transpose(im).convert('RGBA')
photo.thumbnail((1600,1600),Image.Resampling.LANCZOS)
def inverse_quad(quad,size=None):
    w,h=size or photo.size
    a,b=[],[]
    for (x,y),(u,v) in zip(quad,[(0,0),(w,0),(w,h),(0,h)]):
        a.extend([[x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]])
        b.extend([u,v])
    return np.linalg.solve(a,b).tolist()
for ident,name in [(554,'phone-photo-554'),(556,'laptop-photo-556'),(558,'printer-photo-558'),(573,'id-photo-573'),(606,'painting-photo-606'),(621,'letter-photo-621'),(632,'ballot-photo-632'),(950,'flag-photo-950'),(255,'egg-photo-255'),(222,'hat-photo-222')]:
    if args.id and ident!=args.id:continue
    if ident in [255,222]:
        with Image.open(args.photo or src/'private/staspng.png') as im: photo=ImageOps.exif_transpose(im).convert('RGBA')
        if not args.photo: photo=photo.crop((220,431,920,1240))
        photo=photo.crop(photo.getbbox())
    folder=cache/str(ident);frames=out/str(ident)/'frames';frames.mkdir(parents=True,exist_ok=True)
    quads=json.loads((folder/'projection.json').read_text())
    surfaces=json.loads((folder/'surfaces.json').read_text()) if (folder/'surfaces.json').exists() else None
    meshes=json.loads((folder/'mesh.json').read_text()) if ident==950 else None
    sheet=Image.new('RGB',(4*256,3*276),'#e8e8e8'); draw=ImageDraw.Draw(sheet)
    chosen=[0,20,40,52,60,80,100,120,130,146,154,178]
    brush=json.loads((folder/'brush.json').read_text()) if ident==606 else None
    painted=Image.new('L',(512,512));paint=ImageDraw.Draw(painted);prior=None
    for n,quad in enumerate(quads):
        base=Image.open(folder/f'parts/base{n:03}.png').convert('RGBA')
        if quad:
            image=photo
            f=n*2
            if ident==554 and 78<=f<100:
                z=1+8*(1-min(1,(f-78)/22))**3
                w,h=photo.size
                image=photo.transform(photo.size,Image.Transform.EXTENT,(w*(1-1/z)/2,h*(1-1/z)/2,w*(1+1/z)/2,h*(1+1/z)/2),Image.Resampling.BICUBIC)
            projected=image.transform((512,512),Image.Transform.PERSPECTIVE,inverse_quad(quad),Image.Resampling.BICUBIC)
            mask=Image.open(folder/f'parts/mask{n:03}.png').getchannel('A') if ident not in [255,222] else Image.new('L',(512,512),255)
            if ident==222:
                # Native animated front-lip curve clips the retreating portrait.
                mask=Image.open(folder/f'parts/mask{n:03}.png').getchannel('A')
            projected.putalpha(ImageChops.multiply(projected.getchannel('A'),mask))
            if ident==606:
                coeff=inverse_quad(quad,(512,512))
                if brush[n] and 26<=f<=150:
                    x,y=brush[n];a,b,c,d,e,g,h,i=coeff;den=h*x+i*y+1
                    uv=((a*x+b*y+c)/den,(d*x+e*y+g)/den)
                    if -90<uv[0]<602 and -90<uv[1]<602:
                        if prior:paint.line([prior,uv],fill=255,width=130)
                        paint.ellipse((uv[0]-65,uv[1]-65,uv[0]+65,uv[1]+65),fill=255);prior=uv
                reveal=painted
                if f>=134:
                    reveal=ImageChops.lighter(reveal,Image.new('L',(512,512),int(255*min(1,(f-134)/18))))
                reveal=reveal.transform((512,512),Image.Transform.PERSPECTIVE,coeff,Image.Resampling.BICUBIC)
                opacity=max(0,min(1,(178-f)/24)) if f>=154 else 1
                reveal=reveal.point(lambda a:int(a*opacity))
                projected.putalpha(ImageChops.multiply(projected.getchannel('A'),reveal))
            base=Image.alpha_composite(base,projected)
        if surfaces:
            for surface in surfaces[n]:
                if surface.get('mesh'):
                    projected=texture_mesh(photo,surface['mesh'])
                else:
                    try:coeff=inverse_quad(surface['quad'])
                    except np.linalg.LinAlgError:continue
                    projected=photo.transform((512,512),Image.Transform.PERSPECTIVE,coeff,Image.Resampling.BICUBIC)
                visible=Image.open(folder/'parts'/surface['mask']).convert('RGBA').getchannel('R')
                projected.putalpha(ImageChops.multiply(projected.getchannel('A'),visible))
                base=Image.alpha_composite(base,projected)
        if meshes:
            projected=texture_mesh(photo,meshes[n],2*np.pi*n/90);mask=Image.open(folder/f'parts/mask{n:03}.png').getchannel('A')
            projected.putalpha(ImageChops.multiply(projected.getchannel('A'),mask))
            base=Image.alpha_composite(base,projected)
        foreground=Image.open(folder/f'parts/front{n:03}.png').convert('RGBA')
        if ident==222 and quad:
            # Back rim stays below the portrait; the front lip covers its bottom.
            foreground.putalpha(ImageChops.multiply(foreground.getchannel('A'),ImageChops.invert(mask)))
        base=Image.alpha_composite(base,foreground)
        base.save(frames/f'f{n:04}.png')
        if n*2 in chosen:
            i=chosen.index(n*2); x,y=i%4*256,i//4*276
            draw.text((x+4,y+3),str(n*2),fill='black')
            sheet.paste(base.resize((256,256)),(x,y+20),base.resize((256,256)))
        if n==(45 if ident in [554,556] else 65):base.save(out/f'{name}.png')
    sheet.save(out/f'{name}-sheet.png')
    video=out/f'{name}.webm'
    for crf in [28,32,36,40,44,48,52,56]:
        subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-framerate','30','-i',str(frames/'f%04d.png'),'-an','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-b:v','0','-crf',str(crf),'-deadline','good','-cpu-used','3',str(video)],check=True)
        if video.stat().st_size<=256*1024:break
    assert video.stat().st_size<=256*1024,'WebM exceeds 256 KiB'
    subprocess.run(['ffmpeg','-v','error','-c:v','libvpx-vp9','-i',str(video),'-f','null','-'],check=True)
    if not args.dest:shutil.copy2(video,out.parent/'emoji'/video.name)
    print(f'{name}: {video.stat().st_size} bytes, VP9 alpha, 30 fps, 3 seconds')
