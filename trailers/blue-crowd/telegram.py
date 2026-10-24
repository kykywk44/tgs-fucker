"""Small compatible MP4 from the approved master. No frame skipping or audio."""
import argparse, json, shutil, subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'exports/blue-crowd'
parser=argparse.ArgumentParser()
parser.add_argument('--input',type=Path,default=OUT/'blue-crowd-trailer-v3.mp4')
parser.add_argument('--output',type=Path,default=OUT/'blue-crowd-telegram.mp4')
args=parser.parse_args()
ffmpeg=shutil.which('ffmpeg') or 'C:/Program Files/FFmpeg 8/ffmpeg.exe'
ffprobe=shutil.which('ffprobe') or str(Path(ffmpeg).with_name('ffprobe.exe'))
args.output.parent.mkdir(parents=True,exist_ok=True)
subprocess.run([ffmpeg,'-y','-hide_banner','-loglevel','error','-i',str(args.input),
    '-vf','scale=1280:720:flags=lanczos,fps=30','-an','-c:v','libopenh264',
    '-profile:v','high','-coder','cabac','-b:v','1400k','-maxrate','1800k',
    '-bufsize','2800k','-g','60','-pix_fmt','yuv420p','-movflags','+faststart',str(args.output)],check=True)
info=json.loads(subprocess.check_output([ffprobe,'-v','error','-select_streams','v:0',
    '-show_entries','stream=width,height,r_frame_rate,nb_frames:format=duration,size','-of','json',str(args.output)]))
video=info['streams'][0]
assert (video['width'],video['height'],video['r_frame_rate'])==(1280,720,'30/1')
assert int(video['nb_frames'])==round(float(info['format']['duration'])*30)
subprocess.run([ffmpeg,'-v','error','-i',str(args.output),'-f','null','-'],stdout=subprocess.DEVNULL,check=True)
args.output.with_suffix('.json').write_text(json.dumps(info,indent=2)+'\n',encoding='utf-8')
print(f'{args.output}: {args.output.stat().st_size/1_000_000:.2f} MB; full decode PASS')
