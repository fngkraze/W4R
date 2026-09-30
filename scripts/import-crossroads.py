"""Convert this Source v20 BSP's brush faces, displacements and baked lighting.
Usage: python3 scripts/import-source-bsp.py MAP.bsp [OUTPUT_DIRECTORY]
Retain compiled layout; group faces for replacement Assets.zip materials. Source coordinates -> metres/Y-up.
"""
from pathlib import Path
import sys,struct,re,json,math,collections,hashlib
src=Path(sys.argv[1]);out=Path(sys.argv[2] if len(sys.argv)>2 else 'client/public/crossroads/layout');out.mkdir(parents=True,exist_ok=True)
b=src.read_bytes();assert b[:4]==b'VBSP' and struct.unpack_from('<i',b,4)[0]==20,'Expected Source BSP v20'
ls=[struct.unpack_from('<4i',b,8+i*16) for i in range(64)]
def lump(i):
 o,n,_,compression=ls[i];assert compression==0;assert 0<=o<=len(b) and o+n<=len(b);return b[o:o+n]
def unpack(fmt,buf,off=0):return struct.unpack_from('<'+fmt,buf,off)
ents=[dict(re.findall(r'"([^"\n]+)"\s*"([^"\n]*)"',s)) for s in re.findall(r'\{([^{}]*)\}',lump(0).decode(errors='replace'))]
origin=(-5500,500,189);scale=.0254
add=lambda a,c:tuple(x+y for x,y in zip(a,c))
def transform(v):return ((v[0]-origin[0])*scale,(v[2]-origin[2])*scale,-(v[1]-origin[1])*scale)
def norm(v):return (v[0],v[2],-v[1])
vertices=[unpack('3f',lump(3),i) for i in range(0,len(lump(3)),12)]
edges=[unpack('2H',lump(12),i) for i in range(0,len(lump(12)),4)]
surf=unpack('i'*(len(lump(13))//4),lump(13));planes=lump(1);faces=lump(7);texinfo=lump(6);texdata=lump(2);light=lump(8);disp=lump(26);dispverts=lump(33)
strings=lump(43);offsets=unpack('i'*(len(lump(44))//4),lump(44));materials=[strings[o:].split(b'\0')[0].decode().lower() for o in offsets]
model_entities={int(e['model'][1:]):e for e in ents if e.get('model','').startswith('*')}
models=[unpack('9f3i',lump(14),i) for i in range(0,len(lump(14)),48)]
face_models={f:i for i,m in enumerate(models) for f in range(m[10],m[10]+m[11])}
chunks=collections.defaultdict(list);collision=[];rendered_faces=0;displacements=0;material_counts=collections.Counter()
def rgb(tex,f,p):
 refl=unpack('3f',texdata,tex*32);lo=unpack('i',faces,f*56+20)[0]
 mins=unpack('2i',faces,f*56+28);size=unpack('2i',faces,f*56+36)
 ti=unpack('h',faces,f*56+10)[0];lm=unpack('8f',texinfo,ti*72+32)
 if lo>=0 and size[0]>=0 and size[1]>=0:
  x=max(0,min(size[0],round(sum(p[i]*lm[i] for i in range(3))+lm[3]-mins[0])))
  y=max(0,min(size[1],round(sum(p[i]*lm[i+4] for i in range(3))+lm[7]-mins[1])))
  ofs=lo+4*(y*(size[0]+1)+x)
  if ofs+4<=len(light):
   r,g,blue,exp=unpack('3Bb',light,ofs);brightness=[max(.07,min(1.5,v*2**exp/140)) for v in (r,g,blue)]
  else:brightness=[.7]*3
 else:brightness=[.7]*3
 # Retain a restrained neutral baked-light term; replacement textures provide base colour.
 value=max(.5,min(1,sum(brightness)/3))
 return (value,value,value)
def surface(name,normal):
 if 'roof' in name:return 'roof'
 if any(v in name for v in ['metal','ibeam','pipe','chain']):return 'metal'
 if any(v in name for v in ['wood','fence','window','ladder']):return 'wood'
 if any(v in name for v in ['stone','brick','temple','cellar']):return 'stone'
 if any(v in name for v in ['floor','flr','road','stairs','steps','carpet']) or abs(normal[1])>.65:return 'paving'
 return 'stucco'

def emit(tri,normal,tex,f,offset,visible,solid):
 source=[add(p,offset) for p in tri];points=[transform(p) for p in source]
 # Enforce the compiled face's outward winding, also for displacement grids.
 a,c,d=points;cross=((c[1]-a[1])*(d[2]-a[2])-(c[2]-a[2])*(d[1]-a[1]),(c[2]-a[2])*(d[0]-a[0])-(c[0]-a[0])*(d[2]-a[2]),(c[0]-a[0])*(d[1]-a[1])-(c[1]-a[1])*(d[0]-a[0]))
 n=norm(normal)
 if sum(cross[i]*n[i] for i in range(3))<0:points[1],points[2]=points[2],points[1];source[1],source[2]=source[2],source[1]
 length=math.sqrt(sum(v*v for v in cross))
 if length<1e-9:return
 actual=tuple(v/length for v in cross)
 if sum(actual[i]*n[i] for i in range(3))<0:actual=tuple(-v for v in actual)
 if solid:collision.extend(v for p in points for v in p)
 if not visible:return
 name=materials[unpack('i',texdata,tex*32+12)[0]]
 kind=surface(name,actual)
 key=(math.floor(sum(p[0] for p in points)/3/16),math.floor(sum(p[2] for p in points)/3/16),kind)
 ti=unpack('h',faces,f*56+10)[0];uvs=unpack('8f',texinfo,ti*72);width,height=unpack('2i',texdata,tex*32+16)
 for p,s in zip(points,source):
  axis=max(range(3),key=lambda i:abs(actual[i]))
  uv=((p[0],p[2]) if axis==1 else (p[2],p[1]) if axis==0 else (p[0],p[1]))
  tile=1.5 if kind in ['stucco','paving'] else 1.2
  uv=(uv[0]/tile,uv[1]/tile)
  chunks[key].extend((*p,*actual,*rgb(tex,f,s),*uv))
for f in range(len(faces)//56):
 pi,side,_,first,count,ti,di=unpack('HBBihhh',faces,f*56)
 if ti<0 or count<3:continue
 model=face_models.get(f,0);ent=model_entities.get(model,{})
 if model and ent.get('classname') in ['func_buyzone','func_hostage_rescue','func_bomb_target']:continue
 offset=tuple(map(float,ent.get('origin','0 0 0').split())) if model else (0,0,0)
 flags,tex=unpack('2i',texinfo,ti*72+64);name=materials[unpack('i',texdata,tex*32+12)[0]]
 visible=not name.startswith('tools/');solid=ent.get('classname')!='func_illusionary' and not any(s in name for s in ['trigger','invisibleladder'])
 poly=[vertices[edges[abs(surf[i])][0 if surf[i]>=0 else 1]] for i in range(first,first+count)]
 normal=unpack('3f',planes,pi*20);normal=tuple(v*(-1 if side else 1) for v in normal)
 if visible:rendered_faces+=1;material_counts[name]+=1
 if di>=0 and len(poly)==4:
  start=unpack('3f',disp,di*176);vs,_,power=unpack('3i',disp,di*176+12);n=(1<<power)+1
  j=min(range(4),key=lambda i:sum((poly[i][k]-start[k])**2 for k in range(3)));poly=poly[j:]+poly[:j];grid=[]
  for y in range(n):
   row=[]
   for x in range(n):
    u=x/(n-1);v=y/(n-1)
    base=tuple(poly[0][k]*(1-u)*(1-v)+poly[1][k]*(1-u)*v+poly[2][k]*u*v+poly[3][k]*u*(1-v) for k in range(3))
    dx,dy,dz,distance,_=unpack('5f',dispverts,(vs+y*n+x)*20);row.append(add(base,(dx*distance,dy*distance,dz*distance)))
   grid.append(row)
  for y in range(n-1):
   for x in range(n-1):
    a,c,d,e=grid[y][x],grid[y][x+1],grid[y+1][x+1],grid[y+1][x]
    for tri in [(a,c,d),(a,d,e)]:emit(tri,normal,tex,f,offset,visible,solid)
  displacements+=1
 else:
  for i in range(1,len(poly)-1):emit([poly[0],poly[i],poly[i+1]],normal,tex,f,offset,visible,solid)
float_data=[];chunk_info=[]
for key,values in sorted(chunks.items()):
 chunk_info.append({'grid':key[:2],'surface':key[2],'firstVertex':len(float_data)//11,'vertexCount':len(values)//11});float_data.extend(values)
(out/'render.bin').write_bytes(struct.pack('<'+'f'*len(float_data),*float_data))
(out/'collision.bin').write_bytes(struct.pack('<'+'f'*len(collision),*collision))
spawns={kind:[{'position':transform(tuple(map(float,e['origin'].split()))),'yaw':-math.pi/2+math.radians(float(e.get('angles','0 0 0').split()[1]))} for e in ents if e.get('classname')==class_name] for kind,class_name in [('operators','info_player_counterterrorist'),('militants','info_player_terrorist')]}
game=lump(35);static_models=[];static_count=0;props=[]
for i in range(unpack('i',game)[0]):
 ident,_,version,o,length=unpack('IHHii',game,4+i*16)
 if ident==int.from_bytes(b'sprp','big'):
  data=b[o:o+length];count=unpack('i',data)[0];static_models=[data[4+128*j:4+128*(j+1)].split(b'\0')[0].decode() for j in range(count)];q=4+128*count;leaves=unpack('i',data,q)[0];static_count=unpack('i',data,q+4+2*leaves)[0]
  start=q+8+2*leaves;stride=(len(data)-start)//max(static_count,1)
  for j in range(static_count):
   px,py,pz,ax,ay,az,mi=unpack('6fH',data,start+j*stride)
   props.append({'model':static_models[mi],'position':transform((px,py,pz)),'yaw':math.radians(ay),'angles':[ax,ay,az]})
report={'name':'Crossroads Rebuilt','props':props,'sourceFile':src.name,'sourceSha256':hashlib.sha256(b).hexdigest(),'bspVersion':20,'scaleMetresPerUnit':scale,'sourceOrigin':origin,'chunks':chunk_info,'spawns':spawns,'renderedFaces':rendered_faces,'renderTriangles':len(float_data)//33,'collisionTriangles':len(collision)//9,'displacementPatches':displacements,'missingMaterials':list(material_counts),'missingStaticModels':static_models,'missingStaticPropCount':static_count,'missingEntityModels':sorted({e['model'] for e in ents if e.get('model','').endswith('.mdl')}),'notes':['Original compiled Crossroads layout, replacement materials and prop models from Assets.zip.','Original texture images and MDL prop assets are not embedded in this archive.','Brush doors/breakables are imported as fixed geometry. Source gameplay entities and .nav AI are not implemented.']}
(out/'manifest.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:report[k] for k in ['renderedFaces','renderTriangles','collisionTriangles','displacementPatches','missingStaticPropCount']}))
