import assert from 'node:assert/strict';
import {readFile,rm,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
const output='scripts/.ragdoll-check.mjs';
const original={gltf:GLTFLoader.prototype.loadAsync,fbx:FBXLoader.prototype.loadAsync,texture:THREE.TextureLoader.prototype.loadAsync,load:THREE.TextureLoader.prototype.load,fetch:globalThis.fetch};
try {
 const bytes=await readFile('client/public/weapons/m4a1.glb');assert.equal(bytes.toString('utf8',0,4),'glTF');const length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.toString('utf8',20,20+length));
 assert.equal(gltf.images.length,1);assert.equal(gltf.images[0].mimeType,'image/png');const image=gltf.bufferViews[gltf.images[0].bufferView],offset=28+length+(image.byteOffset??0);assert.equal(bytes.toString('hex',offset,offset+8),'89504e470d0a1a0a','embedded image is valid PNG');
 GLTFLoader.prototype.loadAsync=async function(url){const b=await readFile('client/public'+url);this.register(()=>({name:'CHECK_EMBEDDED_IMAGE',loadTexture:async()=>{const t=new THREE.Texture();t.flipY=false;return t}}));return this.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')};
 FBXLoader.prototype.loadAsync=async function(url){const b=await readFile('client/public'+url);return this.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')};
 THREE.TextureLoader.prototype.loadAsync=async()=>new THREE.Texture();THREE.TextureLoader.prototype.load=()=>new THREE.Texture();
 globalThis.fetch=async()=>({ok:true,json:async()=>JSON.parse(await readFile('client/public/animations/motion.json','utf8'))});
 await build({stdin:{contents:"export {loadCharacterAssets,createCharacter,animateCharacter} from './client/src/game/Character'; export {Ragdolls} from './client/src/game/Ragdolls'; export {MapPhysics} from './client/src/world/MapPhysics'; export {createRifle} from './client/src/game/RifleAssets';",resolveDir:process.cwd(),loader:'ts'},outfile:output,bundle:true,format:'esm',packages:'external'});
 const {loadCharacterAssets,createCharacter,animateCharacter,createRifle,Ragdolls,MapPhysics}=await import('./.ragdoll-check.mjs');await loadCharacterAssets();
 const geometry=new THREE.BoxGeometry(20,.5,20).toNonIndexed(),vertices=geometry.getAttribute('position').array.slice();for(let i=1;i<vertices.length;i+=3)vertices[i]-=.25;
 const physics=await MapPhysics.create(vertices),ragdolls=new Ragdolls(physics);
 for(const faction of ['operator','militant'])for(const pose of ['run','crouch','air']){
  const rig=createCharacter(faction,0);rig.root.position.set(faction==='operator'?-2:2,.02,0);if(pose==='air')rig.root.position.y+=1;rig.root.rotation.y=pose==='crouch'?.7:0;for(let i=0;i<45;i++)animateCharacter(rig,1/60,pose==='run'?.8:0,pose==='run',pose==='crouch'?1:0,pose==='air',new THREE.Vector3(0,0,-3));
  const originalPositions=new Map();rig.hips.traverse(o=>{if(o instanceof THREE.Bone)originalPositions.set(o,o.position.clone())});
  ragdolls.add(rig,new THREE.Vector3(0,0,-1));assert.equal(rig.gun.parent,rig.rightHand,'rifle follows hand on corpse');assert.equal(rig.root.visible,true);
  for(let i=0;i<300;i++)ragdolls.update(1/60);
  const head=rig.head.getWorldPosition(new THREE.Vector3());assert.ok(head.y<.6&&head.y>-.15,'ragdoll collapses onto floor');
  for(const joint of [rig.head,rig.leftArm,rig.rightArm,rig.leftLeg,rig.rightLeg])assert.ok(joint.getWorldPosition(new THREE.Vector3()).toArray().every(Number.isFinite),'ragdoll remains stable');
  assert.equal(ragdolls.settledCount,1,'corpse settles within five seconds');
  const rest=new Map();rig.hips.traverse(o=>{if(o instanceof THREE.Bone)rest.set(o,{p:o.getWorldPosition(new THREE.Vector3()),q:o.getWorldQuaternion(new THREE.Quaternion())})});
  for(let i=0;i<600;i++)ragdolls.update(1/60);
  for(const [bone,{p,q}] of rest){assert.ok(bone.getWorldPosition(new THREE.Vector3()).distanceTo(p)<1e-6,'resting body cannot slide or twitch');assert.ok(bone.getWorldQuaternion(new THREE.Quaternion()).normalize().angleTo(q.clone().normalize())<1e-6,'resting joints cannot twist')}
  const box=new THREE.Box3().setFromObject(rig.root,true),ray=new THREE.Raycaster();let corpseHit=false;
  for(let x=box.min.x;x<box.max.x;x+=.08)for(let z=box.min.z;z<box.max.z;z+=.08){ray.set(new THREE.Vector3(x,box.max.y+1,z),new THREE.Vector3(0,-1,0));if(ray.intersectObject(rig.root,true).some(h=>h.object instanceof THREE.SkinnedMesh))corpseHit=true}
  assert.ok(corpseHit,'hitscan can hit the fallen skinned body');
  let skinned=0;rig.root.traverse(o=>{if(o instanceof THREE.SkinnedMesh){skinned++;assert.ok(o.boundingSphere,'fallen mesh has refreshed raycast bounds')}});assert.ok(skinned>0);
  ragdolls.reset();assert.equal(ragdolls.count,0);assert.equal(rig.gun.parent,rig.root,'new round returns rifle to live rig');for(const [bone,p] of originalPositions)assert.ok(bone.position.distanceTo(p)<1e-6,'new round restores original bone offsets');
  animateCharacter(rig,1/60,0);assert.ok(rig.leftHand.getWorldPosition(new THREE.Vector3()).distanceTo(rig.gun.localToWorld(rig.leftGrip.clone()))<.04,'live grip restored after ragdoll reset');
 }
 physics.dispose();console.log('PASS: physical articulated corpses collapse and settle on floor; rifle remains in hand; new round removes bodies and restores skeleton/grips.');

}finally{GLTFLoader.prototype.loadAsync=original.gltf;FBXLoader.prototype.loadAsync=original.fbx;THREE.TextureLoader.prototype.loadAsync=original.texture;THREE.TextureLoader.prototype.load=original.load;globalThis.fetch=original.fetch;await rm(output,{force:true})}
