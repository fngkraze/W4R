export type Vec3 = { x:number; y:number; z:number };
export type PlayerInput = { seq:number; dt:number; moveX:number; moveZ:number; yaw:number; sprint:boolean; interact:boolean };
export type NetEntity = { id:string; kind:'player'|'crew_ai'; position:Vec3; yaw:number };
export type ServerSnapshot = { type:'snapshot'; tick:number; entities:NetEntity[] };
export type ClientMessage = { type:'input'; input:PlayerInput } | { type:'hello'; name:string };
export const NET = { tickRate: 20, port: 8080 } as const;
