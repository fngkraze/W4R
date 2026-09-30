import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {rm} from 'node:fs/promises';
import * as THREE from 'three';
const file='scripts/.character-motor-check.mjs';
try{
 await build({entryPoints:['client/src/game/CharacterMotor.ts'],outfile:file,bundle:true,format:'esm',packages:'external'});
 const {CharacterMotor}=await import('./.character-motor-check.mjs');
 // Flat-floor stub: this check covers the motor's own rules, not Rapier.
 const floor={hitCeiling:false,canStand:()=>true,move(p,d){p.add(d);if(p.y<=0){p.y=0;return true}return false}};
 const cmd=(o={})=>({wish:new THREE.Vector3(),jump:false,jumpHeld:true,crouch:false,slide:true,...o});
 const jump=(fps,held)=>{const m=new CharacterMotor(),p=new THREE.Vector3();let peak=0;for(let i=0;i<fps*2;i++){m.step(floor,p,cmd({jump:i===3,jumpHeld:held(i)}),1/fps);peak=Math.max(peak,p.y)}return peak};
 for(const fps of [30,60,144])assert.ok(Math.abs(jump(fps,()=>true)-1.11)<.08,`jump height is frame-rate independent at ${fps} FPS`);
 const full=jump(60,()=>true),tap=jump(60,i=>i<=3),half=jump(60,i=>i<=12);
 assert.ok(tap>.2&&tap<half&&half<full,'releasing jump early lowers the jump, and a tap still hops');
 const m=new CharacterMotor(),p=new THREE.Vector3();
 for(let i=0;i<60;i++)m.step(floor,p,cmd({settle:true}),1/60);assert.ok(Math.abs(m.crouch-.55)<.02,'standing still settles into a ready crouch');
 for(let i=0;i<20;i++)m.step(floor,p,cmd({settle:true,wish:new THREE.Vector3(0,0,-6.1)}),1/60);assert.ok(m.crouch<.02,'moving stands back up');
 const plain=new CharacterMotor(),q=new THREE.Vector3();for(let i=0;i<60;i++)plain.step(floor,q,cmd(),1/60);assert.equal(plain.crouch,0,'settling is opt-in');
 const run=new THREE.Vector3(0,0,-6.1),s=new CharacterMotor(),sp=new THREE.Vector3();
 for(let i=0;i<60;i++)s.step(floor,sp,cmd({wish:run}),1/60);s.step(floor,sp,cmd({wish:run,crouch:true}),1/60);
 assert.ok(s.sliding&&s.velocity.length()>8,'crouch at sprint speed starts a slide burst');
 const b=new CharacterMotor(),bp=new THREE.Vector3();for(let i=0;i<60;i++)b.step(floor,bp,cmd({wish:run,slide:false}),1/60);b.step(floor,bp,cmd({wish:run,crouch:true,slide:false}),1/60);assert.ok(!b.sliding,'actors with slide disabled (bots) never slide');
 const g=new CharacterMotor(),a=new CharacterMotor(),pg=new THREE.Vector3(),pa=new THREE.Vector3();
 for(let i=0;i<60;i++){g.step(floor,pg,cmd({wish:run}),1/60);a.step(floor,pa,cmd({wish:run}),1/60)}
 a.step(floor,pa,cmd({wish:run,jump:true}),1/60);for(let i=0;i<10;i++){g.step(floor,pg,cmd(),1/60);a.step(floor,pa,cmd(),1/60)}
 assert.ok(a.velocity.length()>g.velocity.length()+2,'airborne actors keep momentum; grounded ones stop');
 const x=new CharacterMotor(),y=new CharacterMotor(),px=new THREE.Vector3(),py=new THREE.Vector3();
 for(let i=0;i<200;i++){const c=cmd({wish:new THREE.Vector3(Math.sin(i/20)*6,0,-3),jump:i%70===0,jumpHeld:i%70<15,settle:true});x.step(floor,px,c,1/60);y.step(floor,py,c,1/60)}
 assert.equal(px.distanceTo(py),0,'identical commands give identical motion for any actor');
 console.log('PASS: frame-rate-independent jumps, variable jump height, ready crouch, slide, air momentum and determinism.');
}finally{await rm(file,{force:true})}
