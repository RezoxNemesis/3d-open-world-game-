"""Original woven cloud-brocade textures, mathematical inputs only, MIT."""
from pathlib import Path
import math
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]/'assets/materials'
N=512
albedo=Image.new('RGB',(N,N)); normal=Image.new('RGB',(N,N))
for y in range(N):
    for x in range(N):
        u=x/N;v=y/N
        weave=.92+.035*math.sin(x*math.pi/2)+.025*math.sin(y*math.pi/2)
        # Interlocking curved cloud scrolls, repeated seamless cloth rather than painted logos.
        wave=math.sin(2*math.pi*(u*4+.15*math.sin(v*8*math.pi)))
        scroll=math.exp(-((wave-math.cos(v*8*math.pi))/.14)**2)
        shade=max(0,min(1,weave-.12*scroll+.018*math.sin(x*.91+y*1.73)))
        c=round(shade*255);albedo.putpixel((x,y),(c,c,c))
        dx=.16*math.cos(x*math.pi/2)+.08*math.cos(u*8*math.pi)
        dy=.14*math.cos(y*math.pi/2)
        length=math.sqrt(1+dx*dx+dy*dy)
        normal.putpixel((x,y),(round((.5-dx/length*.5)*255),round((.5-dy/length*.5)*255),round((.5+.5/length)*255)))
albedo.save(ROOT/'traveler_brocade_original.png',optimize=True)
normal.save(ROOT/'traveler_brocade_original_normal.png',optimize=True)
print('Generated original 512px woven cloud brocade albedo and normal maps')
