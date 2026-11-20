/**
 * MW-006C: compact, bounded, deterministic 3D arrangements for individually
 * tracked items. The world still owns every item; this is presentation only.
 *
 * Positions are relative to a container and include vertical stacking.
 * Wood uses alternating crossed layers, stones form staggered mounds and
 * edible items settle in the inside of actual crates or woven baskets.
 */
const TWO_PI=Math.PI*2;
const GOLDEN_ANGLE=Math.PI*(3-Math.sqrt(5));
const hash=(n)=>{const t=Math.sin(n*127.1+78.233)*43758.5453;return t-Math.floor(t);};
const jitter=(n,amount)=> (hash(n)-.5)*2*amount;
const square=(index,columns,spacingX,spacingZ)=>{
  const col=index%columns,row=Math.floor(index/columns);
  return {x:(col-(columns-1)/2)*spacingX,z:row*spacingZ};
};
const withContainer=(c,x,z,height,yaw=0,size=1,tilt=0,roll=0)=>({
  x:c.x+x,z:c.z+z,height,yaw,size,tilt,roll
});
/** Square spiral for multiple independent low piles; unlike a three-column strip,
 * the stockyard expands in every direction, never as an endless straight line.
 * The first new pile remains to the east of the original for save compatibility. */
const stackCenter=(pile,spacing=3)=>{
  if(pile===0)return {x:0,z:0};
  const ring=Math.ceil((Math.sqrt(pile+1)-1)/2);
  const previous=(2*ring-1)**2,offset=pile-previous,side=2*ring;
  let x,z;
  if(offset<side){x=ring;z=1-ring+offset;}
  else if(offset<2*side){x=ring-1-(offset-side);z=ring;}
  else if(offset<3*side){x=-ring;z=ring-1-(offset-2*side);}
  else{x=-ring+1+(offset-3*side);z=-ring;}
  return {x:x*spacing,z:z*spacing};
};
/** Flat overflow parcels outside a full crate, basket or seed tray.
 * Each parcel consists of at most 16 ground-level units in a small 4x4 pad.
 * No invisible items, no limitless tower. */
function overflowGround(c,index,type,spacing=1.75,skipOrigin=true){
  const parcel=Math.floor(index/16),local=index%16;
  const center=stackCenter(parcel+(skipOrigin?1:0),spacing);
  const col=local%4,row=Math.floor(local/4);
  const radius=type==='apple'?.162:type==='stone'?.125:
    type==='wood'?.14:type==='twig'?.045:type==='grain'?.20:
    type==='berry'?.116:.075;
  return withContainer(c,
    center.x+(col-1.5)*.35+jitter(index*5,.025),
    center.z+(row-1.5)*.35+jitter(index*7,.025),
    radius,hash(index*13)*TWO_PI,
    .96+jitter(index*17,.06),jitter(index*19,.04));
}

/** Stable yard placement shared by actual material logistics and the renderer. */
export const stockyardOffset=(index,spacing=3)=>stackCenter(index,spacing);

/** Individual crossed log courses. One local pile holds up to 36 logs. */
function logs(c,index,type){
  const group=Math.floor(index/36);
  const within=index%36;
  const layer=Math.floor(within/9);
  const cell=within%9;
  const axis=layer%2;
  const col=cell%3,row=Math.floor(cell/3);
  const center=stackCenter(group,c.kind==='shelves'?2.25:3.1);
  const x=(col-1)*(axis?.295:.785)+jitter(index*7+3,.035);
  const z=(row-1)*(axis?.785:.295)+jitter(index*11+7,.029);
  const offset=c.kind==='site'?
    type==='wood'?{x:-(c.buildingWidth||4)/2-1.75,z:.35}:{x:(c.buildingWidth||4)/2+1.75,z:.35}:
    c.kind==='shelves'?{x:-.52,z:-.1}:{x:0,z:0};
  // Logs start just above the actual surface; every crossed layer sits higher.
  // Top of outdoor pallet = terrain + .16; log radius = .13.
  const base=c.kind==='shelves'?.39:c.id==='woodpile'?.29:.14;
  return withContainer(c,x+center.x+offset.x,z+center.z+offset.z,
    base+layer*.256,axis*Math.PI/2+jitter(index*19,.055),
    1+jitter(index*4+2,.047),jitter(index*17,.025));
}
function twigs(c,index){
  const bundle=Math.floor(index/14),n=index%14;
  const center=stackCenter(bundle,1.4);
  return withContainer(c,
    .85+center.x+jitter(index*5,.29),
    -.95+center.z+jitter(index*7,.22),
    (c.kind==='shelves'?.34:.095)+Math.floor(n/5)*.055,
    .3+jitter(index*13,.35),.86+jitter(index*19,.13));
}
/** Stones form a three-tier, irregular conical mound of 26 pieces. */
function stones(c,index){
  const mound=Math.floor(index/26);
  const local=index%26;
  const tier=local<14?0:local<23?1:2;
  const pos=tier===0?local:tier===1?local-14:local-23;
  const n=tier===0?14:tier===1?9:3;
  const angle=pos*GOLDEN_ANGLE+mound*.83;
  const spread=tier===0?.92:tier===1?.61:.31;
  const radius=spread*Math.sqrt((pos+.54)/n);
  const center=stackCenter(mound,2.25);
  const offset=c.kind==='site'?{x:(c.buildingWidth||4)/2+1.45,z:.65}:c.kind==='shelves'?{x:.7,z:-.1}:{x:0,z:0};
  return withContainer(c,
    center.x+offset.x+Math.cos(angle)*radius+jitter(index*3,.055),
    center.z+offset.z+Math.sin(angle)*radius+jitter(index*5,.048),
    (c.kind==='shelves'?.35:.16)+tier*.24,
    angle,.86+hash(index*17)*.38,jitter(index*13,.16),jitter(index*7,.13));
}
/** Hexagonal fruit rings remain *inside* the basket walls. */
function basket(c,index,type){
  // Twelve units at most in a hand-woven basket; extra units rest outside
  // rather than exceeding its rim or forming an unbounded fruit column.
  if(index>=12)return overflowGround(c,index-12,type,1.75);
  const layer=Math.floor(index/7),slot=index%7;
  const angle=(slot-1)*TWO_PI/6;
  const radius=slot===0?0:.285;
  return withContainer(c,Math.cos(angle)*radius,
    Math.sin(angle)*radius,
    .40+layer*.085,
    hash(index*13)*TWO_PI,.96+jitter(index*29,.08));
}
function loose(c,index,type){
  // Overflow stays on the actual terrain beside the container; it never
  // grows into an impossible tower suspended above its wooden rim.
  const angle=index*GOLDEN_ANGLE+.65,spread=.98+.17*Math.sqrt(index+1);
  const radius=type==='wood'?.14:type==='twig'?.045:type==='stone'?.125:
    type==='apple'?.162:type==='seed'?.057:type==='grain'?.20:.116;
  return withContainer(c,
    Math.cos(angle)*spread+jitter(index*9,.055),
    Math.sin(angle)*spread+jitter(index*5,.055),
    radius,hash(index*17)*TWO_PI,.96+jitter(index*13,.06),
    jitter(index*3,.055),jitter(index*7,.04));
}
function crate(c,index,type){
  // One support layer inside the 1.4 × 1.3 m crate, no fruit above rim.
  // Mixed fruit share indexes across types; the larger apple occupies a
  // slightly elevated pocket without intersecting the wooden floor.
  if(index>=16)return overflowGround(c,index-16,type,1.9);
  const col=index%4,row=Math.floor(index/4);
  return withContainer(c,
    (col-1.5)*.305+jitter(index*5,.008),
    (row-1.5)*.285+jitter(index*7,.008),
    type==='apple'?.40:type==='grain'?.34:.35,
    hash(index)*TWO_PI,.96+jitter(index*19,.07));
}
function fieldTray(c,index){
  // A real seed tray is one low compartment, not a vertical silo. Excess
  // seed units are still accounted for but sit as small flat parcels nearby.
  if(index>=20)return overflowGround(c,index-20,'seed',1.65);
  const col=index%5,row=Math.floor(index/5);
  return withContainer(c,(col-2)*.18+jitter(index*3,.02),
    (row-1.5)*.16+jitter(index*7,.02),.14,
    hash(index*5)*TWO_PI,.9);
}
/** MW-019A2: 24 individual edible/seed items fit on one actual 2.55m yard
 * pad. The old generic 16-cell algorithm pushed item 17 onto a second parcel
 * beyond the pad's visual footprint, often through a basket or an NPC.
 * A 5x5 bounded grid is horizontal, independent of the camera, and keeps
 * the real item count and IDs exactly as they are.
 */
function yardFood(c,index,type){
  if(index>=25)return overflowGround(c,index-25,type,2.65);
  const col=index%5,row=Math.floor(index/5);
  const radius=type==='apple'?.162:type==='berry'?.116:
    type==='grain'?.20:type==='water'?.18:.09;
  return withContainer(c,
    (col-2)*.46+jitter(index*5,.016),
    (row-2)*.46+jitter(index*7,.016),
    radius+.015,hash(index*13)*TWO_PI,.96+jitter(index*17,.04));
}
/** Compact, low crossed twig bundles. The old 14-per-bundle spiral placed
 * the second bundle outside its physical stockyard footprint. */
function yardTwigs(c,index){
  if(index>=28)return overflowGround(c,index-28,'twig',2.65);
  const course=Math.floor(index/16),n=index%16;
  const col=n%4,row=Math.floor(n/4);
  return withContainer(c,
    (col-1.5)*.50+jitter(index*3,.016),
    (row-1.5)*.50+jitter(index*5,.016),
    .10+course*.105,course*Math.PI/2+.22+jitter(index*11,.045),
    .91+jitter(index*7,.05));
}
function warehouse(c,item,index){
  if(item.type==='wood')return logs(c,index,item.type);
  if(item.type==='twig')return twigs(c,index);
  if(item.type==='stone')return stones(c,index);
  const crateLike=crate(c,index,item.type);
  return {...crateLike,x:crateLike.x+.88,height:crateLike.height+.03};
}
function inTransit(c,item,index){
  const layer=Math.floor(index/4);
  const col=index%2,row=Math.floor(index%4/2);
  return withContainer(c,(col-.5)*.30,(row-.5)*.23,
    1.10+layer*.22+(item.type==='apple'?.05:0),
    hash(item.id)*TWO_PI,.85+jitter(item.id*17,.08));
}
/** One logical slot stream for mixed fruit in one crate/basket or items carried together. */
export function stockSlotGroup(item,container){
  if(['carry','basket','crate','tentStorage','drop'].includes(container?.kind))return 'all';
  if(container?.kind==='yard'&&container.storageFamily==='food')return 'all';
  if(container?.kind==='shelves'&&['berry','apple','grain','seed'].includes(item.type))return 'food';
  return item.type;
}
export function layoutStockItem(item,container,index){
  if(!container||!item)return {x:0,z:0,height:0,yaw:0,size:1,tilt:0,roll:0};
  const n=Math.max(0,Math.floor(index||0));
  if(container.kind==='carry')return inTransit(container,item,n);
  if(container.kind==='basket')return basket(container,n,item.type);
  if(container.kind==='crate')return crate(container,n,item.type);
  if(container.kind==='shelves')return warehouse(container,item,n);
  if(container.kind==='site'){
    if(item.type==='wood')return logs(container,n,item.type);
    if(item.type==='stone')return stones(container,n);
    return crate(container,n,item.type);
  }
  if(container.kind==='tentStorage')return crate(container,n,item.type);
  if(container.kind==='drop')return loose({...container,x:container.x,z:container.z},n,item.type);
  if(container.kind==='tray')return fieldTray(container,n);
  // Actual overflow storage patches keep goods low and spread on the ground.
  // Items remain individually identified and counted by MaterialWorld.
  if(container.kind==='yard'){
    if(item.type==='wood')return logs(container,n,item.type);
    if(item.type==='stone')return stones(container,n);
    if(item.type==='twig')return yardTwigs(container,n);
    return yardFood(container,n,item.type);
  }
  if(item.type==='wood')return logs(container,n,item.type);
  if(item.type==='twig')return twigs(container,n);
  if(item.type==='stone')return stones(container,n);
  if(item.type==='apple'||item.type==='berry'||item.type==='grain')return crate(container,n,item.type);
  if(item.type==='seed')return fieldTray(container,n);
  return crate(container,n,item.type);
}
