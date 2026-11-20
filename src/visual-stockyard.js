import {solidFootprints,footprintOverlaps} from './spatial-world.js';
import {layoutStockItem,stockSlotGroup} from './stockpile-layout.js';

const TAU=Math.PI*2;
const VISUAL_CONTAINER_KINDS=new Set([
  'crate','basket','tray','pile','shelves','yard'
]);

/** Existing real resources have fixed dimensions; this function only adjusts
 * their drawn location. It cannot mutate items, containers, navigation, or saves.
 * Crowded sites prefer the nearest collision-free area; they never silently
 * fall back to a known overlapping position. */
const FOOTPRINT={
  crate:[.83,.76],basket:[.64,.64],tray:[.76,.62],
  pile:[1.56,1.44],shelves:[1.83,1.29],yard:[1.40,1.40]
};
const extent=(c)=>c.kind==='pile'&&c.id==='stonepile'?[1.5,1.5]:
  FOOTPRINT[c.kind]||[.55,.55];

export function stockItemRadius(type){
  return type==='wood'?.43:type==='twig'?.37:
    type==='stone'?.23:type==='apple'?.24:
    type==='berry'?.16:type==='grain'?.20:
    type==='water'?.20:.14;
}
const box=(id,x,z,hx,hz)=>({id,shape:'box',x,z,hx,hz});
const idSort=(a,b)=>String(a.id).localeCompare(String(b.id),'en',{numeric:true});
const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);

/** Predictable nearby candidates. Sorting and hashed angle make site layouts
 * stable across 5-second server snapshots and independent of array order. */
function* nearby(base,limit=20){
  yield {x:base.x,z:base.z};
  const seed=String(base.key??'').split('').reduce((n,ch)=>n*33+ch.charCodeAt(0),5381)>>>0;
  const start=(seed%32)*TAU/32;
  for(let ring=1;ring<=limit;ring++){
    const distance=ring*.78;
    const n=Math.max(12,Math.ceil(TAU*distance/1.0));
    for(let k=0;k<n;k++){
      const angle=start+k*TAU/n;
      yield {x:base.x+distance*Math.cos(angle),
        z:base.z+distance*Math.sin(angle)};
    }
  }
}

function collidesAt(x,z,hx,hz,obstacles,margin=.16){
  return obstacles.some(s=>footprintOverlaps(x,z,hx,hz,s,margin));
}

function makeFixedObstacles(world,economy){
  // The real simulation contains the gameplay blockers. Remove physical
  // containers because they will be laid out together by this visual planner,
  // then reserve their corrected visual footprints below.
  const physicalIds=new Set([...economy.containers.values()]
    .filter(c=>VISUAL_CONTAINER_KINDS.has(c.kind)).map(c=>String(c.id)));
  return solidFootprints({...world,material:economy}).filter(s=>
    !physicalIds.has(String(s.id))&&
    !String(s.id).startsWith('drop-'));
}

function pathTraffic(world,x,z){
  return typeof world?.paths?.trafficAt==='function'?
    world.paths.trafficAt(x,z):0;
}

function choosePlacement(base,hx,hz,obstacles,height,world,{search=15,pathLimit=4}={}){
  for(const avoidBusyPaths of [true,false]){
    for(const p of nearby(base,search)){
      if(!finite(p))continue;
      const elevation=height(p.x,p.z);
      if(!Number.isFinite(elevation)||elevation<-.3)continue;
      if(collidesAt(p.x,p.z,hx,hz,obstacles))continue;
      // Do not hide an object behind a steep bank or balance it on water.
      const corners=[
        height(p.x-hx,p.z-hz),height(p.x+hx,p.z-hz),
        height(p.x-hx,p.z+hz),height(p.x+hx,p.z+hz)];
      if(corners.some(h=>!Number.isFinite(h)||h<-.35)||
         Math.max(...corners)-Math.min(...corners)>1.7)continue;
      if(avoidBusyPaths){
        const points=[[p.x,p.z],[p.x-hx*.65,p.z-hz*.65],
          [p.x+hx*.65,p.z+hz*.65]];
        if(points.some(([x,z])=>pathTraffic(world,x,z)>=pathLimit))continue;
      }
      return p;
    }
  }
  return null;
}

/** Return two maps with no changes to economy or world state:
 * container positions and visible per-ID item poses, plus diagnostics.
 * A site is intentionally NOT moved in game state: the staging goods
 * are visually placed outside its physical building footprint.
 */
export function planStockVisuals(world,economy,visibleItems,height,
  {previousAnchors=new Map()}={}){
  if(!world||!economy?.containers||!Array.isArray(visibleItems)||
     typeof height!=='function')throw new TypeError('Invalid visual stockyard input');
  const fixed=makeFixedObstacles(world,economy);
  const obstacles=[...fixed];
  const containers=new Map(),itemPositions=new Map(),hidden=new Set();
  const physical=[...economy.containers.values()]
    .filter(c=>VISUAL_CONTAINER_KINDS.has(c.kind)&&finite(c))
    .sort((a,b)=>{
      const order=c=>c.kind==='yard'?3:c.kind==='basket'?2:c.kind==='shelves'?1:0;
      return order(a)-order(b)||idSort(a,b);
    });
  let relocatedContainers=0,relocatedItems=0;
  const unplacedContainers=new Set();
  // Avoid leaving full stockyard pads through already-built walls, trees,
  // springs, other racks, camps or established walkways.
  for(const c of physical){
    const [hx,hz]=extent(c),old=previousAnchors.get(c.id);
    const base=(finite(old)&&Math.hypot(old.x-c.x,old.z-c.z)<16)?
      {...old,key:c.id}:{x:c.x,z:c.z,key:c.id};
    const found=choosePlacement(base,hx,hz,obstacles,height,world,{search:16});
    if(!found){unplacedContainers.add(c.id);continue;}
    containers.set(c.id,{x:found.x,z:found.z});
    obstacles.push(box('visual-'+c.id,found.x,found.z,hx,hz));
    if(Math.hypot(found.x-c.x,found.z-c.z)>.025)relocatedContainers++;
  }

  // One ordinal stream per shared container+kind, so mixed edible goods do
  // not accidentally render on the same point. No O(n²) ID lookups.
  const ordinals=new Map();
  const itemsByKind=new Map(),individual=[];
  for(const item of [...visibleItems].sort(idSort)){
    const c=economy.containers.get(item.container);
    if(!c){hidden.add(item.id);continue;}
    const key=c.id+':'+stockSlotGroup(item,c);
    const n=ordinals.get(key)||0;ordinals.set(key,n+1);
    if(c.kind==='carry'){
      // The MaterialRenderer owns hand-carried meshes and handPose geometry.
      continue;
    }
    if(unplacedContainers.has(c.id)){hidden.add(item.id);continue;}
    const anchor=containers.get(c.id)||{x:c.x,z:c.z};
    const pos=layoutStockItem(item,{...c,...anchor},n);
    if(VISUAL_CONTAINER_KINDS.has(c.kind)){
      itemPositions.set(item.id,pos);continue;
    }
    const record={item,c,pos,radius:stockItemRadius(item.type)};
    if(c.kind==='site'){
      const groupKey=c.id+':'+item.type;
      if(!itemsByKind.has(groupKey))itemsByKind.set(groupKey,[]);
      itemsByKind.get(groupKey).push(record);
    }else individual.push(record);
  }

  // Staging material: preserve existing compact stone/log arrangements
  // instead of scattering every log individually; move entire bundle into
  // the nearest physically free plot beside its construction.
  const staged=[...itemsByKind.entries()].sort(([a],[b])=>a.localeCompare(b));
  for(const [key,records] of staged){
    let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
    for(const {pos,radius} of records){
      minX=Math.min(minX,pos.x-radius);
      maxX=Math.max(maxX,pos.x+radius);
      minZ=Math.min(minZ,pos.z-radius);
      maxZ=Math.max(maxZ,pos.z+radius);
    }
    const center={x:(minX+maxX)/2,z:(minZ+maxZ)/2,key};
    const hx=Math.max(.52,(maxX-minX)/2),hz=Math.max(.52,(maxZ-minZ)/2);
    const found=choosePlacement(center,hx,hz,obstacles,height,world,{search:17});
    if(!found){
      for(const r of records)hidden.add(r.item.id);
      continue;
    }
    const dx=found.x-center.x,dz=found.z-center.z;
    for(const {item,pos} of records)itemPositions.set(item.id,{
      ...pos,x:pos.x+dx,z:pos.z+dz
    });
    obstacles.push(box('stage-'+key,found.x,found.z,hx,hz));
    if(Math.hypot(dx,dz)>.025)relocatedItems+=records.length;
  }

  // Lost/dropped cargo has no valid container geometry: enforce spacing in
  // both directions, never stack two loose pieces inside the same x/z cell.
  for(const {item,pos,radius} of individual){
    const base={x:pos.x,z:pos.z,key:'drop-'+item.id};
    const found=choosePlacement(base,radius,radius,obstacles,height,world,
      {search:16,pathLimit:3.8});
    if(!found){hidden.add(item.id);continue;}
    itemPositions.set(item.id,{...pos,x:found.x,z:found.z,
      height:Math.max(radius*.45,Math.min(pos.height,.35))});
    obstacles.push(box('loose-'+item.id,found.x,found.z,radius,radius));
    if(Math.hypot(found.x-pos.x,found.z-pos.z)>.025)relocatedItems++;
  }

  return {containers,itemPositions,hidden,
    stats:{relocatedContainers,relocatedItems,unplaced: hidden.size}};
}
