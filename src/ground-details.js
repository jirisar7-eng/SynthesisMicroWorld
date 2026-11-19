/**
 * Seamlessly tiled natural albedo. The texture is intentionally low-contrast:
 * island elevation, trampled ground and footpaths provide detail, not a
 * repeated bright square patch every few metres.
 * No network resources and no server-side terrain changes.
 */
export function createGroundTexture(THREE){
  const size=256,canvas=document.createElement('canvas');
  canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d',{willReadFrequently:false});
  const pixels=ctx.createImageData(size,size);
  let seed=0x5a9b2c11;
  const random=()=>{
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return seed/0x100000000;
  };
  const tau=2*Math.PI;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    // Integer spatial frequencies tile without a visible grid seam.
    const u=x/size,v=y/size;
    const broad=3.1*Math.sin(tau*u*2)*Math.cos(tau*v*3);
    const small=1.45*Math.cos(tau*u*7)*Math.sin(tau*v*6);
    const grain=(random()-.5)*10;
    const deadLeaf=random()<.005?-13:0;
    const delta=broad+small+grain+deadLeaf;
    const i=(y*size+x)*4;
    pixels.data[i]=Math.max(0,Math.min(255,218+delta));
    pixels.data[i+1]=Math.max(0,Math.min(255,224+delta));
    pixels.data[i+2]=Math.max(0,Math.min(255,204+delta));
    pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  const tex=new THREE.CanvasTexture(canvas);
  tex.wrapS=THREE.RepeatWrapping;tex.wrapT=THREE.RepeatWrapping;
  // 17 repeats created an obvious white/green checkerboard from above.
  tex.repeat.set(8,8);
  tex.anisotropy=2;
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.needsUpdate=true;
  return tex;
}
