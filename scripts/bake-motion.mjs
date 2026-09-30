// Bakes lower-body landmarks from Quaternius' CC0 Universal Animation Library.
// Input glTF/bin from https://quaternius.com/packs/universalanimationlibrary.html
// Usage: node scripts/bake-motion.mjs /path/to/library.gltf /path/to/library.bin
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
globalThis.ProgressEvent=class {};
const [gltfPath,binPath]=process.argv.slice(2);
if(!gltfPath||!binPath)throw Error('Pass the source glTF and bin paths');
const doc=JSON.parse(readFileSync(gltfPath,'utf8'));
doc.buffers[0].uri=`data:application/octet-stream;base64,${readFileSync(binPath).toString('base64')}`;
const parsed=await new Promise((resolve,reject)=>new GLTFLoader().parse(JSON.stringify(doc),'',resolve,reject));
const scene=parsed.scene,mixer=new THREE.AnimationMixer(scene);
const joint=n=>scene.getObjectByName(`DEF-${n}`);
const pos=n=>joint(n).getWorldPosition(new THREE.Vector3());
const names={idle:'Idle_Loop',walk:'Walk_Loop',run:'Sprint_Loop',crouchIdle:'Crouch_Idle_Loop',crouchWalk:'Crouch_Fwd_Loop',jumpStart:'Jump_Start',jumpLoop:'Jump_Loop',jumpLand:'Jump_Land'};
const idle=parsed.animations.find(a=>a.name===names.idle);
const idleAction=mixer.clipAction(idle);idleAction.play();mixer.setTime(0);scene.updateMatrixWorld(true);
const origin={hip:pos('hips'),left:pos('footL'),right:pos('footR')};idleAction.stop();
const clips={};
for(const [state,name] of Object.entries(names)){
 const clip=parsed.animations.find(a=>a.name===name);if(!clip)throw Error(`Missing ${name}`);
 const action=mixer.clipAction(clip);action.reset().play();
 const count=Math.ceil(clip.duration*30)+1,frames=[];
 for(let i=0;i<count;i++){
  mixer.setTime(Math.min(i/30,clip.duration-.00001));scene.updateMatrixWorld(true);
  const root=scene.getObjectByName('root').getWorldPosition(new THREE.Vector3());
  const hip=pos('hips'),left=pos('footL'),right=pos('footR');
  const foot=(p,base)=>[p.x-root.x-base.x,p.y-base.y,p.z-root.z-base.z].map(v=>+v.toFixed(4));
  frames.push([+(hip.y-origin.hip.y).toFixed(4),...foot(left,origin.left),...foot(right,origin.right)]);
 }
 action.stop();clips[state]={duration:clip.duration,frames};
}
mkdirSync('client/public/animations',{recursive:true});
writeFileSync('client/public/animations/motion.json',JSON.stringify({fps:30,clips}));
console.log('Baked CC0 motion states:',Object.keys(clips).join(', '));
