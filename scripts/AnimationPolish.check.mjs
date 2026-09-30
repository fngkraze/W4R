import assert from 'node:assert/strict';
import {readFile,rm,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
const output='scripts/.animation-polish-check.mjs';
const original={gltf:GLTFLoader.prototype.loadAsync,fbx:FBXLoader.prototype.loadAsync,texture:THREE.TextureLoader.prototype.loadAsync,load:THREE.TextureLoader.prototype.load,fetch:globalThis.fetch};
try {
 const bytes=await readFile('client/public/weapons/m4a1.glb');assert.equal(bytes.toString('utf8',0,4),'glTF');const length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.toString('utf8',20,20+length));
 assert.equal(gltf.images.length,1);assert.equal(gltf.images[0].mimeType,'image/png');const image=gltf.bufferViews[gltf.images[0].bufferView],offset=28+length+(image.byteOffset??0);assert.equal(bytes.toString('hex',offset,offset+8),'89504e470d0a1a0a','embedded image is valid PNG');
 GLTFLoader.prototype.loadAsync=async function(url){const b=await readFile('client/public'+url);this.register(()=>({name:'CHECK_EMBEDDED_IMAGE',loadTexture:async()=>{const t=new THREE.Texture();t.flipY=false;return t}}));return this.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')};
 FBXLoader.prototype.loadAsync=async function(url){const b=await readFile('client/public'+url);return this.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')};
 THREE.TextureLoader.prototype.loadAsync=async()=>new THREE.Texture();THREE.TextureLoader.prototype.load=()=>new THREE.Texture();
 globalThis.fetch=async()=>({ok:true,json:async()=>JSON.parse(await readFile('client/public/animations/motion.json','utf8'))});
 await build({stdin:{contents:"export {loadCharacterAssets,createCharacter,animateCharacter} from './client/src/game/Character'; export {createRifle} from './client/src/game/RifleAssets';",resolveDir:process.cwd(),loader:'ts'},outfile:output,bundle:true,format:'esm',packages:'external'});
 const {loadCharacterAssets,createCharacter,animateCharacter,createRifle}=await import('./.animation-polish-check.mjs');await loadCharacterAssets();
 let maxGrip=0,maxStockRear=0,activeSamples=0;const snapshots=[];
 for(const faction of ['operator','militant'])for(let variant=0;variant<2;variant++)for(const fps of [30,60]){
  const rig=createCharacter(faction,variant);let previousFoot;
  for(let f=0;f<fps*8;f++){
   const t=f/fps,running=t>=1&&t<3,crouch=t>=4&&t<6,air=t>=6&&t<6.45,speed=running?1:t>=3&&t<4?.65:crouch&&t>5?.328:0;
   const velocity=new THREE.Vector3(running&&t>2?3:0,0,-speed*6.1);rig.root.position.addScaledVector(velocity,1/fps);rig.root.rotation.y=t>2&&t<3?(t-2)*.5:0;
   rig.weaponBlocked=t>7;rig.aimPitch=t<7?.12:0;rig.aimYaw=0;if(t>3&&t<4&&f%8===0)rig.shotKick=.19;
   animateCharacter(rig,1/fps,speed,running,crouch?1:0,air,velocity);
   const stock=rig.root.worldToLocal(rig.gun.localToWorld(new THREE.Vector3(0,0,.4))),shoulder=rig.root.worldToLocal(rig.rightArm.getWorldPosition(new THREE.Vector3()));
   assert.ok(stock.distanceTo(shoulder)<.115,'stock stays seated beside shoulder through animation transitions');maxStockRear=Math.max(maxStockRear,stock.z-shoulder.z);assert.ok(stock.z<=shoulder.z+.005,'stock does not slide behind shoulder');
   for(const [hand,grip] of [[rig.leftHand,rig.leftGrip],[rig.rightHand,rig.rightGrip]]){const error=hand.getWorldPosition(new THREE.Vector3()).distanceTo(rig.gun.localToWorld(grip.clone()));maxGrip=Math.max(maxGrip,error);assert.ok(error<.04,'both wrists stay attached during movement and stance changes')}
   for(const foot of [rig.leftFoot,rig.rightFoot]){const p=rig.root.worldToLocal(foot.getWorldPosition(new THREE.Vector3()));assert.ok(p.toArray().every(Number.isFinite));assert.ok(p.y>-.025&&p.y<.36,'feet stay within grounded/swing envelope')}
   if(running)activeSamples++;
   if(faction==='operator'&&variant===0&&fps===60&&[0,90,105,120,135,240,330,375,390,460].includes(f)){
    const triangles=[];rig.root.updateMatrixWorld(true);rig.root.traverse(mesh=>{if(!(mesh instanceof THREE.Mesh))return;if(mesh instanceof THREE.SkinnedMesh)mesh.skeleton.update();const g=mesh.geometry,p=g.getAttribute('position'),idx=g.index;
     for(let j=0;j<(idx?idx.count:p.count);j+=3){const points=[];for(let k=0;k<3;k++){const v=new THREE.Vector3();mesh.getVertexPosition(idx?idx.getX(j+k):j+k,v);points.push(rig.root.worldToLocal(v.applyMatrix4(mesh.matrixWorld)).toArray())}triangles.push({points,gun:rig.gun.getObjectById(mesh.id)!==undefined})}
    });snapshots.push({time:t,triangles});
   }
  }
 }
 await writeFile('/tmp/animation036-poses.json',JSON.stringify(snapshots));
 console.log(`PASS: all four rigs at 30/60 FPS through idle/run/turn/walk/recoil/crouch/jump/landing/blocked transitions; ${activeSamples} running samples; max grip error ${maxGrip.toFixed(4)}m; stock rear offset ${maxStockRear.toFixed(4)}m.`);

}finally{GLTFLoader.prototype.loadAsync=original.gltf;FBXLoader.prototype.loadAsync=original.fbx;THREE.TextureLoader.prototype.loadAsync=original.texture;THREE.TextureLoader.prototype.load=original.load;globalThis.fetch=original.fetch;await rm(output,{force:true})}
