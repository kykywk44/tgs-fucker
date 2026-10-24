"""Bilinear texture sampling on a native waving flag's deformed triangle mesh."""
import numpy as np
from PIL import Image
def texture_mesh(photo,grid,flag_phase=None):
    grid=np.asarray(grid,dtype=float);ny,nx=grid.shape[0]-1,grid.shape[1]-1
    uv=np.full((512,512,2),-1.,dtype=float)
    for y in range(ny):
        for x in range(nx):
            vertices=[grid[y,x],grid[y,x+1],grid[y+1,x+1],grid[y+1,x]]
            coords=np.array([[x/nx,y/ny],[(x+1)/nx,y/ny],[(x+1)/nx,(y+1)/ny],[x/nx,(y+1)/ny]])
            for tri in [(0,1,2),(0,2,3)]:
                a,b,c=[vertices[i] for i in tri];ta,tb,tc=coords[list(tri)]
                den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
                if abs(den)<1e-5:continue
                lo=np.maximum(0,np.floor(np.minimum(np.minimum(a,b),c)).astype(int));hi=np.minimum(512,np.ceil(np.maximum(np.maximum(a,b),c)).astype(int))
                if np.any(hi<=lo):continue
                yy,xx=np.mgrid[lo[1]:hi[1],lo[0]:hi[0]];xx=xx+.5;yy=yy+.5
                wa=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den
                wb=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;wc=1-wa-wb
                inside=(wa>=-1e-6)&(wb>=-1e-6)&(wc>=-1e-6)
                patch=uv[lo[1]:hi[1],lo[0]:hi[0]]
                patch[inside]=(wa[...,None]*ta+wb[...,None]*tb+wc[...,None]*tc)[inside]
    # Extend the texture just beyond its sampled boundary. The exact native
    # flag matte then cuts the cubic edge without white wedges between samples.
    for _ in range(16):
        valid=uv[:,:,0]>=0
        for axis,step in [(0,1),(0,-1),(1,1),(1,-1)]:
            neighbor=np.roll(uv,step,axis=axis);available=np.roll(valid,step,axis=axis)
            if axis==0:available[0 if step==1 else -1,:]=False
            else:available[:,0 if step==1 else -1]=False
            use=(~valid)&available;uv[use]=neighbor[use]
    valid=uv[:,:,0]>=0;w,h=photo.size
    sx=np.clip(uv[:,:,0],0,1)*(w-1);sy=np.clip(uv[:,:,1],0,1)*(h-1)
    x0=sx.astype(int);y0=sy.astype(int);x1=np.minimum(x0+1,w-1);y1=np.minimum(y0+1,h-1)
    dx=(sx-x0)[...,None];dy=(sy-y0)[...,None];pixels=np.asarray(photo,dtype=float)
    result=(pixels[y0,x0]*(1-dx)*(1-dy)+pixels[y0,x1]*dx*(1-dy)+pixels[y1,x0]*(1-dx)*dy+pixels[y1,x1]*dx*dy).astype('uint8')
    if flag_phase is not None:
        light=.88+.12*np.cos(2*np.pi*1.2*uv[:,:,0]-flag_phase)
        result[:,:,:3]=(result[:,:,:3].astype(float)*light[:,:,None]).astype('uint8')
    result[~valid]=0
    return Image.fromarray(result)
