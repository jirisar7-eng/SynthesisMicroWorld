import * as THREE from 'three';
import {buildShoreGeometry} from './shore-visuals.js';

/** Low-contrast tileable albedo for the existing water surface.
 * This is colour only: no shader simulation, physics, depth or game state.
 */
export function makeSeaDetailTexture(){
  const size=128,canvas=document.createElement('canvas');
  canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d');
  const image=ctx.createImageData(size,size);
  const twoPi=Math.PI*2;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const a=x/size,b=y/size;
    const ripple=2.4*Math.sin(twoPi*(a*4+b*2))+
      1.7*Math.sin(twoPi*(a*7-b*5))+
      .9*Math.cos(twoPi*(a*13+b*11));
    const v=Math.max(225,Math.min(253,240+ripple)),i=(y*size+x)*4;
    image.data[i]=v;
    image.data[i+1]=Math.min(255,v+3);
    image.data[i+2]=Math.min(255,v+5);
    image.data[i+3]=255;
  }
  ctx.putImageData(image,0,0);
  const texture=new THREE.CanvasTexture(canvas);
  texture.wrapS=THREE.RepeatWrapping;
  texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(13,13);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=2;
  return texture;
}

function ribbonMesh(points,indices,color,opacity){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  geometry.setIndex(indices);
  const material=new THREE.MeshBasicMaterial({
    color,transparent:true,opacity,depthWrite:false,
    side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1
  });
  const mesh=new THREE.Mesh(geometry,material);
  mesh.renderOrder=3;
  return mesh;
}

/** Two subtle visual-only near-shore ribbons per EXISTING island. */
export function createShoreVisuals(scene,height,level=-.58){
  const group=new THREE.Group();
  for(const centerX of [0,86]){
    const geometry=buildShoreGeometry(height,centerX,level);
    if(!geometry)continue;
    group.add(ribbonMesh(geometry.shallows.positions,geometry.shallows.indices,
      '#8cb9af',.20));
    group.add(ribbonMesh(geometry.foam.positions,geometry.foam.indices,
      '#d3dfcd',.22));
  }
  group.position.y=level+.029;
  scene.add(group);
  return group;
}
