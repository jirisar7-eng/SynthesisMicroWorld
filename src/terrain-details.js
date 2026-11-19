import * as THREE from 'three';

const fract = n => n-Math.floor(n);
const noise = (x,z) => fract(Math.sin(x*17.17+z*53.11)*43758.5453);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

/**
 * One blended terrain decal texture, not an image per tree.
 * Material starts as completely local procedural soil; optional CC0 photo
 * from Poly Haven upgrades it if a build-time fetch produced the asset.
 */
export function makeForestFloorTexture(){
  const size=256,canvas=document.createElement('canvas');
  canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d');
  const tex=new THREE.CanvasTexture(canvas);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.anisotropy=4;
  const mask=()=>{
    const grad=ctx.createRadialGradient(128,128,46,128,128,127);
    grad.addColorStop(0,'rgba(255,255,255,1)');
    grad.addColorStop(.63,'rgba(255,255,255,.94)');
    grad.addColorStop(.89,'rgba(255,255,255,.4)');
    grad.addColorStop(1,'rgba(255,255,255,0)');
    ctx.globalCompositeOperation='destination-in';
    ctx.fillStyle=grad;ctx.fillRect(0,0,size,size);
    ctx.globalCompositeOperation='source-over';
    tex.needsUpdate=true;
  };
  ctx.fillStyle='#7f8161';ctx.fillRect(0,0,size,size);
  for(let i=0;i<7000;i++){
    const x=noise(i*3.7,i*.13)*size,y=noise(i*.23,i*.87)*size;
    const brown=noise(i*2.33,19)*80;
    ctx.fillStyle='rgba('+Math.round(68+brown)+','+
      Math.round(83+brown*.75)+','+Math.round(55+brown*.54)+','+
      (.11+noise(i*13,2)*.27).toFixed(2)+')';
    ctx.fillRect(x,y,.8+noise(i,7)*5,.6+noise(i,9)*2);
  }
  mask();
  // Asset is optional and always served from OUR OWN deployment. Gameplay
  // cannot depend on browser requests to a third-party API.
  if(typeof fetch==='function'){
    fetch('/terrain/manifest.json',{cache:'force-cache'})
      .then(r=>r.ok?r.json():null)
      .then(manifest=>{
        if(!manifest?.ready||!manifest?.file)return;
        if(!/^\/terrain\/forest-ground\.(jpg|webp|png)$/.test(manifest.file))return;
        const image=new Image();
        image.onload=()=>{
          ctx.clearRect(0,0,size,size);ctx.drawImage(image,0,0,size,size);
          // Gentle green tint so a real forest floor does not look like a
          // dark rectangular paved road inside the grassy island.
          ctx.globalCompositeOperation='multiply';
          ctx.fillStyle='rgba(165,188,146,.35)';
          ctx.fillRect(0,0,size,size);
          ctx.globalCompositeOperation='source-over';
          mask();
        };
        image.onerror=()=>{}; // Local procedural fallback already exists.
        image.src=manifest.file;
      }).catch(()=>{});
  }
  return tex;
}

/**
 * Build one vertex-sampled mesh for all foliage patches, so slopes follow
 * the real terrain and there are no floating square photos.
 */
export function createForestPatches(scene,height,trees){
  const positions=[],uvs=[],indices=[];
  let vertex=0;
  for(let i=0;i<trees.length;i+=2){
    const tree=trees[i],x=tree.x+Math.sin(i*2.1)*.45,z=tree.z+Math.cos(i*.8)*.5;
    const rad=2+noise(i,13)*1.45;
    positions.push(x,height(x,z)+.055,z);uvs.push(.5,.5);
    const sides=14;
    for(let j=0;j<=sides;j++){
      const angle=j/sides*Math.PI*2;
      const px=x+Math.cos(angle)*rad,pz=z+Math.sin(angle)*rad;
      positions.push(px,height(px,pz)+.052,pz);
      uvs.push(.5+Math.cos(angle)*.5,.5+Math.sin(angle)*.5);
      if(j>0)indices.push(vertex,vertex+j,vertex+j+1);
    }
    vertex+=sides+2;
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({
    map:makeForestFloorTexture(),roughness:1,side:THREE.DoubleSide,transparent:true,
    opacity:.86,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2
  });
  const patch=new THREE.Mesh(geometry,material);
  patch.receiveShadow=true;patch.renderOrder=1;scene.add(patch);
  return patch;
}

/**
 * Trampled ground by the camp and near the first food box; soft procedural
 * alpha transition avoids the former perfectly circular solid-colour pad.
 */
export function createTrampledCamp(scene,height){
  const canvas=document.createElement('canvas');
  canvas.width=192;canvas.height=192;const ctx=canvas.getContext('2d');
  const image=ctx.createImageData(192,192);
  for(let y=0;y<192;y++)for(let x=0;x<192;x++){
    const dx=(x-96)/96,dz=(y-96)/96,r=Math.hypot(dx,dz);
    const rough=(noise(x*.59,y*.43)-.5)*.14;
    const t=clamp((1-r+rough)*3.5,0,1);
    const i=(y*192+x)*4;
    image.data[i]=146+noise(x,y)*28;
    image.data[i+1]=122+noise(x*.8,y)*22;
    image.data[i+2]=88+noise(x,y*.8)*16;
    image.data[i+3]=Math.round(t*178);
  }
  ctx.putImageData(image,0,0);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const geom=new THREE.PlaneGeometry(14,13,22,22);geom.rotateX(-Math.PI/2);
  const a=geom.attributes.position;
  for(let i=0;i<a.count;i++){const x=a.getX(i),z=a.getZ(i);a.setY(i,height(x,z)+.045);}
  geom.computeVertexNormals();
  const mesh=new THREE.Mesh(geom,new THREE.MeshBasicMaterial({
    map:texture,side:THREE.DoubleSide,transparent:true,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2
  }));
  mesh.renderOrder=1;scene.add(mesh);
  return mesh;
}

/** Low-cost fallen leaves, needles and pebbles to break regular grass patterns. */
export function createGroundClutter(scene,height,trees){
  const count=540,dummy=new THREE.Object3D();
  const leaves=['#9e8d65','#7f8651','#b19b70','#536c45'].map(color=>
    new THREE.InstancedMesh(new THREE.PlaneGeometry(.22,.12),
      new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,roughness:1}),count/4));
  const used=[0,0,0,0];
  for(let i=0;i<count;i++){
    const t=trees[i%trees.length],theta=noise(i,7)*Math.PI*2;
    const r=.6+noise(i,13)*3.5;
    const x=t.x+Math.cos(theta)*r,z=t.z+Math.sin(theta)*r;
    const ix=i%4,n=used[ix]++;
    dummy.position.set(x,height(x,z)+.06,z);
    dummy.scale.set(.6+noise(i,2)*1.4,.6+noise(i,3)*1.6,1);
    dummy.rotation.set(-Math.PI/2,0,theta);
    dummy.updateMatrix();
    leaves[ix].setMatrixAt(n,dummy.matrix);
  }
  for(const mesh of leaves){
    mesh.instanceMatrix.needsUpdate=true;
    mesh.frustumCulled=false;
    scene.add(mesh);
  }
}
