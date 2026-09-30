"""Bake only secondary hit/impact/wind effects. Weapon and footsteps are imported recordings."""
from pathlib import Path
import numpy as np
from scipy.signal import butter,sosfilt
from scipy.io.wavfile import write
rng=np.random.default_rng(38);rate=44100;out=Path('client/public/audio')
def noise(n,low=80,high=15000):return sosfilt(butter(2,[low,high],btype='bandpass',fs=rate,output='sos'),rng.normal(size=n))
def save(name,y):
 y=np.tanh(y);y/=max(1,np.max(np.abs(y))/0.94);write(out/(name+'.wav'),rate,(y*32767).astype(np.int16))
for name,duration,pitch in [('hit',.20,120),('impact',.23,2400)]:
 t=np.arange(int(rate*duration))/rate;y=noise(len(t),60,9000)*np.exp(-t/(duration*.22))*.75
 y+=np.sin(2*np.pi*pitch*t)*np.exp(-t/.015)*.22
 if name in ['step','land','hit','jump']:y=sosfilt(butter(2,1500,fs=rate,output='sos'),y)*1.2
 else:y+=np.sin(2*np.pi*(pitch*1.37)*t)*np.exp(-t/.045)*.07
 save(name,y)
t=np.arange(rate*8)/rate;y=noise(len(t),70,500)*(.06+.025*np.sin(t*.9));save('wind',y)
print('3 secondary sound effects baked')
