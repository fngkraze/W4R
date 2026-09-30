import assert from 'node:assert/strict';
import {readFile,rm} from 'node:fs/promises';
import {build} from 'esbuild';
import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const outputs=['scripts/.clearance-check.mjs','scripts/.pose-check.mjs','scripts/.aim-check.mjs'];
try {
 await build({entryPoints:['client/src/game/WeaponObstruction.ts'],outfile:outputs[0],bundle:true,format:'esm',packages:'external'});
 const {WeaponObstruction,canDischarge}=await import('./.clearance-check.mjs');
 await build({entryPoints:['client/src/game/WeaponAim.ts'],outfile:outputs[2],bundle:true,format:'esm',packages:'external'});
 const {solveWeaponAim}=await import('./.aim-check.mjs');
 const aimRoot=new THREE.Group();
 for(const rootYaw of [0,.9,-2.2])for(const crouch of [0,1])for(const offset of [new THREE.Vector3(.25,.2,-1),new THREE.Vector3(-.25,-.3,-1),new THREE.Vector3(0,.8,-1)]){
  aimRoot.position.set(4,.01,-6);aimRoot.rotation.y=rootYaw;
  const gunOrigin=aimRoot.localToWorld(new THREE.Vector3(.13,1.43-.46*crouch,-.18));
  const target=aimRoot.localToWorld(new THREE.Vector3(.13,1.43-.46*crouch,-.18).add(offset));
  const aim=solveWeaponAim(aimRoot,target,crouch);
  const expected=target.clone().sub(gunOrigin).normalize();
  const actual=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(aim.pitch,aim.yaw,0)).applyQuaternion(aimRoot.quaternion);
  assert.ok(actual.angleTo(expected)<.000001,'barrel and target converge from shoulder');
  assert.ok(aim.end.clone().sub(gunOrigin).normalize().angleTo(expected)<.000001,'clearance follows solved barrel');
 }
 const backwards=solveWeaponAim(new THREE.Group(),new THREE.Vector3(.13,1.43,1),0,-.2);
 assert.equal(backwards.pitch,-.2);assert.equal(backwards.yaw,0,'behind-shoulder hit cannot reverse barrel');
 const wall=(size,pos)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(...size));m.position.set(...pos);m.updateMatrixWorld(true);return m};
 const start=new THREE.Vector3(.13,1.43,.08),end=new THREE.Vector3(.13,1.43,-.98);
 const blocked=(objects,a=start,b=end)=>new WeaponObstruction(objects).update(a,b,1/60);
 assert.equal(blocked([]),false);
 assert.equal(blocked([wall([3,4,.2],[0,2,-.5])]),true,'close wall');
 assert.equal(blocked([wall([3,4,.2],[0,2,-4])]),false,'distant cover');
 assert.equal(blocked([wall([3,4,.2],[0,2,1])]),false,'wall behind player');
 assert.equal(blocked([wall([.2,4,3],[.65,2,0])]),false,'parallel wall');
 assert.equal(blocked([wall([3,4,3],[0,2,0])]),true,'probe starts inside wall');
 const low=wall([3,1.15,.2],[0,.575,-.5]);
 assert.equal(blocked([low]),false,'standing can aim over low cover');
 assert.equal(blocked([low],start.clone().add(new THREE.Vector3(0,-.46,0)),end.clone().add(new THREE.Vector3(0,-.46,0))),true,'crouched barrel meets low cover');
 const ground=wall([30,.08,30],[0,0,0]);assert.equal(blocked([ground]),false,'level barrel clears road');
 assert.equal(blocked([ground],new THREE.Vector3(.13,.97,.08),new THREE.Vector3(.13,-.02,-.4)),true,'downward barrel meets ground');
 const edge=new WeaponObstruction([wall([3,4,.2],[0,2,-.5])]);
 let ammo=30,raised=0,shots=0;
 function tick(a,b){const obstruction=edge.update(a,b,1/60);raised=THREE.MathUtils.damp(raised,obstruction?1:0,obstruction?24:14,1/60);if(canDischarge(obstruction,raised)){ammo--;shots++}}
 for(let i=0;i<60;i++)tick(start,end);
 assert.equal(ammo,30,'held trigger must preserve ammo while blocked');assert.equal(shots,0);
 const clearStart=start.clone().add(new THREE.Vector3(4,0,0)),clearEnd=end.clone().add(new THREE.Vector3(4,0,0));
 for(let i=0;i<4;i++)tick(clearStart,clearEnd);
 assert.equal(edge.blocked,true,'short clear interval retains block');assert.equal(ammo,30);
 tick(start,end);assert.equal(edge.blocked,true,'edge re-entry resets release timer');
 for(let i=0;i<7;i++)tick(clearStart,clearEnd);
 assert.equal(edge.blocked,false);assert.equal(ammo,30,'raised gun cannot discharge during lowering');
 for(let i=0;i<15;i++)tick(clearStart,clearEnd);
 assert.ok(shots>0,'held trigger resumes when lowered');
 await build({entryPoints:['client/src/game/Character.ts'],outfile:outputs[1],bundle:true,format:'esm',packages:'external'});
 const gltfLoad=GLTFLoader.prototype.loadAsync,fbxLoad=FBXLoader.prototype.loadAsync,textureLoad=THREE.TextureLoader.prototype.loadAsync,embeddedTextureLoad=THREE.TextureLoader.prototype.load,realFetch=globalThis.fetch;
 FBXLoader.prototype.loadAsync=async function(url){const bytes=await readFile('client/public'+url);return this.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')};
 GLTFLoader.prototype.loadAsync=async function(url){const bytes=await readFile('client/public'+url);this.register(()=>({name:'CHECK_EMBEDDED_IMAGE',loadTexture:async()=>{const t=new THREE.Texture();t.flipY=false;return t}}));return this.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')};
 THREE.TextureLoader.prototype.loadAsync=async()=>new THREE.Texture();
 THREE.TextureLoader.prototype.load=()=>new THREE.Texture();
 globalThis.fetch=async()=>({ok:true,json:async()=>JSON.parse(await readFile('client/public/animations/motion.json','utf8'))});
 try {
  const {loadCharacterAssets,createCharacter,animateCharacter}=await import('./.pose-check.mjs');await loadCharacterAssets();
  let maximumGripError=0;
  for(const faction of ['operator','militant'])for(let variant=0;variant<2;variant++){
   const rig=createCharacter(faction,variant);
   for(const crouch of [0,1])for(const blocked of [true,false])for(let frame=0;frame<35;frame++){
    rig.aimYaw=frame%2?.2:-.2;rig.aimPitch=.12;rig.weaponBlocked=blocked;animateCharacter(rig,1/60,0,false,crouch);
    for(const [hand,grip] of [[rig.rightHand,rig.rightGrip.clone()],[rig.leftHand,rig.leftGrip.clone()]]){
     const error=hand.getWorldPosition(new THREE.Vector3()).distanceTo(rig.gun.localToWorld(grip));maximumGripError=Math.max(maximumGripError,error);assert.ok(Number.isFinite(error)&&error<.09,`${faction} ${variant} grip error ${error}`);
    }
    assert.ok(Number.isFinite(rig.gun.rotation.x));
   }
  }
  console.log(`PASS: shoulder aim convergence, rotated/crouched clearance, behind-shoulder fallback, clearance, release hysteresis, held-trigger ammo lockout and resume; four imported rigs, standing/crouched raise/lower. Max hand/grip error: ${maximumGripError.toFixed(4)} m.`);
 }finally{GLTFLoader.prototype.loadAsync=gltfLoad;FBXLoader.prototype.loadAsync=fbxLoad;THREE.TextureLoader.prototype.loadAsync=textureLoad;THREE.TextureLoader.prototype.load=embeddedTextureLoad;globalThis.fetch=realFetch}
}finally{await Promise.all(outputs.map(p=>rm(p,{force:true})))}
