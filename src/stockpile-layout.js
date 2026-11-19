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
const stackCenter=(pile,spacing=3)=>({
  x:(pile%3)*spacing,
  z:Math.floor(pile/3)*spacing
});

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
  const base=c.kind==='shelves'?.38:.17;
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
  const layer=Math.floor(index/7),slot=index%7;
  const angle=(slot-1)*TWO_PI/6;
  const radius=slot===0?0:.285;
  return withContainer(c,Math.cos(angle)*radius,
    Math.sin(angle)*radius,
    .38+layer*(type==='apple'?.29:.17),
    hash(index*13)*TWO_PI,.96+jitter(index*29,.08));
}
function crate(c,index,type){
  // 4 columns × 3 rows, then a new layer inside the crate (never a linear trail).
  const tier=Math.floor(index/12),n=index%12;
  const col=n%4,row=Math.floor(n/4);
  const isSmall=type==='berry'||type==='seed';
  const spacingX=isSmall?.225:.30,spacingZ=isSmall?.225:.31;
  return withContainer(c,
    (col-1.5)*spacingX+jitter(index*5,.012),
    (row-1)*spacingZ+jitter(index*7,.012),
    .34+tier*(isSmall?.185:.29),hash(index)*TWO_PI,.95+jitter(index*19,.08));
}
function fieldTray(c,index){
  const tier=Math.floor(index/20),n=index%20;
  const col=n%5,row=Math.floor(n/5);
  return withContainer(c,(col-2)*.18+jitter(n*3,.02),
    (row-1.5)*.16+jitter(n*7,.02),.14+tier*.115,
    hash(index*5)*TWO_PI,.9);
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
  if(['carry','basket','crate','tentStorage'].includes(container?.kind))return 'all';
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
  if(container.kind==='tray')return fieldTray(container,n);
  if(item.type==='wood')return logs(container,n,item.type);
  if(item.type==='twig')return twigs(container,n);
  if(item.type==='stone')return stones(container,n);
  if(item.type==='apple'||item.type==='berry'||item.type==='grain')return crate(container,n,item.type);
  if(item.type==='seed')return fieldTray(container,n);
  return crate(container,n,item.type);
}
