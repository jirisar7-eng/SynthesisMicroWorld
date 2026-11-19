/**
 * Tracks compacted ground caused by ACTUAL citizen movement.
 * No god-painted roads or predetermined routes.
 * Each step stores a reproducible cell and accumulated foot traffic.
 */
export class Footpaths {
  constructor({cellSize=1.5,maxCells=1600}={}){
    this.cellSize=cellSize;
    this.maxCells=maxCells;
    this.cells=new Map();
    this.totalSteps=0;
  }
  cell(x,z){
    const cx=Math.round(x/this.cellSize),cz=Math.round(z/this.cellSize);
    return {cx,cz,key:cx+':'+cz,x:cx*this.cellSize,z:cz*this.cellSize};
  }
  record(x,z,amount=1,weather='clear'){
    if(!Number.isFinite(x)||!Number.isFinite(z)||amount<=0)return null;
    if(Math.hypot(x,z)>38.5)return null;
    const c=this.cell(x,z);
    let entry=this.cells.get(c.key);
    if(!entry){
      if(this.cells.size>=this.maxCells){
        const smallest=[...this.cells.values()].sort((a,b)=>a.traffic-b.traffic)[0];
        if(smallest&&smallest.traffic<1.25)this.cells.delete(smallest.key);
        else return null;
      }
      entry={...c,traffic:0,traversals:0,lastSeen:0};
      this.cells.set(c.key,entry);
    }
    const wet=weather==='rain'?.85:weather==='drought'?1.35:1;
    entry.traffic=Math.min(20,entry.traffic+amount*wet);
    entry.traversals++;this.totalSteps++;
    return entry;
  }
  recordMotion(from,to,weather='clear'){
    const distance=Math.hypot(to.x-from.x,to.z-from.z);
    if(!Number.isFinite(distance)||distance<.05)return 0;
    const samples=Math.min(30,Math.max(1,Math.ceil(distance/(this.cellSize*.48))));
    for(let i=1;i<=samples;i++){
      const t=i/samples,x=from.x+(to.x-from.x)*t,z=from.z+(to.z-from.z)*t;
      this.record(x,z,Math.max(.10,distance/samples*.65),weather);
    }
    return samples;
  }
  matureCells(threshold=.9){
    return [...this.cells.values()].filter(p=>p.traffic>=threshold);
  }
  trafficAt(x,z){return this.cells.get(this.cell(x,z).key)?.traffic||0;}
  summary(){
    const mature=this.matureCells();
    const established=mature.filter(p=>p.traffic>=4);
    return {footprints:this.totalSteps,usedCells:this.cells.size,trails:mature.length,established:established.length,
      longestTraffic:Math.max(0,...this.cells.values().map(p=>p.traffic))};
  }
}
