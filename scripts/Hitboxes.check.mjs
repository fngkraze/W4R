import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {rm} from 'node:fs/promises';
import * as THREE from 'three';
const file='scripts/.hitboxes-check.mjs';
try{
 await build({entryPoints:['client/src/game/Hitboxes.ts'],outfile:file,bundle:true,format:'esm',packages:'external'});
 const {traceBody}=await import('./.hitboxes-check.mjs');
 const feet=new THREE.Vector3(0,0,0),dir=new THREE.Vector3(0,0,-1);
 const shoot=(y,x=0,crouch=0,from=20)=>traceBody(new THREE.Vector3(x,y,from),dir,feet,crouch,120);
 assert.equal(shoot(1.15)?.region,'torso','chest shot registers');
 assert.equal(shoot(1.6)?.region,'head','head shot registers');
 assert.equal(shoot(.5)?.region,'legs','leg shot registers');
 assert.ok(Math.abs(shoot(1.15).distance-(20-.26))<.02,'torso surface distance');
 assert.ok(!shoot(1.15,.6),'clear miss beside the body');
 assert.ok(!shoot(2.3),'clear miss above the head');
 assert.ok(shoot(1.15,.2),'edge of torso still hits');
 assert.equal(shoot(1.25,0,1)?.region,'head','crouching lowers the hitboxes');
 assert.ok(!shoot(1.8,0,1),'crouched actor is not hit above their head');
 assert.ok(traceBody(new THREE.Vector3(0,1.15,.1),dir,feet,0,120)?.distance===0,'point-blank origin inside the body still hits');
 assert.ok(!traceBody(new THREE.Vector3(0,1.15,20),dir,feet,0,10),'range limit respected');
 // Results do not depend on anything but feet and stance, at any heading.
 for(let a=0;a<8;a++){const d=new THREE.Vector3(Math.sin(a*Math.PI/4),0,Math.cos(a*Math.PI/4)).multiplyScalar(-1),o=d.clone().multiplyScalar(-15).setY(1.15);assert.equal(traceBody(o,d,feet,0,120)?.region,'torso','hit from any direction')}
 console.log('PASS: deterministic head/torso/leg hitboxes, stance scaling, edge, miss, range and point-blank cases.');
}finally{await rm(file,{force:true})}
