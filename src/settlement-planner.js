import {RECIPES} from './material-world.js';
import {footprintOverlaps} from './spatial-world.js';
const types=['house','warehouse','farm','hall','workshop'];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

/**
 * Actual location decision: candidate plots come from inspected terrain
 * and nearby worn footpaths, not a fixed list of prefab coordinates.
 * The person must have explored within sight of the candidate or be near camp.
 */
export function selectBuildingNeed(material, population=6, averageMood=60){
  const buildings=material.structures;
  const count=t=>buildings.filter(b=>b.type===t).length;
  if(count('house')===0)return 'house';
  if(count('warehouse')===0)return 'warehouse';
  if(count('farm')===0&&material.count('seed')>=1)return 'farm';
  const homes=count('house')*4;
  if(population>homes)return 'house';
  if(count('hall')===0&&averageMood<88)return 'hall';
  if(count('workshop')===0)return 'workshop';
  if(population>homes-1&&count('house')<6)return 'house';
  return null;
}
export function chooseSettlementSite(type,context={}){
  if(!RECIPES[type])return null;
  const height=context.height||(()=>2);
  const paths=context.paths;
  const buildings=context.buildings||[];
  const known=context.known||[];
  const obstacles=context.obstacles||[];
  const attempts=context.attempts||170;
  const center=context.center||{x:0,z:0};
  const size=RECIPES[type].size;
  let best=null,bestScore=-Infinity;
  const seed=types.indexOf(type)+buildings.length*5;
  for(let i=0;i<attempts;i++){
    const angle=(i*2.3999632297+seed*.83)%(Math.PI*2);
    const ring=6.8+(i%14)*.94+((i*7)%9)*.11;
    const x=center.x+Math.cos(angle)*ring,z=center.z+Math.sin(angle)*ring;
    const r=Math.hypot(x,z),y=height(x,z);
    if(r>32.5||r<5.1||y<-.02||y>4.4)continue;
    const slopes=[
      Math.abs(height(x-size[0]/2,z)-y),
      Math.abs(height(x+size[0]/2,z)-y),
      Math.abs(height(x,z-size[1]/2)-y),
      Math.abs(height(x,z+size[1]/2)-y)
    ];
    const slope=Math.max(...slopes);
    if(slope>.83)continue;
    const occupied=buildings.some(b=>{
      const other=RECIPES[b.type]?.size||[4,4];
      return Math.abs(b.x-x)<(size[0]+other[0])/2+1.6&&
        Math.abs(b.z-z)<(size[1]+other[1])/2+1.6;
    });
    if(occupied)continue;
    // Do not remove standing trees or erase deposits invisibly.
    if(obstacles.some(o=>footprintOverlaps(x,z,size[0]/2,size[1]/2,o,.9)))continue;
    if(known.length&&r>9&&!known.some(p=>Math.hypot(p.x-x,p.z-z)<10))continue;
    const trail=paths?paths.trafficAt(x,z):0;
    const nearbyTrail=paths?
      [paths.trafficAt(x-2,z),paths.trafficAt(x+2,z),paths.trafficAt(x,z-2),paths.trafficAt(x,z+2)]
        .reduce((a,b)=>Math.max(a,b),0):0;
    const ringPreference=type==='farm'?15:type==='warehouse'?9:type==='hall'?12:11;
    const score=(trail*.32+nearbyTrail*.25)+13-Math.abs(r-ringPreference)*.58-slope*8
      +Math.sin(i*1.41+seed)*.12;
    if(score>bestScore){best={x:Math.round(x*10)/10,z:Math.round(z*10)/10,type,score};bestScore=score;}
  }
  return best;
}
export function decideCommunityProject(material,context={}){
  const mood=context.averageMood??65;
  const type=selectBuildingNeed(material,context.population??6,mood);
  if(!type)return null;
  const recipe=RECIPES[type];
  if(!material.canAfford(recipe))return null;
  const site=chooseSettlementSite(type,context);
  return site?{...site,recipe,reason:({
    house:'Lidé potřebují lepší bydlení a místo k odpočinku.',
    warehouse:'Kryté místo ochrání jídlo a dřevo před počasím.',
    farm:'Nalezená semínka lze pěstovat na vhodné půdě.',
    hall:'Obyvatelé potřebují místo pro společná setkání.',
    workshop:'Výroba nástrojů a vybavení potřebuje dílnu.'
  })[type]}:null;
}
