import assert from 'node:assert/strict';
import {readFile,rm,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import * as THREE from 'three';
const output='scripts/.crossroads-check.mjs';
const original={texture:THREE.TextureLoader.prototype.loadAsync,fetch:globalThis.fetch};
try {
 await build({stdin:{contents:"export {loadCrossroads} from './client/src/world/Crossroads'; export {MapMovement} from './client/src/game/MapMovement'; export {TacticalBot} from './client/src/ai/TacticalBot';",resolveDir:process.cwd(),loader:'ts'},outfile:output,bundle:true,format:'esm',packages:'external'});
 THREE.TextureLoader.prototype.loadAsync=async url=>{await readFile('client/public'+url);const t=new THREE.Texture();t.name=url;return t};
 globalThis.fetch=async url=>{const b=await readFile('client/public'+url);return {ok:true,text:async()=>b.toString(),json:async()=>JSON.parse(b.toString()),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}};
 const {loadCrossroads,MapMovement,TacticalBot}=await import('./.crossroads-check.mjs');const scene=new THREE.Scene(),map=await loadCrossroads(scene);
 assert.equal(map.manifest.renderTriangles,14830,'compiled layout geometry is preserved');assert.equal(map.manifest.displacementPatches,7,'terrain patches retained');
 assert.ok(map.manifest.replacedOriginalProps>140,'source prop locations receive new pack models');
 for(const mesh of map.world){const uv=mesh.geometry.getAttribute('uv');assert.ok(uv,'every mesh keeps valid UVs');for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])assert.ok(m.map||m.metalness>0,'environment surfaces use pack textures; steel fittings use metal material');}
 for(const spawn of [...map.operatorSpawns,...map.militantSpawns]){assert.ok(map.physics.floorAt(spawn)!==null,'spawn supported');assert.ok(map.physics.canStand(spawn),'spawn clear');const p=spawn.clone();for(let i=0;i<60;i++)map.physics.move(p,new THREE.Vector3(0,-.01,0));assert.ok(Math.abs(p.y-spawn.y)<.1,'standing support stable');}
 for(const fps of [30,60])for(const [index,heading] of [[0,null],[2,0],[4,0],[4,7],[4,1]]){
  const p=map.operatorSpawns[index].clone(),motor=new MapMovement(),v=heading===null?new THREE.Vector3():new THREE.Vector3(Math.sin(heading*Math.PI/4)*6.1,0,Math.cos(heading*Math.PI/4)*6.1);let peak=0,base=p.y,landed=false;
  for(let i=0;i<fps*2;i++){motor.update(map.physics,p,v,1/fps,i===5);if(i===5){base=p.y;assert.equal(motor.grounded,false);assert.ok(motor.verticalSpeed>3)}if(i>=5){peak=Math.max(peak,p.y-base);if(i>10&&motor.grounded)landed=true}}
  assert.ok(peak>.23,`full jump at ${fps} FPS, spawn ${index}, heading ${heading}`);assert.ok(landed,'landed after jump');
 }
 await writeFile('/tmp/tactical-nav.json',JSON.stringify({points:map.navigation.points,links:map.navigation.links,start:map.navigation.nearest(map.operatorSpawns[0]),end:map.navigation.nearest(map.militantSpawns[0]),spawns:[...map.operatorSpawns,...map.militantSpawns]}));
 assert.ok(map.cover.length>=15,'combat routes have substantial solid cover');
 for(const lane of map.lanes){assert.ok(map.navigation.path(map.operatorSpawns[0],lane.anchor).length>0,'operator can reach '+lane.name);assert.ok(map.navigation.path(map.militantSpawns[0],lane.anchor).length>0,'militant can reach '+lane.name)}
 for(const c of map.cover){const height=c.height>1.7?1.43:.95,a=c.position.clone().add(new THREE.Vector3(0,height,3)),b=c.position.clone().add(new THREE.Vector3(0,height,-3));assert.ok(map.physics.weaponBlocked(a,b),'cover stops fire at its intended stance height')}
 console.log('Tactical cover:',map.cover.length,'reachable floor nodes:',map.navigation.points.length);
 assert.equal(map.operatorSpawns.length,5);assert.equal(map.militantSpawns.length,5);
 for(const spawns of [map.operatorSpawns,map.militantSpawns])for(let i=0;i<spawns.length;i++)for(let j=i+1;j<spawns.length;j++)assert.ok(spawns[i].distanceTo(spawns[j])>1.2,'team spawns are separated');
 for(const start of [map.operatorSpawns[0],map.militantSpawns[0]])for(const [index,lane] of map.lanes.entries()){
  const bot=new TacticalBot(map.navigation,map.physics,lane.anchor,start,map.cover,index),position=start.clone(),motor=new MapMovement();let closest=Infinity;
  for(let frame=0;frame<1800;frame++){const d=bot.update(1/30,position,[]);motor.update(map.physics,position,d.velocity,1/30,d.jump);closest=Math.min(closest,position.distanceTo(lane.anchor));if(closest<3)break}
  assert.ok(closest<3,`bot physically reaches ${lane.name}; closest ${closest.toFixed(2)}m`);
 }
 console.log('PASS: five separated spawns per team, both teams physically navigate to all three lanes, stance-height cover blocks firing.');
 // Keep all nine AI motors active well beyond their opening lane arrival.
 const agents=[...map.operatorSpawns.slice(1).map((p,i)=>({team:0,p:p.clone(),hp:100,motor:new MapMovement(),brain:new TacticalBot(map.navigation,map.physics,map.lanes[i%3].anchor,map.militantSpawns[0],map.cover,i),cooldown:0})),...map.militantSpawns.map((p,i)=>({team:1,p:p.clone(),hp:100,motor:new MapMovement(),brain:new TacticalBot(map.navigation,map.physics,map.lanes[i%3].anchor,map.operatorSpawns[0],map.cover,i+4),cooldown:0}))];
 let roundsResolved=false,shots=0,maxRun=0;
 for(let frame=0;frame<5400;frame++){
  for(const a of agents){if(a.hp<=0)continue;const opponents=agents.filter(b=>b.team!==a.team&&b.hp>0),d=a.brain.update(1/30,a.p,opponents.map(b=>({position:b.p,hp:b.hp})));maxRun=Math.max(maxRun,d.velocity.length());a.motor.update(map.physics,a.p,d.velocity,1/30,d.jump,d.crouch?1.26:1.72);a.cooldown-=1/30;
   if(d.fire&&a.cooldown<=0){const victim=opponents.find(b=>b.p===d.target.position);if(victim){victim.hp=Math.max(0,victim.hp-18);shots++;a.cooldown=.4}}
  }
  if(!agents.some(a=>a.team===0&&a.hp>0)||!agents.some(a=>a.team===1&&a.hp>0)){roundsResolved=true;break}
 }
 assert.ok(maxRun>6,'AI reaches player running speed');assert.ok(shots>0,'AI leaves opening routes and finds combat');assert.ok(roundsResolved,'extended AI engagement reaches team elimination rather than permanent stalls');
 // A concealed survivor is pursued after reaching a lane, even beyond visibility range.
 const hunterPosition=map.operatorSpawns[0].clone(),survivor=map.militantSpawns[0].clone(),hunter=new TacticalBot(map.navigation,map.physics,hunterPosition.clone(),hunterPosition.clone(),[],0),hunterMotor=new MapMovement();let closest=Infinity;
 for(let frame=0;frame<2700;frame++){const d=hunter.update(1/30,hunterPosition,[{position:survivor,hp:100}]);hunterMotor.update(map.physics,hunterPosition,d.velocity,1/30,d.jump);closest=Math.min(closest,hunterPosition.distanceTo(survivor));if(closest<24&&d.target)break}
 assert.ok(closest<24,'hunter pursues surviving opponent instead of stopping at empty destination');
 console.log('PASS: nine moving AI reach combat and team elimination; hidden survivor pursuit; shared 6.1m/s run speed. Simulated shots:',shots);
 // Internal render data carries geometry, UVs and actual material paths for appearance inspection.
 const geometry=[];
 for(const mesh of map.world){
  const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry,pos=g.getAttribute('position'),uv=g.getAttribute('uv');
  const groups=g.groups.length?g.groups:[{start:0,count:pos.count,materialIndex:0}];
  for(const group of groups){const m=Array.isArray(mesh.material)?mesh.material[group.materialIndex??0]:mesh.material;const positions=[],uvs=[];
   for(let i=group.start;i<group.start+group.count;i++){const v=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);positions.push(v.x,v.y,v.z);uvs.push(uv.getX(i),uv.getY(i))}
   geometry.push({positions,uvs,texture:m.map?.name??null,color:m.color.toArray(),repeat:m.map?.wrapS===THREE.RepeatWrapping});
  }if(g!==mesh.geometry)g.dispose();
 }
 await writeFile('/tmp/crossroads-inspection.json',JSON.stringify(geometry));
 console.log(`PASS: original Crossroads layout, seven terrain patches, ${map.manifest.replacedOriginalProps} prop replacements, actual textures/UVs, all ten spawn supports and clearance, stationary/running jumps at 30/60 FPS; ${map.manifest.collisionTriangles} collision triangles.`);
}finally{THREE.TextureLoader.prototype.loadAsync=original.texture;globalThis.fetch=original.fetch;await rm(output,{force:true})}
