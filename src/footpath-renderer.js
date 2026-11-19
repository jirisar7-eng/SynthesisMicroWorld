import * as THREE from 'three';

/**
 * Creates visible, irregular dirt patches over the exact cells traversed by NPCs.
 * One cheap instanced mesh represents all footpaths (mobile friendly).
 */
export class FootpathRenderer {
  constructor(scene,height,maxCells=1600){
    this.height=height;this.lastRefresh=-10;
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const ctx=canvas.getContext('2d');
    const image=ctx.createImageData(64,64);
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){
      const dx=(x-32)/32,dz=(y-32)/32,r=Math.hypot(dx,dz);
      const noise=Math.sin(x*1.5+y*3.3)*.08+Math.cos(y*.94-x*.41)*.06;
      const alpha=Math.max(0,Math.min(1,(1.03-r+noise)*3.1));
      const i=(y*64+x)*4;
      image.data[i]=185;image.data[i+1]=156;image.data[i+2]=107;
      image.data[i+3]=Math.round(alpha*190);
    }
    ctx.putImageData(image,0,0);
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    const geo=new THREE.PlaneGeometry(1.85,1.85);
    geo.rotateX(-Math.PI/2);
    const mat=new THREE.MeshBasicMaterial({
      map:texture,side:THREE.DoubleSide,transparent:true,depthWrite:false,
      opacity:.82,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1
    });
    this.mesh=new THREE.InstancedMesh(geo,mat,maxCells);
    this.mesh.count=0;this.mesh.frustumCulled=false;
    this.mesh.renderOrder=1;
    scene.add(this.mesh);
    this.dummy=new THREE.Object3D();
  }
  update(pathData,time){
    if(time-this.lastRefresh<.6)return;
    this.lastRefresh=time;
    const cells=pathData.matureCells(.95);
    const cap=Math.min(cells.length,this.mesh.instanceMatrix.count);
    for(let i=0;i<cap;i++){
      const p=cells[i];
      const strength=Math.min(1,p.traffic/5.5);
      const size=.54+strength*.56;
      const jitter=Math.sin(p.cx*17.12+p.cz*9.07)*.15;
      this.dummy.position.set(p.x,this.height(p.x,p.z)+.105+strength*.015,p.z);
      this.dummy.rotation.set(0,(p.cx*3.11+p.cz*1.13)%(Math.PI*2),0);
      this.dummy.scale.set(size*(1+jitter),1,size*(1-jitter));
      this.dummy.updateMatrix();this.mesh.setMatrixAt(i,this.dummy.matrix);
    }
    this.mesh.count=cap;
    this.mesh.instanceMatrix.needsUpdate=true;
  }
}
