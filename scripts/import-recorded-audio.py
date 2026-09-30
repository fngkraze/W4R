"""Import CC0 field recordings. Requires Python 3, numpy and ffmpeg.
Run from project root; source downloads are cached outside the project.
See client/public/audio/CREDITS.md for authors and licenses.
"""
import pathlib, urllib.request, urllib.parse, subprocess, tempfile, wave
import numpy as np
CACHE=pathlib.Path(tempfile.gettempdir())/'stickup039'/'audio'
OUT=pathlib.Path('client/public/audio')
CACHE.mkdir(parents=True,exist_ok=True); OUT.mkdir(parents=True,exist_ok=True)
BASE='https://raw.githubusercontent.com/petroulacl/fps-asset-kit/main/'
SOURCES={
 'ar15-2.wav':BASE+urllib.parse.quote('sfx/firearm_sfx/Prepared SFX Library/AR-15/D_32P.wav'),
 'ak-2.wav':BASE+urllib.parse.quote('sfx/firearm_sfx/Prepared SFX Library/AK-47/C_28P.wav'),
 'reload.wav':'https://opengameart.org/sites/default/files/assaultriflereload1_0.wav',
}
for side in ['L','R']:
 for n in range(1,4):
  name=f'stone-{side}{n}.flac'
  SOURCES[name]=BASE+urllib.parse.quote(f'sfx/footsteps/Fantozzi-footsteps/flac/Fantozzi-Stone{side}{n}.flac')
for name,url in SOURCES.items():
 if not (CACHE/name).exists():
  urllib.request.urlretrieve(url,CACHE/name)
def read(name):
 return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(CACHE/name),'-f','f32le','-ac','1','-ar','44100','-']),dtype='<f4').copy()
def write(name,a,peak=.86):
 a=a.copy(); a-=np.mean(a); a*=peak/max(float(np.max(np.abs(a))),1e-8)
 # Very short fades remove edit clicks while preserving the recorded transient.
 fade=min(88,len(a)//4);a[:fade]*=np.linspace(0,1,fade);a[-fade:]*=np.linspace(1,0,fade)
 with wave.open(str(OUT/(name+'.wav')),'wb') as f:
  f.setnchannels(1);f.setsampwidth(2);f.setframerate(44100);f.writeframes((a*32767).astype('<i2').tobytes())
def crop(a,start,end):return a[int(start*44100):int(end*44100)]
a=read('ar15-2.wav')
write('m4',crop(a,.701,1.70));write('m4-2',crop(a,5.64,6.64))
a=read('ak-2.wav')
write('ak',crop(a,.608,1.61));write('ak-2',crop(a,3.248,4.25))
a=read('reload.wav')
write('mag-out',crop(a,.15,.51),.75);write('mag-in',crop(a,1.015,1.18),.78);write('bolt',crop(a,1.195,1.50),.78)
for i,name in enumerate(['stone-L1.flac','stone-R1.flac','stone-L2.flac','stone-R2.flac','stone-L3.flac','stone-R3.flac']):
 write('step' if i==0 else f'step-{i+1}',read(name),.72)
write('land',read('stone-R1.flac'),.85);write('jump',read('stone-L3.flac'),.55)
print('Imported recorded rifle reports, reload handling and six stone footsteps.')
