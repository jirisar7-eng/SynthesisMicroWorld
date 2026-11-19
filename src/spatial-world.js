import {RECIPES} from './material-world.js';

/** MW-007 / physical world. Same authoritative footprints for placement, navigation and rendering.
 * Planar (x,z) solid collision is intentional: the terrain supplies the vertical position.
 * No physics engine, teleportation, simulated 3D gravity or false "full physics" claims.
 */
export const CITIZEN_RADIUS = .29;
const WORLD_LIMIT = 37;
const CELL = .85;
const hypot=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const round=(v)=>Math.round(v/CELL);
const loc=(x,z)=>({x,z});
const box=(id,x,z,hx,hz)=>({id,shape:'box',x,z,hx,hz});
const circle=(id,x,z,r)=>({id,shape:'circle',x,z,r});

/** Stable 2D footprints of every gameplay-solid object visible in the settlement. */
export function solidFootprints(world) {
  const material=world.material||world;
  const result=[circle('camp-fire',0,0,1.43)];
  for(const c of material.containers.values()){
    if(c.kind==='carry')continue;
    if(c.kind==='drop'){
      if(!material.items.some(i=>i.container===c.id))continue;
      result.push(circle(c.id,c.x,c.z,.52));continue;
    }
    if(c.kind==='site')continue; // The building's footprint is registered below.
    if(c.kind==='crate')result.push(box(c.id,c.x,c.z,.7,.66));
    else if(c.kind==='basket')result.push(circle(c.id,c.x,c.z,.53));
    else if(c.kind==='tray')result.push(box(c.id,c.x,c.z,.65,.53));
    else if(c.kind==='shelves')result.push(box(c.id,c.x,c.z,1.64,1.12));
    else if(c.kind==='pile')result.push(
      c.id==='woodpile'?box(c.id,c.x,c.z,1.45,1.3):circle(c.id,c.x,c.z,1.41)
    );
    else if(c.kind==='tentStorage')result.push(circle(c.id,c.x,c.z,.5));
  }
  for(const b of material.structures){
    const [w,d]=RECIPES[b.type]?.size||[4,4];
    result.push(box(b.id,b.x,b.z,w/2+.2,d/2+.2));
  }
  for(const project of material.projects.values()){
    if(project.complete)continue;
    const [w,d]=RECIPES[project.type]?.size||[4,4];
    result.push(box(project.id,project.x,project.z,w/2+.2,d/2+.2));
  }
  for(const tent of material.tents){
    result.push(box(tent.id,tent.x,tent.z,1.72,1.42));
    result.push(circle('fire-'+tent.id,tent.x+2,tent.z+1.9,.47));
  }
  for(const field of material.fields){
    result.push(box(field.id,field.x,field.z,2.38,1.52));
  }
  for(const t of world.trees||[])result.push(circle('tree-'+t.id,t.x,t.z,.30));
  for(const t of world.apples||[])result.push(circle('appletree-'+t.id,t.x,t.z,.32));
  for(const t of world.berries||[])result.push(circle('bush-'+t.id,t.x,t.z,.52));
  for(const t of world.stones||[])result.push(circle('deposit-'+t.id,t.x,t.z,.45));
  for(const t of world.saplings||[])result.push(circle('sapling-'+t.id,t.x,t.z,.24));
  for(const b of world.boulders||[])result.push(circle('boulder-'+b.id,b.x,b.z,b.r||.72));
  for(const b of world.fallenLogs||[])result.push(circle('fallenlog-'+b.id,b.x,b.z,.78));
  return result;
}

/** A lightweight broad-phase grid: collision checks see only nearby solids.
 * Cell buckets include each footprint's maximum citizen clearance, preventing
 * any false negatives at bin edges or during continuous swept movement.
 */
const BUCKET=2.4;
export function indexSolids(solids){
  if(solids?.buckets)return solids;
  const buckets=new Map();
  for(const solid of solids){
    const hx=solid.shape==='box'?solid.hx:solid.r;
    const hz=solid.shape==='box'?solid.hz:solid.r;
    const margin=1.02;
    const ax=Math.floor((solid.x-hx-margin)/BUCKET);
    const bx=Math.floor((solid.x+hx+margin)/BUCKET);
    const az=Math.floor((solid.z-hz-margin)/BUCKET);
    const bz=Math.floor((solid.z+hz+margin)/BUCKET);
    for(let x=ax;x<=bx;x++)for(let z=az;z<=bz;z++){
      const k=x+':'+z;
      let list=buckets.get(k);
      if(!list){list=[];buckets.set(k,list);}
      list.push(solid);
    }
  }
  return {buckets,count:solids.length};
}

function nearbySolids(point,index){
  return index.buckets.get(Math.floor(point.x/BUCKET)+':'+Math.floor(point.z/BUCKET))||[];
}

/** True if a citizen/circular hull overlaps the 2D projection of a solid. */
export function collides(point,solid,radius=CITIZEN_RADIUS){
  if(solid.shape==='box'){
    const dx=Math.max(Math.abs(point.x-solid.x)-solid.hx,0);
    const dz=Math.max(Math.abs(point.z-solid.z)-solid.hz,0);
    return dx*dx+dz*dz < radius*radius-1e-9;
  }
  const dx=point.x-solid.x,dz=point.z-solid.z;
  return dx*dx+dz*dz < (solid.r+radius)**2-1e-9;
}
export function isBlocked(point,solids,radius=CITIZEN_RADIUS){
  if(!Number.isFinite(point.x)||!Number.isFinite(point.z)||
    Math.abs(point.x)>WORLD_LIMIT||Math.abs(point.z)>WORLD_LIMIT)return true;
  const candidates=solids?.buckets?nearbySolids(point,solids):solids;
  return candidates.some(s=>collides(point,s,radius));
}

/** Continuous swept-segment check, including diagonal corner clipping. */
export function segmentClear(from,to,solids,radius=CITIZEN_RADIUS){
  const d=hypot(from,to);
  const steps=Math.max(1,Math.ceil(d/.19));
  for(let i=1;i<=steps;i++){
    const t=i/steps;
    if(isBlocked({x:from.x+(to.x-from.x)*t,z:from.z+(to.z-from.z)*t},solids,radius))return false;
  }
  return !isBlocked(from,solids,radius);
}

/** NPCs must approach the outside edge of houses/crates/trees, not enter the mesh center. */
export function approachPoint(from,target,solids,radius=CITIZEN_RADIUS){
  if(!isBlocked(target,solids,radius))return loc(target.x,target.z);
  const heading=Math.atan2(from.z-target.z,from.x-target.x);
  for(const distance of [.45,.8,1.15,1.55,2,2.5,3.1,3.8,4.7,5.7,7.0]){
    let best=null,bestScore=Infinity;
    for(let j=0;j<24;j++){
      const bias=j===0?0:(j%2?1:-1)*Math.ceil(j/2)*(Math.PI/12);
      const angle=heading+bias,p=loc(target.x+distance*Math.cos(angle),target.z+distance*Math.sin(angle));
      if(isBlocked(p,solids,radius))continue;
      const score=hypot(from,p)+Math.abs(bias)*.32;
      if(score<bestScore){best=p;bestScore=score;}
    }
    if(best)return best;
  }
  return null;
}

/** Min-heap for bounded A*; avoids per-step sorting in the browser. */
class Heap{
  constructor(){this.data=[];}
  push(entry){const a=this.data;let i=a.length;a.push(entry);
    while(i){const j=(i-1)>>1;if(a[j].f<=entry.f)break;a[i]=a[j];i=j;}a[i]=entry;}
  pop(){const a=this.data,first=a[0],last=a.pop();
    if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;
      if(j+1<a.length&&a[j+1].f<a[j].f)j++;
      if(a[j].f>=last.f)break;a[i]=a[j];i=j;}a[i]=last;}
    return first;}
  get length(){return this.data.length;}
}
const key=(ix,iz)=>ix+':'+iz;
const neighbors=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
function nearbyWalkableGrid(point,solids,radius){
  const ix=round(point.x),iz=round(point.z);
  let best=null,cost=Infinity;
  for(let ring=0;ring<=6;ring++)for(let x=ix-ring;x<=ix+ring;x++)for(let z=iz-ring;z<=iz+ring;z++){
    if(ring&&Math.max(Math.abs(x-ix),Math.abs(z-iz))!==ring)continue;
    const p=loc(x*CELL,z*CELL),d=hypot(point,p);
    if(d<cost&&!isBlocked(p,solids,radius)&&segmentClear(point,p,solids,radius)){
      best={...p,ix:x,iz:z};cost=d;
    }
  }
  return best;
}
function simplify(path,solids,radius){
  if(path.length<=1)return path;
  const out=[];let i=0;
  while(i<path.length-1){
    let j=path.length-1;
    while(j>i+1&&!segmentClear(path[i],path[j],solids,radius))j--;
    out.push(path[j]);i=j;
  }
  return out;
}

/** Full route or null: no movement through walls and no teleporting through impassable maps. */
export function planWalk(start,target,solids,{radius=CITIZEN_RADIUS,maxNodes=5500}={}){
  // Broad-phase lives only for one planning request; no stale collision cache.
  solids=indexSolids(solids);
  const goal=approachPoint(start,target,solids,radius);
  if(!goal)return null;
  if(isBlocked(start,solids,radius))return null;
  if(segmentClear(start,goal,solids,radius))return [goal];
  const startGrid=nearbyWalkableGrid(start,solids,radius);
  const endGrid=nearbyWalkableGrid(goal,solids,radius);
  if(!startGrid||!endGrid||
    !segmentClear(start,startGrid,solids,radius)||
    !segmentClear(endGrid,goal,solids,radius))return null;
  const open=new Heap(),seen=new Map(),startKey=key(startGrid.ix,startGrid.iz),endKey=key(endGrid.ix,endGrid.iz);
  const heuristic=(x,z)=>Math.hypot(x-endGrid.ix,z-endGrid.iz);
  const begin={ix:startGrid.ix,iz:startGrid.iz,g:0,f:heuristic(startGrid.ix,startGrid.iz),parent:null};
  open.push(begin);seen.set(startKey,begin);
  let finished=null,checked=0;
  while(open.length&&checked++<maxNodes){
    const a=open.pop(),aKey=key(a.ix,a.iz);
    if(seen.get(aKey)!==a)continue;
    if(aKey===endKey){finished=a;break;}
    for(const [dx,dz] of neighbors){
      const ix=a.ix+dx,iz=a.iz+dz,p=loc(ix*CELL,iz*CELL);
      if(Math.abs(p.x)>WORLD_LIMIT||Math.abs(p.z)>WORLD_LIMIT)continue;
      const prev=loc(a.ix*CELL,a.iz*CELL);
      if(isBlocked(p,solids,radius)||!segmentClear(prev,p,solids,radius))continue;
      const g=a.g+Math.hypot(dx,dz),k=key(ix,iz);
      if(seen.has(k)&&seen.get(k).g<=g)continue;
      const node={ix,iz,g,f:g+heuristic(ix,iz),parent:a};
      seen.set(k,node);open.push(node);
    }
  }
  if(!finished)return null;
  const cells=[];for(let c=finished;c;c=c.parent)cells.push(loc(c.ix*CELL,c.iz*CELL));
  cells.reverse();
  return simplify([start,...cells,goal],solids,radius);
}

/** Sample a safe spawn position (used only at initial population creation). */
export function clearSpawn(position,solids){
  if(!isBlocked(position,solids))return position;
  for(let r=.55;r<=7;r+=.25)for(let i=0;i<32;i++){
    const angle=i*Math.PI/16;
    const p=loc(position.x+Math.cos(angle)*r,position.z+Math.sin(angle)*r);
    if(!isBlocked(p,solids))return p;
  }
  throw new Error('No safe citizen spawn near camp');
}

/** A route-aware, continuously collision-checked movement step. */
export function advanceWalk(agent,distance,solids){
  if(!Array.isArray(agent.waypoints))return {moved:false,arrived:false,blocked:true};
  let remaining=Math.max(0,distance),moved=false,iterations=0;
  while(agent.waypoints.length&&iterations++<16){
    const p=agent.waypoints[0],d=hypot(agent,p);
    if(d<.025){agent.waypoints.shift();continue;}
    if(remaining<=0)break;
    const step=Math.min(d,remaining);
    const next=loc(agent.x+(p.x-agent.x)*step/d,agent.z+(p.z-agent.z)*step/d);
    if(!segmentClear(agent,next,solids))return {moved,arrived:false,blocked:true};
    agent.x=next.x;agent.z=next.z;moved=true;remaining-=step;
    if(step>=d-.002)agent.waypoints.shift();
  }
  return {moved,arrived:agent.waypoints.length===0,blocked:false};
}

/** A footprint may not overlap an existing solid when a citizen selects a plot. */
export function footprintOverlaps(x,z,hx,hz,solid,clearance=0){
  if(solid.shape==='box'){
    return Math.abs(x-solid.x)<hx+solid.hx+clearance&&
      Math.abs(z-solid.z)<hz+solid.hz+clearance;
  }
  const dx=Math.max(Math.abs(x-solid.x)-hx,0),dz=Math.max(Math.abs(z-solid.z)-hz,0);
  return dx*dx+dz*dz<(solid.r+clearance)**2;
}

/** Place dropped material beside its owner, on genuinely empty ground.
 * Never turn the owner's standing location into a blocking heap.
 */
export function groundDropPosition(owner,solids){
  for(const r of [1.05,1.35,1.75,2.2]){
    for(let i=0;i<24;i++){
      const angle=i*Math.PI/12;
      const p=loc(owner.x+r*Math.cos(angle),owner.z+r*Math.sin(angle));
      if(!isBlocked(p,solids,.59)&&segmentClear(owner,p,solids,.25))return p;
    }
  }
  return null;
}
