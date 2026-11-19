const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
/** Terrain contact: surface-normal approximation for small movable ground props.
 * Y is the real sampled ground level; no camera-based billboard or floating item offsets.
 */
export function terrainPose(height,x,z,{clearance=0,maxTilt=.12,step=.38}={}){
  const y=height(x,z)+clearance;
  const riseX=(height(x+step,z)-height(x-step,z))/(2*step);
  const riseZ=(height(x,z+step)-height(x,z-step))/(2*step);
  return {y,tiltX:clamp(-Math.atan(riseZ),-maxTilt,maxTilt),
    tiltZ:clamp(Math.atan(riseX),-maxTilt,maxTilt)};
}
/** The whole foundation must clear the highest sampled corner. Supports then reach down. */
export function foundationContact(height,x,z,width,depth){
  const corners=[];
  for(const dx of [-.5,.5])for(const dz of [-.5,.5]){
    const px=x+dx*width,pz=z+dz*depth;
    corners.push({x:dx*width,z:dz*depth,y:height(px,pz)});
  }
  const top=Math.max(height(x,z),...corners.map(c=>c.y))+.03;
  const low=Math.min(height(x,z),...corners.map(c=>c.y));
  return {top,low,corners};
}
