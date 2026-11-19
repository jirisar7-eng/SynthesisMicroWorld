/**
 * Presentation-only treatment of the existing islands' shorelines.
 * Uses the SAME authoritative heightfield and waterline; no terrain edits,
 * resource placement, saved-world changes or artificial new land.
 */
export function findShoreRadius(height,centerX,angle,level=-.58){
  if(typeof height!=='function')throw new TypeError('height function required');
  const c=Math.cos(angle),s=Math.sin(angle);
  let inside=3,outside=centerX?26:49;
  const evaluate=r=>height(centerX+c*r,s*r)-level;
  // The visible island shoreline is a sea-level crossing, not a guess based
  // on the camera or a separate, incompatible decorative terrain formula.
  if(evaluate(inside)<=0||evaluate(outside)>=0)return null;
  for(let k=0;k<22;k++){
    const middle=(inside+outside)/2;
    if(evaluate(middle)>0)inside=middle;
    else outside=middle;
  }
  return (inside+outside)/2;
}

/** Returns two small vertex-buffer ribbons for the already visible shore.
 * Data structure is renderer-independent and can be tested in Node.
 */
export function buildShoreGeometry(height,centerX,level=-.58,segments=192){
  const coast=[];
  if(!Number.isInteger(segments)||segments<12)throw new Error('Invalid coast segments');
  for(let i=0;i<=segments;i++){
    const angle=i/segments*Math.PI*2;
    const radius=findShoreRadius(height,centerX,angle,level);
    if(radius===null)return null;
    coast.push({angle,radius});
  }
  const ribbon=(inner,outer)=>{
    const positions=[],indices=[];
    for(let i=0;i<coast.length;i++){
      const {angle,radius}=coast[i],c=Math.cos(angle),s=Math.sin(angle);
      for(const offset of [inner,outer]){
        const r=radius+offset;
        positions.push(centerX+c*r,0,s*r);
      }
      if(i<segments){
        const a=i*2;
        indices.push(a,a+2,a+1,a+1,a+2,a+3);
      }
    }
    return {positions,indices};
  };
  return {
    // A quiet pale shallow-water band and a very thin foam line, both at the
    // actual sea surface, not an impossible pale ring in the grass.
    shallows:ribbon(.24,1.35),
    foam:ribbon(-.04,.16),
    coast
  };
}
