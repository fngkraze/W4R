import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {rm} from 'node:fs/promises';
import * as THREE from 'three';
const file='scripts/.bot-movement-check.mjs';
try{
 await build({stdin:{contents:"export {TacticalBot} from './client/src/ai/TacticalBot'; export {accelerateMovement,movementSpeed} from './client/src/game/MovementProfile';",resolveDir:process.cwd(),loader:'ts'},outfile:file,bundle:true,format:'esm',packages:'external'});
 const {TacticalBot,accelerateMovement,movementSpeed}=await import('./.bot-movement-check.mjs');
 let blockedRetries=0;
 const nav={points:[new THREE.Vector3(5,0,0)],nearest:()=>0,path:(from,to,blocked)=>{if(blocked?.size)blockedRetries++;return [to.clone()]}};
 const physics={weaponBlocked:()=>false,canStand:()=>true,canTraverse:()=>true};
 const lane=new THREE.Vector3(10,0,0),bot=new TacticalBot(nav,physics,lane,lane,[],0),position=new THREE.Vector3(),playerVelocity=new THREE.Vector3();
 for(let i=0;i<12;i++){
  const d=bot.update(1/60,position,[]);
  // Brains state intent only; CharacterMotor applies the physics the player uses.
  assert.ok(Math.abs(d.wish.length()-movementSpeed.run)<1e-6,'AI requests the player run speed');
  accelerateMovement(playerVelocity,d.wish,1/60);position.addScaledVector(playerVelocity,1/60);
 }
 assert.ok(playerVelocity.length()>0&&playerVelocity.length()<=movementSpeed.run+1e-6,'shared acceleration ramps toward, never past, run speed');
 assert.ok(accelerateMovement(new THREE.Vector3(6,0,0),new THREE.Vector3(),1/60,true).length()>accelerateMovement(new THREE.Vector3(6,0,0),new THREE.Vector3(),1/60,false).length(),'airborne actors keep more momentum than grounded ones');
 for(let i=0;i<180;i++)bot.update(1/60,position,[]);
 assert.ok(blockedRetries>0,'stationary motor retries while excluding obstructed waypoint');
 bot.reset(position.clone());const distantSurvivor={position:new THREE.Vector3(60,0,0),hp:100};
 const early=bot.update(1/60,position,[distantSurvivor]);assert.ok(early.velocity.length()<.01,'bot holds its lane instead of homing in on an unseen enemy');
 let hunt;for(let i=0;i<4200;i++)hunt=bot.update(1/60,position,[distantSurvivor]);assert.ok(hunt.velocity.x>0,'after its hold time a concealed survivor is hunted beyond visibility range');
 const shooting=new TacticalBot(nav,physics,lane,lane,[],0);let d;const combatPosition=new THREE.Vector3();
 for(let i=0;i<90;i++){d=shooting.update(1/60,combatPosition,[{position:combatPosition.clone().add(new THREE.Vector3(30,0,0)),hp:100}]);combatPosition.addScaledVector(d.velocity,1/60);}
 assert.ok(Math.abs(d.velocity.length()-movementSpeed.fire)<.001,'shooting walk matches player speed');
 const obstructed=new TacticalBot(nav,physics,lane,lane,[],0),nearTarget={position:new THREE.Vector3(10,0,0),hp:100};let recovery;for(let i=0;i<90;i++)recovery=obstructed.update(1/60,new THREE.Vector3(),[nearTarget],true);assert.ok(recovery.velocity.length()>0,'bot repositions when a visible target cannot be hit from its barrel');
 // Human traits: personalities, reaction time, facing cone, hearing and strafing.
 const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),mk=(i,l=V())=>new TacticalBot(nav,physics,l,V(100,0,0),[],i);
 const skills=Array.from({length:10},(_,i)=>mk(i).skill);
 assert.ok(new Set(skills.map(k=>k.reaction.toFixed(2))).size>=6&&skills.every(k=>k.reaction>=.26&&k.reaction<=.56),'bots have different reaction times');
 {const b=mk(3),p=V(),enemy={position:V(0,0,-20),hp:100};let first=-1;for(let t=0;t<2;t+=1/60){const d=b.update(1/60,p,[enemy]);if(d.fire&&first<0)first=t}assert.ok(Math.abs(first-b.skill.reaction)<.05,'first shot waits for the bot\'s reaction time')}
 {const w=mk(2,V(0,0,-50)),q=V();for(let i=0;i<30;i++){const d=w.update(1/60,q,[]);q.addScaledVector(d.wish,1/60)}
  const behind={position:q.clone().add(V(0,0,25)),hp:100};assert.ok(!w.update(1/60,q,[behind]).target,'an enemy directly behind is not seen');
  w.hear(q.clone().add(V(0,0,20)),true);assert.ok(w.update(1/60,q,[behind]).target,'a loud sound makes the bot look around')}
 {const b=mk(5),p=V();b.update(1/60,p,[]);b.hear(V(0,0,-30));const d=b.update(1/60,p,[]);assert.ok(Math.abs(d.wish.length()-movementSpeed.fire)<.01&&d.wish.z<0,'bot walks toward a sound')}
 {const b=mk(6),p=V(),enemy={position:V(0,0,-20),hp:100},signs=new Set();for(let i=0;i<600;i++){const d=b.update(1/60,p,[enemy]);if(Math.abs(d.wish.x)>.5)signs.add(Math.sign(d.wish.x))}assert.equal(signs.size,2,'bot strafes both ways during a fight')}
 console.log('PASS: shared player/AI acceleration, firing speed, stalled waypoint exclusion, reset and concealed survivor pursuit.');
}finally{await rm(file,{force:true})}
