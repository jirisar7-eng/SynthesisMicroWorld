import {solidFootprints} from './spatial-world.js';

/**
 * MW-020A visual occupancy:
 * physical objects, stock and every decorative tuft consult the SAME
 * spatial registry before being drawn. Base terrain, decals and the sea are
 * surfaces (intended substrates), not competing physical objects.
 *
 * This registry NEVER mutates the authoritative server world.
 */
const CELL=3;
const finite=(n)=>Number.isFinite(n);
const extra=(id)=>{
  const s=String(id||'');
  // Collision footprints in the original simulation cover navigation/trunks;
  // visible tree crowns, shrubs and roofs are much larger than the trunk.
  if(s.startsWith('tree-')||s.startsWith('appletree-'))return 1.15;
  if(s.startsWith('sapling-'))return .47;
  if(s.startsWith('bush-'))return .35;
  if(s.startsWith('deposit-'))return .27;
  if(s.startsWith('boulder-'))return .18;
  if(s.startsWith('fallenlog-'))return .28;
  if(s.startsWith('camp-fire')||s.startsWith('fire-'))return .13;
  if(s.startsWith('spring-'))return .27;
  // Building size includes the architectural shell; reserve eaves & steps.
  if(s.startsWith('building-')||s.startsWith('project-'))return .32;
  return .11;
};
const extent=p=>p.shape==='box'?
  {hx:p.hx,hz:p.hz}:{hx:p.r,hz:p.r};

export function inflatedFootprint(p){
  const margin=extra(p.id);
  if(p.shape==='box')return {...p,hx:p.hx+margin,hz:p.hz+margin};
  return {...p,r:p.r+margin};
}
export function physicalIntersects(a,b,pad=0){
  if(a.shape==='circle'&&b.shape==='circle'){
    return Math.hypot(a.x-b.x,a.z-b.z)<a.r+b.r+pad-1e-7;
  }
  if(a.shape==='box'&&b.shape==='box'){
    return Math.abs(a.x-b.x)<a.hx+b.hx+pad-1e-7&&
      Math.abs(a.z-b.z)<a.hz+b.hz+pad-1e-7;
  }
  const circle=a.shape==='circle'?a:b,box=a.shape==='box'?a:b;
  const dx=Math.max(0,Math.abs(circle.x-box.x)-box.hx);
  const dz=Math.max(0,Math.abs(circle.z-box.z)-box.hz);
  return dx*dx+dz*dz<(circle.r+pad)*(circle.r+pad)-1e-7;
}
export function visualFixedFootprints(world){
  return solidFootprints(world).map(inflatedFootprint);
}
export class VisualOccupancy {
  constructor(fixed=[]){
    this.grid=new Map();this.objects=[];
    this.fixedCount=0;
    for(const p of fixed){this.add(p);this.fixedCount++;}
  }
  nearby(p){
    const {hx,hz}=extent(p);
    const lowX=Math.floor((p.x-hx-.2)/CELL),highX=Math.floor((p.x+hx+.2)/CELL);
    const lowZ=Math.floor((p.z-hz-.2)/CELL),highZ=Math.floor((p.z+hz+.2)/CELL);
    const result=new Set();
    for(let ix=lowX;ix<=highX;ix++)for(let iz=lowZ;iz<=highZ;iz++){
      for(const other of this.grid.get(ix+':'+iz)||[])result.add(other);
    }
    return result;
  }
  free(p,margin=.055){
    if(!p||!finite(p.x)||!finite(p.z))return false;
    for(const other of this.nearby(p)){
      if(physicalIntersects(p,other,margin))return false;
    }
    return true;
  }
  add(p){
    if(!p||!finite(p.x)||!finite(p.z))throw new TypeError('Invalid footprint');
    const {hx,hz}=extent(p);
    if(!finite(hx)||!finite(hz)||hx<0||hz<0)
      throw new TypeError('Invalid footprint extent');
    this.objects.push(p);
    const lowX=Math.floor((p.x-hx-.2)/CELL),highX=Math.floor((p.x+hx+.2)/CELL);
    const lowZ=Math.floor((p.z-hz-.2)/CELL),highZ=Math.floor((p.z+hz+.2)/CELL);
    for(let ix=lowX;ix<=highX;ix++)for(let iz=lowZ;iz<=highZ;iz++){
      const tile=ix+':'+iz;
      if(!this.grid.has(tile))this.grid.set(tile,[]);
      this.grid.get(tile).push(p);
    }
  }
  reserveCircle(id,x,z,r){
    const p={shape:'circle',id,x,z,r};
    if(!this.free(p))return false;
    this.add(p);return true;
  }
  /** Collect confirmed overlaps among authored fixed solids, for future
   * server-side repairs on a backup. Reporting is read-only, never a silent
   * move of somebody's saved trees, houses or crates.
   */
  fixedConflicts(limit=80){
    const result=[],seen=new Set();
    const authored=new Set(this.objects.slice(0,this.fixedCount));
    for(let i=0;i<this.fixedCount;i++){
      const p=this.objects[i];
      for(const other of this.nearby(p)){
        if(other===p||!authored.has(other))continue;
        const ids=[String(p.id),String(other.id)].sort();
        const token=ids.join('|');
        if(seen.has(token)||!physicalIntersects(p,other))continue;
        seen.add(token);result.push(ids);
        if(result.length>=limit)return result;
      }
    }
    return result;
  }
}
