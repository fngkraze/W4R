from pathlib import Path
import json,re,shutil,sys,tempfile,zipfile
from PIL import Image
root=Path(__file__).resolve().parent.parent
archive=zipfile.ZipFile(sys.argv[1]);work=Path(tempfile.mkdtemp(prefix='stickup-assets-'));archive.extractall(work);source=work/'Assets'
out=root/'client/public/crossroads';(out/'models').mkdir(parents=True,exist_ok=True);(out/'textures').mkdir(exist_ok=True)
models={
 'table':('table',{'Material.078':'table'}),
 'worktable':('work_table',{'Material.043':'table_work'}),
 'ammobox':('box_na_ammo',{'Material.050':'box_s_ammo_1'}),
 'car':('car_grey',{'Material.055':'car_grey','Material.136':'car_wheels','Material.059':'glass_car','Material.093':'car_wheels'}),
 'car_green':('car_green',{'Material.041':'car_green','Material.140':'wheels_2'}),
 'tree':('tree_listnaty',{'Material':'wood_tree','stromik.001':'help_mygod'}),
 'trash':('trash_can',{'Material.058':'trash_can_bottom','Material.165':'trash_can_top'}),
 'lamp':('lamp',{'Material.039':'lamp'}),
 'chair':('plastic_chair_1',{'Material.003':'chair'}),
 'couch':('couch_pls_already',{'Material.026':'couch_pls_dont_touch'}),
 'shed':('shed',{'Material.049':'shed'}),
 'plank':('plank',{'Material.042':'plank'}),
 'fence':('bars_iron',{'Material.071':'bars_iron'}),
}
manifest={};textures=set()
for key,(name,maps) in models.items():
 text=(source/'Models'/f'{name}.obj').read_text();text=re.sub(r'^mtllib .*\n','',text,flags=re.M)
 (out/'models'/f'{key}.obj').write_text(text)
 used=set(re.findall(r'^usemtl (.+)$',text,re.M));assert used<=maps.keys(),(key,used,maps.keys())
 manifest[key]={'model':f'models/{key}.obj','materials':{mat:f'textures/{tex}.png' for mat,tex in maps.items()}}
 textures.update(maps.values())
for name in textures:shutil.copyfile(source/'Textures'/f'{name}.png',out/'textures'/f'{name}.png')
# Extract a rectangular face's UV patch, rather than repeating an entire object atlas.
def tile(obj,image,target):
 verts=[];uvs=[];best=None
 for line in (source/'Models'/f'{obj}.obj').read_text().splitlines():
  words=line.split()
  if not words:continue
  if words[0]=='v':verts.append(tuple(map(float,words[1:4])))
  elif words[0]=='vt':uvs.append(tuple(map(float,words[1:3])))
  elif words[0]=='f' and len(words)==5:
   face=[w.split('/') for w in words[1:]]
   a,b,c=[verts[int(w[0])-1] for w in face[:3]]
   ab=[b[i]-a[i] for i in range(3)];ac=[c[i]-a[i] for i in range(3)]
   area=sum((ab[(i+1)%3]*ac[(i+2)%3]-ab[(i+2)%3]*ac[(i+1)%3])**2 for i in range(3))
   us=[uvs[int(w[1])-1] for w in face]
   if best is None or area>best[0]:best=(area,us)
 assert best
 im=Image.open(source/'Textures'/f'{image}.png').convert('RGB');w,h=im.size;uv=best[1]
 bounds=(round(min(v[0] for v in uv)*w)+3,round((1-max(v[1] for v in uv))*h)+3,round(max(v[0] for v in uv)*w)-3,round((1-min(v[1] for v in uv))*h)-3)
 crop=im.crop(bounds);assert min(crop.size)>32,(obj,bounds)
 crop.resize((256,256),Image.Resampling.LANCZOS).save(out/'textures'/f'{target}.png')
 print(target,bounds)
for args in [('white_wood_wall','white_wall','stucco'),('wall_basement_stone','wall_basement_1','stone'),('floor_svetla','floor_svetla_1','paving'),('plank','plank','wood'),('wall_dark_wood','wall_dark_wood','roof')]:tile(*args)
shutil.copyfile(source/'LICENSE.txt',out/'LICENSE.txt')
(out/'assets.json').write_text(json.dumps(manifest,indent=2))
(out/'provenance.json').write_text(json.dumps({'environmentPack':'Assets.zip supplied by user','license':'CC BY 4.0','licenseURL':'https://creativecommons.org/licenses/by/4.0/','author':'Not identified in supplied archive; retain original archive license and author attribution when available.','changes':'Selected OBJ models; original UVs retained; Windows texture paths resolved to supplied PNGs; seamless surface patches extracted from original atlas faces.','layout':'Brushes, stairs, terrain and team spawn locations from the previously supplied de_crossroads.bsp; replacement materials and props use Assets.zip.','weapons':'Existing M16 and AK rifle meshes retained from the prior supplied pack to preserve weapon handling; the previous environment is removed.'},indent=2))

shutil.rmtree(work)
