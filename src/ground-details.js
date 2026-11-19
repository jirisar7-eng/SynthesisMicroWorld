/**
 * Procedural repeating PBR albedo for the natural ground.
 * No external textures, requests or license dependencies are needed.
 * Detailed land still remains a preview; photogrammetry assets come later.
 */
export function createGroundTexture(THREE){
  const size=256,canvas=document.createElement('canvas');
  canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d',{willReadFrequently:false});
  const pixels=ctx.createImageData(size,size);
  let seed=0x5a9b2c11;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const broad=Math.sin(x*.084+y*.063)*3+Math.cos(y*.137-x*.097)*2.5;
    const mid=Math.sin(x*.49-y*.24)*1.4+Math.cos(y*.35+x*.31)*1.5;
    const grain=(random()-.5)*24;
    const leaf=random()<.014?-17:0;
    const pebble=random()<.009?19:0;
    const delta=broad+mid+grain+leaf+pebble;
    const i=(y*size+x)*4;
    pixels.data[i]=Math.max(0,Math.min(255,240+delta));
    pixels.data[i+1]=Math.max(0,Math.min(255,244+delta));
    pixels.data[i+2]=Math.max(0,Math.min(255,225+delta));
    pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  const tex=new THREE.CanvasTexture(canvas);
  tex.wrapS=THREE.RepeatWrapping;tex.wrapT=THREE.RepeatWrapping;
  tex.repeat.set(17,17);
  tex.anisotropy=4;
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.needsUpdate=true;
  return tex;
}
