import assert from 'node:assert/strict';
import {readFile,rm} from 'node:fs/promises';
import {build} from 'esbuild';
import * as THREE from 'three';
const outputs=['scripts/.jump-physics-check.mjs','scripts/.jump-movement-check.mjs'];
try {
 for(const [i,entry] of ['client/src/world/MapPhysics.ts','client/src/game/MapMovement.ts'].entries())await build({entryPoints:[entry],outfile:outputs[i],bundle:true,format:'esm',packages:'external'});
 const {MapPhysics}=await import('./.jump-physics-check.mjs');const {MapMovement}=await import('./.jump-movement-check.mjs');
 const triangles=[];
 const box=(size,p)=>{const g=new THREE.BoxGeometry(...size).toNonIndexed();const a=g.getAttribute('position');for(let i=0;i<a.count;i++)triangles.push(a.getX(i)+p[0],a.getY(i)+p[1],a.getZ(i)+p[2]);g.dispose()};
 box([10,1,10],[0,-.5,0]);
 const floor=await MapPhysics.create(new Float32Array(triangles));
 function sequence(pressFrames){const motor=new MapMovement(),position=new THREE.Vector3(0,.02,0);let takeoffs=0,lastGrounded=true;for(let i=0;i<80;i++){motor.update(floor,position,new THREE.Vector3(),1/60,pressFrames.includes(i));if(lastGrounded&&!motor.grounded)takeoffs++;lastGrounded=motor.grounded}return takeoffs}
 assert.equal(sequence([5,10]),1,'an early airborne press expires instead of granting a midair jump');
 const probe=new MapMovement(),probePosition=new THREE.Vector3(0,.02,0);let landing=0,peak=0;
 for(let i=0;i<80;i++){probe.update(floor,probePosition,new THREE.Vector3(),1/60,i===5);peak=Math.max(peak,probePosition.y);if(i>5&&probe.grounded){landing=i;break}}
 assert.ok(peak>.95&&peak<1.15,'higher jump reaches approximately 1.1m');
 assert.equal(sequence([5,landing-3]),2,'press shortly before landing is buffered into the next jump');
 box([10,.2,10],[0,2,0]);const ceiling=await MapPhysics.create(new Float32Array(triangles)),position=new THREE.Vector3(0,.02,0),motor=new MapMovement();let ceilingPeak=0;
 for(let i=0;i<80;i++){motor.update(ceiling,position,new THREE.Vector3(),1/60,i===5);ceilingPeak=Math.max(ceilingPeak,position.y)}
 assert.ok(ceilingPeak<.19,'head cannot jump through a low ceiling');assert.ok(motor.grounded,'ceiling hit returns to floor');
 console.log('PASS: buffered presses, no midair jump, and low ceiling collision.');
}finally{await Promise.all(outputs.map(p=>rm(p,{force:true})))}
