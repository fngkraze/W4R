# W4R

Offline 5v5 tactical elimination: one player and four operator bots versus five militant bots. TypeScript / Three.js browser prototype.

## Map: Dust2

The default map is de_dust2 (`client/public/maps/de_dust2.glb`, "De_Dust 2 with real light" by Neo_minigan, CC BY 4.0; credits in `client/public/maps/CREDITS.md`). The supplied 4096 px baked-lighting textures were resized to 2048 px (13 MB file instead of 128 MB; geometry unchanged). The game scales it by about 1.39 so a 1.72 m character is in proportion to the doors, centres it, builds collision from its triangles and a navigation graph by flooding the walkable floor from the T spawn (0.75 m grid). Lighting is baked into the textures, so the map is drawn unlit and without tone mapping.

Operators start at CT spawn (top of the radar) and militants at T spawn (bottom left), five spawn points each, placed from a top-down render of the model. Bots spread over three lanes: Long A, Mid and B Tunnels. Spawn spots and lane anchors are fractions of the map footprint at the top of `world/Dust2.ts`, so they are easy to nudge. The map has no placed tactical cover, so bots fight from the existing crates and walls by standing and strafing. If the Dust2 file is missing or fails to load, the game falls back to Crossroads automatically. Not yet checked in a browser: floor detection, bot connectivity between the spawns, and spawn positions. A console warning appears if the two spawns are not connected.

## Menus, settings and team select

- **Main menu:** FIND A MATCH and LEADERBOARDS are greyed out placeholders for online play; PLAY AI opens team and character select (BACK returns to the main menu); SETTINGS includes your player name (16 characters, shown on the health bar, kill feed and name tags).
- **Exit:** Escape opens the pause menu; EXIT TO MAIN MENU leaves the match (the game reloads to the main menu).
- **No on-screen tutorials:** control hints and boot messages were removed from the play screen; the teammates icon counts you and your living teammates.
- **Loading screen:** W4R splash with a progress bar while characters and the map load. Startup errors are shown on it.
- **Team and character select:** before each match, pick Operators or Militants and one of that team's two skins (Police 21 / 22, Militant 15 / 16). Characters are shown as live, idling 3D previews. Click a card, use the arrow keys, then DEPLOY or Enter. Your choice is remembered. Your team gets its own spawns, rifle and four bot teammates; the other team plays the opposition.
- **Pause:** Escape releases the mouse and opens the pause menu, which freezes the whole match (round timer, bots, physics, effects). Resume, Settings, or Change team / operator (reloads the game to the select screen). If Resume does nothing right after pressing Escape, wait a second and click again; browsers briefly block re-locking the mouse.
- **Settings:** look sensitivity, aim-down-sights sensitivity, invert vertical look, field of view, master volume, and every control (move, jump, both crouches, reload, fire, aim, flight). Keys and mouse buttons can both be bound. Binding a key that is already used swaps the two. Escape cancels a rebind. Settings and controls are saved in the browser. Escape itself and Enter (restart) are fixed.

## Run

1. Install Node.js, then run `npm install` in this folder.
2. Run `npm run dev` and open the Vite Local URL, normally http://localhost:5173/.
3. Click the game to capture the mouse and start the round countdown.

WASD runs; firing slows to a ready walk. Left mouse fires, right mouse aims, Space jumps, C holds crouch, X toggles crouch, R reloads. Escape releases the mouse and pauses live play while you are alive. Spectating after death and round intermissions continue; round results stay visible. F toggles exploration flight and pauses combat; Space goes up and C goes down. Enter restarts a finished match.

## Movement polish

Acceleration is now exponential (identical at any frame rate) with snappy starts, firmer stops and reduced air control, so jumps keep momentum. The jump motor has variable height (release Space early to trim the rise, after an 80 ms minimum hop), a light apex hang, heavier falls, a terminal velocity and Verlet integration so height no longer varies with frame rate. Takeoff speed, buffering and coyote time are unchanged. Crouching while sprinting starts a slide (8.4 m/s burst, friction decay, gentle steering, cancelled by jumping or releasing crouch). Hard landings dip the camera, scale the landing sound and cost some speed. The chase camera adds sprint/slide FOV kick and a small strafe roll. Raw, unaccelerated mouse input is requested where the browser supports it. Bots keep the shared ground profile. 

Standing still for about 60 ms eases any actor (player and bots) into a low ready crouch (55% of a full crouch); moving stands back up. Because it runs through the shared motor, the camera, hitboxes and animation all follow the lower stance. SOCOM-reference pass: the strafe twist is stronger (hip yaw 0.36 rad at full strafe, chest follows more), the rifle is carried lower and angled with the chest, and the camera no longer adds sprint FOV kick or strafe roll (landing dip is halved). Strafing sways the torso again: a side lean into the step plus hip yaw that the spine counter-rotates (ported from the earlier build's animation pass, for every character).

Animation feel pass: characters lean into a start and rock back slightly on a stop (from measured acceleration), the chest tips and the head looks with the weapon's aim pitch, the rifle trails a fast turn and settles, and the low-ready carry blends a little slower. Landings now scale the hip dip with fall speed, each shot pushes the shoulders back and lifts the head slightly, and standing characters have a slow weight shift. Not yet verified in a browser; `AnimationPolish.check.mjs` and `Reload.check.mjs` should be re-run because the spine posture feeds the shoulder and hand targets.

## Shared player/bot physics and hit registration

Every actor now moves through one `CharacterMotor` (ground/air acceleration, jump, slide, crouch, landing). The keyboard and each bot brain produce the same `MoveCommand`; brains state intent (`wish`, `jump`, `crouch`) and no longer smooth their own velocity. Bots use the same jump, stance and landing rules as the player and only differ in that the AI never slides. This makes the movement a pure function of state, command and dt, ready to run on a server.

Living players are hit by pose-independent capsule hitboxes (`Hitboxes.ts`: head, torso, legs, scaled by crouch) instead of raycasts against animated skinned meshes, which depended on stale bone matrices and bounding spheres. Map geometry still uses ray tests; corpses no longer block shots at living players behind them. The player's aim ray starts at the shoulder plane, so low cover beside or behind the player cannot swallow the shot. `node scripts/Hitboxes.check.mjs` covers the hitbox math and `node scripts/CharacterMotor.check.mjs` covers the shared motor (logic also verified against a stub floor during development). Bots aim at a stance-scaled chest, so crouched targets are no longer shot over or through the head.

## Tactical map pass

Retains the building and terrain geometry from the supplied Crossroads BSP and the textured environment from Assets.zip. Adds 29 solid cover positions across Market, Plaza and East routes: bevelled shipping crates with plank panels, corner battens and steel straps, plus vehicles from the supplied pack. Heights vary between crouch cover and standing blockers. Cover positions are chosen along navigable combat routes, grounded on supported surfaces and kept clear of team spawn areas. The cargo props are modeled in TacticalCover.ts and use texture surfaces extracted from the supplied pack.

The original militant spawn occupied an isolated elevated platform. The new five-player starts use the shared reachable street network, with at least two metres between spawn points. Each team can reach all three lane destinations. The original compiled spawn metadata remains in the layout manifest for provenance; runtime spawns are replaced for this 5v5 setup.

## Combat and map polish

Dead characters now use twelve connected Rapier rigid bodies fitted to their skeletons. Elbows and knees use limited hinges, shoulders/hips have constrained axes, and the torso holds its shape. After settling, bodies become static so joint corrections cannot twist or twitch them on the ground. Fallen mesh hit bounds are refreshed, and corpse shots emit 100 upward-biased droplets so the burst remains visible above the ground. Corpses settle against world collision, retain the rifle on the firing hand, remain visible and can receive further blood hits. Round reset clears corpses and restores bone transforms and weapon attachments. Blood droplets, floor stains and projected wall splatters accompany hits; fatal hits spray more blood. This pass does not include dismemberment. Added ejected brass, muzzle smoke and upper-body hit flinches.

M4/AK reports now use real AR-15 and AK-47 field recordings, with two recorded shots per weapon. Reload handling uses recorded airsoft rifle sounds, split into magazine removal, insertion and bolt cues. Six alternating recorded stone footsteps also supply takeoff and landing contact sounds. Footsteps are now quieter, scale with movement speed, and become very quiet while crouching. Ground-contact sounds use a gentle 2.2 kHz low-pass to soften the crunchy recording, stronger distance falloff and a 20 m range. Jump and landing volumes are reduced. Gun audio is unchanged from build 039. Source authors, CC0 licenses and exact files are listed in client/public/audio/CREDITS.md. Secondary flesh/world impacts and quiet wind remain original synthesized effects. Audio unlocks on the first game click and uses distance attenuation/stereo panning for nearby bots. Reload sounds follow the existing animation milestones.

Map rendering now lifts overly dark baked vertex colours, adds relief to existing surface textures, weathering on stucco foundations, a soft fill light, faint airborne dust and restrained foliage sway. Navigation and cover placement stay intact. Jump takeoff is now 6.8 m/s, approximately 1.1 m clearance on flat ground.

## Bounce, jump and reload

Restored restrained gait bounce: 1.8 cm while running, 1 cm while walking, reduced while crouched; rifle bob follows the body. Shared jump takeoff increased from 4.3 to 5.6 m/s with the existing gravity, producing approximately 0.7 m of clearance on flat ground. Buffered input, ceiling collision and no double jump remain enforced.

Player/allied M4 reloads lower and cant the rifle, move the support hand to the magazine, extract the actual magazine mesh, retrieve/reinsert it, check the receiver and regrip. Enemy AKs use the same hand choreography; their source model has no detachable magazine part. Animation progress follows the ammunition timer. ADS exits during reload, firing stays locked until completion, and reload timers pause with live play.

## Animation pass

Reviewed the supplied 45.8-second playtest. Run/walk/crouch cycles now follow travelled speed with a shared stride phase, normalized authored foot tracks and shorter foot lifts. Running lowers the pelvis to allow bent knees; stance contact holds feet briefly, and ankle orientation stays flat instead of inheriting the shin rotation. Added upper-body counter-rotation, breathing, turn lean, smoother bot facing, and a compact airborne/landing pose.

The rifle is fitted to a shoulder stock contact through idle, carry, recoil, crouch and obstruction raise/lower. It uses a 0.64 scale (approximately 0.76 m overall), with both hand targets retained. Carry no longer drags the stock through the back. The original GLB and texture are unchanged.

A crash inside the per-frame update is now shown in the bottom-left corner as `W4R ERROR — …` (and logged to the console) instead of leaving a silent black screen.

## SOCOM II-style HUD

Modelled on the supplied screenshot and clip (`client/src/ui/Hud.ts`): a translucent top-centre panel with the kill feed (your kills in orange) and a `TACTICAL:` banner for round events; a circular radar top-right that shows teammates and any enemy that has just fired; a bottom-left ammo panel (count, mags, magazine icons, and a picture of your team's actual rifle asset, the M4A1 or AK, rendered side-on with the muzzle to the left by `ui/WeaponIcon.ts`; a generic silhouette is used only if that render fails); a bottom-right health bar with your `[W4R]` name, a teammates-alive icon (counting you) and a dark round-clock strip; while spectating, the health bar shows the watched teammate's name and health and the ammo panel and reticle are hidden; `[W4R]` name tags over living teammates and over the enemy under your reticle. The reticle is four separate ticks plus a faint ring, yellow-green normally, red when it is over an enemy or a hit lands, amber when the muzzle is blocked. It blooms with movement, jumping and each shot, and tightens when still, crouched or aiming. The bloom is visual only; bullets still go exactly where the reticle points. The ring, bloom amounts and radar rules are read from stills, so tune them in `Hud.ts` and the `spreadTarget` line in `main.ts`.

## Human-like bots

Bots now act on limited information. They notice enemies in front of them (about 75 degrees either side), very close by, or after a loud sound; they hear gunfire (45 m), hits, and running footsteps (14 m) with some positional error, and investigate what they heard or last saw at a walk. After reaching their lane they hold and sweep left and right for 5-15 seconds, then push toward the enemy side and roam between spots (they never just park); after 20-34 seconds into the round they start searching the whole map for survivors so rounds still resolve. A bot whose goal has no route wanders to reachable spots instead of freezing. Each bot has its own reaction time (0.26-0.56 s before the first shot) and aim skill; aim error is largest right after spotting an enemy and grows with range and the bot's own movement. They fire in short bursts with pauses, sidestep while fighting out of cover, reload when low and unobserved, and turn less instantly. Tune in `TacticalBot.ts` (`skill`, `huntAfter`, field of view) and the bot fire block in `main.ts` (burst sizes, error scaling, damage 18).

## Match and AI

Three-minute elimination rounds, no mid-round respawn, and no automatic health regeneration. Teams score on elimination; timeouts compare survivors, then remaining team health. Equal teams draw. First team to seven round wins takes the match. Eliminations are evaluated immediately after shooting, including when mouse capture is lost; the timer pauses independently of elimination detection. Every new round restores both teams, ammunition and movement state. Dead bodies clear on the next round. An eliminated player follows a surviving teammate until the next round.

Both teams share the player's 6.1 m/s run, 4.3 m/s firing walk, 2 m/s crouch speed, acceleration and jump motor. AI checks low obstacles for jump recovery, retries stalled routes while temporarily avoiding blocked waypoints, and repositions when its actual muzzle cannot hit a visible opponent. After opening lanes, bots pursue surviving opponents instead of stopping at an empty spawn.

Both teams use reachable-floor pathfinding, distribute across the three lanes with changing openings between rounds, select nearby cover when enemies are visible, alternate covered positions and peeks, and crouch behind lower cover. Bot fire uses actual line of sight, the same muzzle obstruction gate as the player, and a magazine/reload cycle. Teammates are ignored by friendly hitscan. This is offline AI gameplay; the included server is not yet connected to a live multiplayer match.

The supplied M4A1 remains equipped on the player and allies, with original embedded texture and fitted muzzle/hand targets. Militants retain AKs. Existing run, crouch, jump, recoil and camera behavior remain active.

## Asset credits

Layout: geometry from the previously user-supplied de_crossroads.bsp. This is an adapted Crossroads layout with replacement materials and props, rather than a complete restoration of SOCOM II or the original Source materials/models. Unsupported original static models such as domes and arches remain absent.

Environment: user-supplied Assets.zip, CC BY 4.0, https://creativecommons.org/licenses/by/4.0/. Original license and provenance are retained in client/public/crossroads. The archive does not identify an author. Changes include model selection, image path resolution, atlas surface crops, resized fences, plank shutters, cargo cover and new placement.

M4A1: user-supplied m4a1.glb, preserved byte-for-byte. AK: prior supplied pack. Characters: four supplied FBX/PNG pairs. Motion landmarks: CC0 Quaternius Universal Animation Library, https://quaternius.com/packs/universalanimationlibrary.html.

## Validation

- `npm run build`
- `node scripts/Crossroads.check.mjs`: supported/separated 5v5 starts, all lane routes, physical bot traversal from both teams, extended nine-bot combat with simulated line-of-sight damage and survivor pursuit, cover blocking at intended stance height, and running/stationary jump regressions.
- `node scripts/BotMovement.check.mjs`: shared acceleration and speeds, blocked route retries, muzzle recovery and hidden survivor pursuit.
- `node scripts/TacticalRound.check.mjs`: countdown, elimination scoring, intermission, draws, timeout resolution, match completion and restart.
- `node scripts/Audio.check.mjs`: valid audio assets, unlock, attenuation/panning and reload milestone cues.
- `node scripts/CombatEffects.check.mjs`: blood spray, floor/wall splatters, casings and effect cleanup.
- `node scripts/Ragdolls.check.mjs`: physical collapse/settling, ten seconds of motionless rest, fallen-body ray hits, gun attachment, body cleanup and live rig/grip restoration.
- `node scripts/Reload.check.mjs`: magazine extraction/replacement/reseat and hand contact for standing/crouched reloads at 30/60 FPS.
- `node scripts/MapJump.check.mjs`: higher flat-ground jump, input buffering, no airborne double jump and ceiling collision.
- `node scripts/AnimationPolish.check.mjs`: all four characters at 30/60 FPS through movement/stance/air/landing transitions, shoulder stock seating, wrist contact and foot envelopes.
- `node scripts/M4A1.check.mjs` and `node scripts/WeaponObstruction.check.mjs`: model/material retention, muzzle alignment, hand targets and firing lockout.

Graph connectivity and physical movement are checked locally. Browser appearance, combat difficulty, frame rate and competitive balance still need live playtesting.
