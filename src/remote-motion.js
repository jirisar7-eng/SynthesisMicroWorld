/**
 * Visual-only interpolation between two authoritative server snapshots.
 * Does not advance AI, change inventory, mutate citizens, or write saves.
 */
export const REMOTE_SNAPSHOT_INTERVAL_SECONDS=5;
export const MAX_REMOTE_INTERPOLATION_DISTANCE=25;
export function interpolateRemotePose(from,to,progress){
  if(!from||!to||![from.x,from.z,to.x,to.z].every(Number.isFinite))
    return to&&Number.isFinite(to.x)&&Number.isFinite(to.z)?{x:to.x,z:to.z}:null;
  const distance=Math.hypot(to.x-from.x,to.z-from.z);
  // Large discontinuities (e.g. restored worlds) should never animate NPCs
  // teleporting across solid ground or open sea.
  if(distance>MAX_REMOTE_INTERPOLATION_DISTANCE)
    return {x:to.x,z:to.z};
  const t=Math.max(0,Math.min(1,Number.isFinite(progress)?progress:1));
  return {x:from.x+(to.x-from.x)*t,z:from.z+(to.z-from.z)*t};
}
export function remoteSnapshotMovement(before,after,threshold=.06){
  const previous=new Map((before||[]).map(x=>[x.id,x]));
  let moved=0,checked=0;
  for(const next of after||[]){
    if(next.alive===false)continue;
    const old=previous.get(next.id);
    if(!old)continue;
    checked++;
    if(Number.isFinite(next.x)&&Number.isFinite(next.z)&&
      Math.hypot(next.x-old.x,next.z-old.z)>threshold)moved++;
  }
  return {moved,checked};
}
