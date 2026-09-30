import assert from 'node:assert/strict';
import {readFile,rm} from 'node:fs/promises';
import {build} from 'esbuild';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
const output='scripts/.m4a1-check.mjs';
const original={gltf:GLTFLoader.prototype.loadAsync,fbx:FBXLoader.prototype.loadAsync,texture:THREE.TextureLoader.prototype.loadAsync,load:THREE.TextureLoader.prototype.load,fetch:globalThis.fetch};
try {
 const bytes=await readFile('client/public/weapons/m4a1.glb');assert.equal(bytes.toString('utf8',0,4),'glTF');const length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.toString('utf8',20,20+length));
 assert.equal(gltf.images.length,1);assert.equal(gltf.images[0].mimeType,'image/png');const image=gltf.bufferViews[gltf.images[0].bufferView],offset=28+length+(image.byteOffset??0);assert.equal(bytes.toString('hex',offset,offset+8),'89504e470d0a1a0a','embedded image is valid PNG');
 GLTFLoader.prototype.loadAsync=async function(url){const b=await readFile('client/public'+url);this.register(()=>({name:'CHECK_EMBEDDED_IMAGE',loadTexture:async()=>{const t=new THREE.Texture();t.flipY=false;return t}}));return this.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')};
 FBXLoader.prototype.loadAsync=async function(url){const b=await readFile('client/public'+url);return this.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')};
 THREE.TextureLoader.prototype.loadAsync=async()=>new THREE.Texture();THREE.TextureLoader.prototype.load=()=>new THREE.Texture();
 globalThis.fetch=async()=>({ok:true,json:async()=>JSON.parse(await readFile('client/public/animations/motion.json','utf8'))});
 await build({stdin:{contents:"export {loadCharacterAssets,createCharacter,animateCharacter} from './client/src/game/Character'; export {createRifle} from './client/src/game/RifleAssets';",resolveDir:process.cwd(),loader:'ts'},outfile:output,bundle:true,format:'esm',packages:'external'});
 const {loadCharacterAssets,createCharacter,animateCharacter,createRifle}=await import('./.m4a1-check.mjs');await loadCharacterAssets();
 const m4=createRifle(true);assert.equal(m4.name,'M4A1');const bounds=new THREE.Box3().setFromObject(m4);assert.ok(Math.abs(bounds.max.z-bounds.min.z-1.19)<1e-6);assert.ok(Math.abs(bounds.min.z+.79)<1e-6);assert.ok(Math.abs(bounds.max.z-.4)<1e-6);
 let meshes=0; m4.traverse(o=>{if(o instanceof THREE.Mesh){meshes++;assert.equal(o.material.name,'m4a1');assert.ok(o.material.map);assert.equal(o.material.map.colorSpace,THREE.SRGBColorSpace);assert.equal(o.material.map.flipY,false);assert.equal(o.material.metalness,gltf.materials[0].pbrMetallicRoughness.metallicFactor)}});assert.equal(meshes,7,'all authored gun parts preserved');
 const barrel=m4.getObjectByName('Barrel'),geometry=barrel.geometry.getAttribute('position');let minY=Infinity,maxY=-Infinity,minX=Infinity,maxX=-Infinity;
 for(let i=0;i<geometry.count;i++){const v=new THREE.Vector3().fromBufferAttribute(geometry,i).applyMatrix4(barrel.matrixWorld);if(v.z<-.788){minY=Math.min(minY,v.y);maxY=Math.max(maxY,v.y);minX=Math.min(minX,v.x);maxX=Math.max(maxX,v.x)}}
 const tip=new THREE.Vector3((minX+maxX)/2,(minY+maxY)/2,-.79);assert.ok(tip.distanceTo(new THREE.Vector3(0,.01,-.79))<.002,'actual flash hider aligns with muzzle origin');
 let maximumGripError=0,maximumMuzzleError=0;
 for(let variant=0;variant<2;variant++){
  const rig=createCharacter('operator',variant);assert.ok(rig.gun.getObjectByName('Barrel'));assert.equal(rig.leftGrip.z,-.24,'M4 has its own support wrist target');
  for(let frame=0;frame<240;frame++){
   const running=frame<60,crouch=frame>=120?1:0;rig.weaponBlocked=frame>=160&&frame<205;rig.aimPitch=.12;rig.aimYaw=frame%2?.2:-.2;if(frame>=75&&frame<115&&frame%8===0)rig.shotKick=.19;
   animateCharacter(rig,1/60,running?1:0,running,crouch,false,new THREE.Vector3(0,0,running?-6.1:0));
   for(const [hand,grip] of [[rig.leftHand,rig.leftGrip],[rig.rightHand,rig.rightGrip]]){const error=hand.getWorldPosition(new THREE.Vector3()).distanceTo(rig.gun.localToWorld(grip.clone()));maximumGripError=Math.max(maximumGripError,error);assert.ok(error<.04,'M4 wrists remain attached through carry, recoil, crouch and raise/lower')}
   const barrelTip=rig.gun.localToWorld(tip.clone()),muzzle=rig.muzzle.getWorldPosition(new THREE.Vector3());const error=barrelTip.distanceTo(muzzle);maximumMuzzleError=Math.max(maximumMuzzleError,error);assert.ok(error<.002,'muzzle remains fitted through animated poses');
  }
 }
 console.log(`PASS: seven M4 parts, original embedded texture/PBR material, length/stock/barrel fit, both operator variants through running/recoil/crouch/raise/lower. Max wrist error ${maximumGripError.toFixed(4)} m; muzzle error ${maximumMuzzleError.toFixed(6)} m.`);
}finally{GLTFLoader.prototype.loadAsync=original.gltf;FBXLoader.prototype.loadAsync=original.fbx;THREE.TextureLoader.prototype.loadAsync=original.texture;THREE.TextureLoader.prototype.load=original.load;globalThis.fetch=original.fetch;await rm(output,{force:true})}
