import assert from 'node:assert/strict';
import {readFile,rm,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
const output='scripts/.reload-check.mjs';
const original={gltf:GLTFLoader.prototype.loadAsync,fbx:FBXLoader.prototype.loadAsync,texture:THREE.TextureLoader.prototype.loadAsync,load:THREE.TextureLoader.prototype.load,fetch:globalThis.fetch};
try {
 const bytes=await readFile('client/public/weapons/m4a1.glb');assert.equal(bytes.toString('utf8',0,4),'glTF');const length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.toString('utf8',20,20+length));
 assert.equal(gltf.images.length,1);assert.equal(gltf.images[0].mimeType,'image/png');const image=gltf.bufferViews[gltf.images[0].bufferView],offset=28+length+(image.byteOffset??0);assert.equal(bytes.toString('hex',offset,offset+8),'89504e470d0a1a0a','embedded image is valid PNG');
 GLTFLoader.prototype.loadAsync=async function(url){const b=await readFile('client/public'+url);this.register(()=>({name:'CHECK_EMBEDDED_IMAGE',loadTexture:async()=>{const t=new THREE.Texture();t.flipY=false;return t}}));return this.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')};
 FBXLoader.prototype.loadAsync=async function(url){const b=await readFile('client/public'+url);return this.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')};
 THREE.TextureLoader.prototype.loadAsync=async()=>new THREE.Texture();THREE.TextureLoader.prototype.load=()=>new THREE.Texture();
 globalThis.fetch=async()=>({ok:true,json:async()=>JSON.parse(await readFile('client/public/animations/motion.json','utf8'))});
 await build({stdin:{contents:"export {loadCharacterAssets,createCharacter,animateCharacter} from './client/src/game/Character'; export {reloadPose} from './client/src/game/WeaponReload'; export {createRifle} from './client/src/game/RifleAssets';",resolveDir:process.cwd(),loader:'ts'},outfile:output,bundle:true,format:'esm',packages:'external'});
 const {loadCharacterAssets,createCharacter,animateCharacter,createRifle,reloadPose}=await import('./.reload-check.mjs');await loadCharacterAssets();
 let maxGrip=0,magazineTravel=0,supportTravel=0;const snapshots=[];
 for(const faction of ['operator','militant'])for(const crouch of [0,1])for(const fps of [30,60]){
  const rig=createCharacter(faction,0);let hidden=0;
  for(let i=0;i<=fps*2;i++){
   rig.reloadProgress=i/(fps*2);const pose=reloadPose(rig.reloadProgress,rig.leftGrip,rig.magazineGrip);
   animateCharacter(rig,1/fps,.3,false,crouch,false,new THREE.Vector3(0,0,-1.83));
   for(const [hand,target] of [[rig.rightHand,rig.rightGrip],[rig.leftHand,pose.hand]]){const error=hand.getWorldPosition(new THREE.Vector3()).distanceTo(rig.gun.localToWorld(target.clone()));maxGrip=Math.max(maxGrip,error);assert.ok(error<.04,'reload hand follows authored trajectory without losing firing hand')}
   supportTravel=Math.max(supportTravel,pose.hand.distanceTo(rig.leftGrip));
   if(rig.magazine){magazineTravel=Math.max(magazineTravel,pose.magazineOffset.length());if(!rig.magazine.visible)hidden++;}
   assert.ok(rig.gun.rotation.toArray().slice(0,3).every(Number.isFinite));
   if(faction==='operator'&&crouch===0&&fps===60&&[0,18,36,54,66,84,96,108,120].includes(i)){
    const triangles=[];rig.root.updateMatrixWorld(true);rig.root.traverse(mesh=>{if(!(mesh instanceof THREE.Mesh)||!mesh.visible)return;if(mesh instanceof THREE.SkinnedMesh)mesh.skeleton.update();const g=mesh.geometry,p=g.getAttribute('position'),idx=g.index;
     for(let j=0;j<(idx?idx.count:p.count);j+=3){const points=[];for(let k=0;k<3;k++){const v=new THREE.Vector3();mesh.getVertexPosition(idx?idx.getX(j+k):j+k,v);points.push(rig.root.worldToLocal(v.applyMatrix4(mesh.matrixWorld)).toArray())}triangles.push({points,gun:rig.gun.getObjectById(mesh.id)!==undefined})}
    });snapshots.push({time:i/(fps*2),triangles});
   }
  }
  assert.ok(!rig.magazine||hidden>0,'old magazine is removed during exchange');
  if(rig.magazine){assert.equal(rig.magazine.visible,true);assert.ok(rig.magazine.position.distanceTo(rig.magazineRest)<1e-8,'magazine reseats exactly at completion')}
  rig.reloadProgress=-1;animateCharacter(rig,1/fps,0,false,crouch);assert.ok(rig.leftHand.getWorldPosition(new THREE.Vector3()).distanceTo(rig.gun.localToWorld(rig.leftGrip.clone()))<.04,'support hand regrips');
 }
 assert.ok(magazineTravel>.2,'M4 magazine visibly pulls free');assert.ok(supportTravel>.3,'reload has visible hand travel');
 await writeFile('/tmp/reload037-poses.json',JSON.stringify(snapshots));
 console.log(`PASS: M4 magazine extraction/exchange/reseat; both factions' hand trajectories standing/crouched at 30/60 FPS; regrip; max wrist error ${maxGrip.toFixed(4)}m.`);

}finally{GLTFLoader.prototype.loadAsync=original.gltf;FBXLoader.prototype.loadAsync=original.fbx;THREE.TextureLoader.prototype.loadAsync=original.texture;THREE.TextureLoader.prototype.load=original.load;globalThis.fetch=original.fetch;await rm(output,{force:true})}
