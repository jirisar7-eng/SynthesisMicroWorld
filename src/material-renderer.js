import * as THREE from 'three';
import {RECIPES,ITEM_INFO} from './material-world.js';
import {stockSlotGroup} from './stockpile-layout.js';
import {handPose,cargoClass} from './carry-poses.js';
import {terrainPose,foundationContact} from './terrain-contact.js';

const material=(hex,roughness=.92)=>new THREE.MeshStandardMaterial({color:hex,roughness});
const resources={
 wood:material('#8e6245'),twig:material('#a88859'),stone:material('#9b9e94'),
 berry:material('#5b608b',.55),apple:material('#c76c4c',.55),
 seed:material('#c4ac6e'),grain:material('#d6bd77')
};
const box=(x,y,z)=>new THREE.BoxGeometry(x,y,z);
const ground=(h,x,z)=>h(x,z);
function groundGroup(container,h,clearance=.04,maxTilt=.10){
  const g=new THREE.Group();
  const p=terrainPose(h,container.x,container.z,{clearance,maxTilt});
  g.position.set(container.x,p.y,container.z);
  g.rotation.x=p.tiltX;g.rotation.z=p.tiltZ;
  return g;
}
function addFoundationSupports(group,contact,height,color='#918d7d'){
  const mat=material(color);
  for(const p of contact.corners){
    const x=p.x*.86,z=p.z*.86;
    const groundY=height(group.position.x+x,group.position.z+z);
    const depth=Math.max(.08,contact.top-groundY+.05);
    const pier=new THREE.Mesh(box(.36,depth,.36),mat);
    pier.position.set(x,-depth/2+.02,z);
    pier.castShadow=true;pier.receiveShadow=true;group.add(pier);
  }
  const skirtDepth=Math.max(.14,contact.top-contact.low+.06);
  const skirt=new THREE.Mesh(box(
    Math.abs(contact.corners[3].x-contact.corners[0].x)+.12,
    skirtDepth,
    Math.abs(contact.corners[1].z-contact.corners[0].z)+.12),mat);
  skirt.position.y=-skirtDepth/2+.03;skirt.receiveShadow=true;group.add(skirt);
}

function pieceFor(item){
  let shape;
  if(item.type==='wood'){
    shape=new THREE.Mesh(new THREE.CylinderGeometry(.11,.13,.75,7),resources.wood);
  }else if(item.type==='twig'){
    shape=new THREE.Mesh(new THREE.CylinderGeometry(.032,.05,.67,5),resources.twig);
  }else if(item.type==='stone'){
    shape=new THREE.Mesh(new THREE.DodecahedronGeometry(.17,0),resources.stone);
    shape.scale.set(1.25,.72,1);
  }else if(item.type==='berry'){
    shape=new THREE.Mesh(new THREE.SphereGeometry(.115,8,6),resources.berry);
  }else if(item.type==='apple'){
    const group=new THREE.Group();
    const fruit=new THREE.Mesh(new THREE.SphereGeometry(.16,10,8),resources.apple);
    const stem=new THREE.Mesh(new THREE.CylinderGeometry(.016,.022,.13,5),resources.twig);
    stem.position.y=.17;
    group.add(fruit,stem);shape=group;
  }else if(item.type==='water'){
    const bottle=new THREE.Group();
    const glass=new THREE.Mesh(new THREE.CylinderGeometry(.11,.13,.34,10),
      new THREE.MeshStandardMaterial({color:'#83c7db',transparent:true,opacity:.7,
        metalness:.05,roughness:.12}));
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,.055,10),
      resources.stone);
    cap.position.y=.19;bottle.add(glass,cap);shape=bottle;
  }else if(item.type==='seed'){
    shape=new THREE.Mesh(new THREE.DodecahedronGeometry(.095,0),resources.seed);
    shape.scale.y=.58;
  }else{
    shape=new THREE.Mesh(new THREE.ConeGeometry(.13,.4,6),resources.grain);
  }
  shape.userData.itemId=item.id;
  return shape;
}

function crateMesh(container,h){
  const group=groundGroup(container,h,.05,.10);
  const wood=material('#a7825e');
  const base=new THREE.Mesh(box(1.4,.12,1.3),wood);base.position.y=.12;group.add(base);
  for(const x of [-.65,.65]){
    const side=new THREE.Mesh(box(.1,.46,1.32),wood);side.position.set(x,.32,0);group.add(side);
  }
  for(const z of [-.6,.6]){
    const side=new THREE.Mesh(box(1.35,.42,.09),wood);side.position.set(0,.33,z);group.add(side);
  }
  return group;
}
function basketMesh(container,h){
  const group=groundGroup(container,h,.06,.10);
  const wicker=material('#b18a52');
  const shell=new THREE.Mesh(new THREE.CylinderGeometry(.55,.4,.5,12,1,true),wicker);
  shell.material.side=THREE.DoubleSide; shell.position.y=.35;group.add(shell);
  const bottom=new THREE.Mesh(new THREE.CylinderGeometry(.43,.43,.07,12),wicker);
  bottom.position.y=.12;group.add(bottom);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(.52,.055,6,12),wicker);
  rim.rotation.x=Math.PI/2;rim.position.y=.61;group.add(rim);
  const handle=new THREE.Mesh(new THREE.TorusGeometry(.57,.038,6,16,Math.PI),wicker);
  handle.position.y=.61;handle.rotation.z=Math.PI;group.add(handle);
  return group;
}

function shedMesh(container,h){
  const contact=foundationContact(h,container.x,container.z,3.25,2.1);
  const g=new THREE.Group();
  g.position.set(container.x,contact.top,container.z);
  addFoundationSupports(g,contact,h);
  const wood=material('#89745b');
  const slab=new THREE.Mesh(box(3.25,.16,2.1),wood);slab.position.y=.12;g.add(slab);
  const roof=new THREE.Mesh(box(3.5,.15,2.4),material('#6b7066'));roof.position.y=2.1;g.add(roof);
  for(const x of [-1.55,1.55])for(const z of [-.96,.96]){
    const post=new THREE.Mesh(box(.13,2,.13),wood);post.position.set(x,1.05,z);g.add(post);
  }
  return g;
}

function pileBaseMesh(container,height){
  const root=groundGroup(container,height,.01,.075);
  const pallet=material('#977f61'),underside=material('#78674f');
  if(container.id==='woodpile'){
    // Low pallet is a visual staging surface, not a free material resource.
    for(const x of [-1.05,0,1.05]){
      const beam=new THREE.Mesh(box(.24,.09,2.6),underside);
      beam.position.set(x,.035,0);root.add(beam);
    }
    for(const z of [-1.03,-.35,.35,1.03]){
      const plank=new THREE.Mesh(box(2.9,.095,.27),pallet);
      plank.position.set(0,.105,z);plank.receiveShadow=true;root.add(plank);
    }
  }else if(container.id==='stonepile'){
    const circle=new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.44,.065,16),material('#928875'));
    circle.position.y=.04;circle.receiveShadow=true;root.add(circle);
    for(let i=0;i<10;i++){
      const theta=i*Math.PI*2/10;
      const chip=new THREE.Mesh(new THREE.DodecahedronGeometry(.10,0),material('#929a91'));
      chip.position.set(Math.cos(theta)*1.2,.10,Math.sin(theta)*1.16);root.add(chip);
    }
  }
  return root;
}
function seedTrayMesh(container,height){
  const root=groundGroup(container,height,.02,.09);
  const mat=material('#9e805b');
  const base=new THREE.Mesh(box(1.3,.09,1),mat);base.position.y=.045;root.add(base);
  for(const x of [-.61,.61]){
    const side=new THREE.Mesh(box(.08,.19,1.05),mat);
    side.position.set(x,.14,0);root.add(side);
  }
  for(const z of [-.48,.48]){
    const side=new THREE.Mesh(box(1.30,.18,.08),mat);
    side.position.set(0,.14,z);root.add(side);
  }
  return root;
}

export class MaterialRenderer {
  constructor(scene,height){
    this.scene=scene;this.height=height;this.itemMeshes=new Map();this.containers=new Map();
    this.group=new THREE.Group();scene.add(this.group);
    this.previousSignature='';this.basketCount=0;
    this.carriers=new Map();
    // One low-cost instanced draw call for all loose-ground contact shadows.
    // Per-item real-time shadow maps would waste hundreds of draws on phones.
    this.groundShadows=null;this.groundShadowCapacity=0;
    this.shadowDummy=new THREE.Object3D();
    this.groundShadowMaterial=new THREE.MeshBasicMaterial({
      color:'#28372b',transparent:true,opacity:.19,depthWrite:false,
      polygonOffset:true,polygonOffsetFactor:-1
    });
  }
  bindCarriers(people){
    this.carriers=new Map(people.map((group,id)=>[id,group]));
  }
  updateGroundShadows(records){
    if(records.length>this.groundShadowCapacity){
      if(this.groundShadows){
        this.group.remove(this.groundShadows);
        this.groundShadows.geometry.dispose();
      }
      this.groundShadowCapacity=Math.max(32,2**Math.ceil(Math.log2(records.length)));
      const mesh=new THREE.InstancedMesh(new THREE.CircleGeometry(1,14),
        this.groundShadowMaterial,this.groundShadowCapacity);
      mesh.frustumCulled=false;mesh.renderOrder=1;
      this.groundShadows=mesh;this.group.add(mesh);
    }
    if(!this.groundShadows)return;
    const dummy=this.shadowDummy;
    for(let i=0;i<records.length;i++){
      const item=records[i];
      const y=this.height(item.pos.x,item.pos.z)+.023;
      dummy.position.set(item.pos.x,y,item.pos.z);
      dummy.rotation.set(-Math.PI/2,0,0);
      const radius=item.type==='wood'?.42:item.type==='stone'?.24:
        item.type==='apple'?.23:item.type==='twig'?.32:.15;
      dummy.scale.set(radius*1.65,radius*1.05,1);
      dummy.updateMatrix();
      this.groundShadows.setMatrixAt(i,dummy.matrix);
    }
    this.groundShadows.count=records.length;
    this.groundShadows.instanceMatrix.needsUpdate=true;
  }
  sync(economy){
    for(const [id,container] of economy.containers){
      if(this.containers.has(id))continue;
      let mesh=null;
      if(container.kind==='crate')mesh=crateMesh(container,this.height);
      else if(container.kind==='basket')mesh=basketMesh(container,this.height);
      else if(container.kind==='shelves')mesh=shedMesh(container,this.height);
      else if(container.kind==='pile')mesh=pileBaseMesh(container,this.height);
      else if(container.kind==='tray')mesh=seedTrayMesh(container,this.height);
      if(mesh){this.group.add(mesh);this.containers.set(id,mesh);}
    }
    const existing=new Set(economy.items.map(i=>i.id));
    for(const [id,mesh] of this.itemMeshes)if(!existing.has(id)){
      mesh.parent?.remove(mesh);this.itemMeshes.delete(id);
    }
    // One indexed layout pass: avoids O(n²) scans on mobile as stocks grow.
    const offsets=new Map(),groundContacts=[];
    // Exact accounting: 1 object in data -> 1 visible piece (LOD may vary later).
    for(const item of economy.items){
      const container=economy.containers.get(item.container);
      const key=item.container+':'+stockSlotGroup(item,container);
      const ordinal=offsets.get(key)||0;
      offsets.set(key,ordinal+1);
      let mesh=this.itemMeshes.get(item.id);
      if(!mesh){
        mesh=pieceFor(item);
        mesh.userData.nativeScale=mesh.scale.clone();
        this.itemMeshes.set(item.id,mesh);this.group.add(mesh);
      }
      const person=container?.kind==='carry'?this.carriers.get(container.ownerId):null;
      const attachment=person?.userData?.cargoAnchor;
      const carried=!!attachment;
      const pos=carried?handPose(item,ordinal):economy.itemLayout(item,ordinal);
      if(!carried && (
        container?.kind==='drop'||
        (container?.kind==='crate'&&ordinal>=16)||
        (container?.kind==='site'&&item.type!=='wood')
      ))groundContacts.push({pos,type:item.type});
      if(carried){
        // CRITICAL: the mesh is literally a child of the moving character.
        // Character translation/rotation happens every render frame, even
        // when inventory sync is throttled to 350 ms.
        if(mesh.parent!==attachment)attachment.add(mesh);
        mesh.position.set(pos.x,pos.y,pos.z);
      }else if(container?.kind==='carry'){
        // A missing model cannot place owner-owned cargo at world origin.
        mesh.visible=false;continue;
      }else{
        if(mesh.parent!==this.group)this.group.add(mesh);
        mesh.position.set(pos.x,ground(this.height,pos.x,pos.z)+pos.height);
      }
      mesh.visible=true;
      // Each real item retains its identity and native geometry. Logs and
      // twigs are physically horizontal relative to their carrier.
      if(item.type==='wood'||item.type==='twig'){
        const angle=pos.yaw||0;
        const direction=new THREE.Vector3(Math.cos(angle),pos.tilt||0,Math.sin(angle)).normalize();
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);
      }else{
        mesh.rotation.set(pos.pitch||pos.tilt||0,pos.yaw||0,pos.roll||0);
      }
      mesh.scale.copy(mesh.userData.nativeScale).multiplyScalar(pos.size||1);
      if(item.type==='wood'){
        const tone=new THREE.Color('#8e6245').lerp(new THREE.Color('#514b49'),item.wet*.63);
        // Per-piece color, never alter shared material for other pieces.
        if(!mesh.material.userData.perPiece){
          mesh.material=mesh.material.clone();mesh.material.userData.perPiece=true;
        }
        mesh.material.color.copy(tone);
      }
    }
    this.updateGroundShadows(groundContacts);
    for(const [id,group] of this.carriers){
      const carried=economy.items.filter(item=>item.container==='carry-'+id);
      if(group.userData.cargoSupport)group.userData.cargoSupport.visible=
        cargoClass(carried)==='hands';
      group.userData.carryClass=cargoClass(carried);
    }
  }
}

const buildingMaterials={
 house:{wall:material('#cdbb99'),roof:material('#93684c')},
 warehouse:{wall:material('#b7a385'),roof:material('#626b5f')},
 farm:{wall:material('#cfb990'),roof:material('#8c7853')},
 hall:{wall:material('#d7c6a9'),roof:material('#6c676a')},
 workshop:{wall:material('#b9b1a0'),roof:material('#646b65')}
};
export class BuildingRenderer {
  constructor(scene,height){
    this.scene=scene;this.height=height;this.done=new Map();this.preview=null;this.previewKey=null;this.fields=new Map();this.tentModels=new Map();
  }
  makeTent(tent){
    const contact=foundationContact(this.height,tent.x,tent.z,3.4,2.8);
    const group=new THREE.Group();group.position.set(tent.x,contact.top,tent.z);
    addFoundationSupports(group,contact,this.height);
    const cloth=material('#9a8e69');
    const frame=material('#65523e');
    const platform=new THREE.Mesh(box(3.4,.10,2.8),material('#a49b7e'));
    platform.position.y=.07;group.add(platform);
    const tentRoof=new THREE.Mesh(new THREE.CylinderGeometry(0,2.3,2.5,4,1,false),cloth);
    tentRoof.rotation.y=Math.PI/4;
    tentRoof.scale.set(1.25,1,1);
    tentRoof.position.y=1.35;
    tentRoof.castShadow=true;
    group.add(tentRoof);
    for(const x of [-1.45,1.45]){
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.08,2,6),frame);
      pole.position.set(x,1.05,0);group.add(pole);
    }
    const entrance=new THREE.Mesh(box(.8,1.25,.04),material('#4a4036'));
    entrance.position.set(0,.67,1.06);group.add(entrance);
    const firepit=new THREE.Mesh(new THREE.CylinderGeometry(.38,.4,.09,10),
      material('#6d6155'));
    firepit.position.set(2,.12,1.9);group.add(firepit);
    this.scene.add(group);
    return group;
  }
  makeBuilding(type,x,z,progress=1){
    const spec=RECIPES[type]||RECIPES.house,mat=buildingMaterials[type]||buildingMaterials.house;
    const [w,d]=spec.size;
    const contact=foundationContact(this.height,x,z,w+.55,d+.55);
    const group=new THREE.Group();group.position.set(x,contact.top,z);
    addFoundationSupports(group,contact,this.height,'#9f9a8c');
    const foundationMeshes=group.children.slice();
    const padHeight=Math.max(.18,contact.top-contact.low+.16);
    const preparedSoil=new THREE.Mesh(box(w+.7,padHeight,d+.7),material('#8a7857'));
    preparedSoil.position.y=.045-padHeight/2;preparedSoil.receiveShadow=true;group.add(preparedSoil);
    const surveyStakes=new THREE.Group();group.add(surveyStakes);
    for(const dx of [-w/2,w/2])for(const dz of [-d/2,d/2]){
      const stake=new THREE.Mesh(box(.09,.65,.09),material('#bf9b69'));
      stake.position.set(dx,.3,dz);surveyStakes.add(stake);
    }
    const platform=new THREE.Mesh(box(w+.55,.22,d+.55),material('#a49374'));
    platform.position.y=.12;platform.receiveShadow=true;group.add(platform);
    const body=new THREE.Mesh(box(w,2.45,d),mat.wall);
    body.position.y=1.36;body.castShadow=true;body.receiveShadow=true;group.add(body);
    const roof=new THREE.Mesh(new THREE.ConeGeometry(Math.max(w,d)*.77,1.67,4),mat.roof);
    roof.rotation.y=Math.PI/4;roof.position.y=3.27;roof.castShadow=true;group.add(roof);
    const entrance=new THREE.Mesh(box(.83,1.55,.10),material('#715644'));
    entrance.position.set(0,.95,d/2+.06);group.add(entrance);
    for(const direction of [-1,1]){
      const window=new THREE.Mesh(box(.54,.56,.07),material('#e0ca96',.3));
      window.position.set(direction*(w*.27),1.64,d/2+.085);group.add(window);
    }
    if(type==='warehouse'||type==='workshop'){
      const chimney=new THREE.Mesh(box(.55,1.15,.55),material('#86776c'));
      chimney.position.set(w*.28,3.15,-d*.12);group.add(chimney);
    }
    if(type==='hall'){
      const porch=new THREE.Mesh(box(w*.75,.18,1.25),material('#b0a58d'));porch.position.set(0,.16,d/2+.74);group.add(porch);
      const sign=new THREE.Mesh(box(1.9,.32,.1),material('#6e825d'));sign.position.set(0,2.5,d/2+.1);group.add(sign);
    }
    if(type==='farm'){
      const trough=new THREE.Mesh(box(1.5,.45,.58),material('#92734f'));
      trough.position.set(-w*.38,.38,d*.8);group.add(trough);
    }
    const finishDetails=group.children.slice(group.children.indexOf(entrance)+1);
    const timber=new THREE.Group();group.add(timber);
    const beamMaterial=material('#8c6749');
    for(const dx of [-w/2+.18,w/2-.18])for(const dz of [-d/2+.18,d/2-.18]){
      const post=new THREE.Mesh(box(.19,2.58,.19),beamMaterial);
      post.position.set(dx,1.4,dz);post.castShadow=true;timber.add(post);
    }
    for(const level of [.52,2.62])for(const dz of [-d/2+.18,d/2-.18]){
      const rail=new THREE.Mesh(box(w-.35,.14,.14),beamMaterial);
      rail.position.set(0,level,dz);timber.add(rail);
    }
    for(const level of [.52,2.62])for(const dx of [-w/2+.18,w/2-.18]){
      const rail=new THREE.Mesh(box(.14,.14,d-.35),beamMaterial);
      rail.position.set(dx,level,0);timber.add(rail);
    }
    const scaffold=new THREE.Group();group.add(scaffold);
    const steel=material('#8f998c'),planks=material('#ab8b5d');
    for(const dx of [-w/2-.62,w/2+.62])for(const dz of [-d/2-.62,d/2+.62]){
      const pole=new THREE.Mesh(box(.07,3.7,.07),steel);
      pole.position.set(dx,1.86,dz);scaffold.add(pole);
    }
    for(const dz of [-d/2-.62,d/2+.62])for(const level of [1.25,2.5,3.35]){
      const rail=new THREE.Mesh(box(w+1.3,.075,.09),steel);
      rail.position.set(0,level,dz);scaffold.add(rail);
    }
    for(const dx of [-w/2-.62,w/2+.62])for(const level of [1.25,2.5,3.35]){
      const rail=new THREE.Mesh(box(.09,.075,d+1.3),steel);
      rail.position.set(dx,level,0);scaffold.add(rail);
    }
    for(const dz of [-d/2-.62,d/2+.62])for(const level of [1.3,2.52]){
      const deck=new THREE.Mesh(box(w+1.15,.07,.45),planks);
      deck.position.set(0,level,dz);deck.castShadow=true;scaffold.add(deck);
    }
    const parts={group,body,roof,entrance,platform,preparedSoil,surveyStakes,
      foundationMeshes,finishDetails,timber,scaffold,progress};
    this.applyProgress(parts,progress,'complete');
    this.scene.add(group);
    return parts;
  }
  applyProgress(v,p,phase='complete'){
    const phases={survey:0,clear:1,grading:2,hauling:3,
      foundation:4,frame:5,finish:6,complete:7};
    const stage=phases[phase]??7;
    v.surveyStakes.visible=stage<4;
    v.preparedSoil.visible=stage>=2;
    for(const part of v.foundationMeshes)part.visible=stage>=4;
    v.platform.visible=stage>=4;
    v.timber.visible=stage===5;
    v.timber.scale.y=stage===5?Math.max(.12,Math.min(1,(p-.70)/.19)):1;
    v.scaffold.visible=stage===5||stage===6;
    v.body.visible=stage>=6;
    v.body.scale.y=stage===6?Math.max(.15,Math.min(1,(p-.89)/.075)):1;
    v.body.position.y=.18+v.body.scale.y*1.18;
    v.roof.visible=stage===7||(stage===6&&p>.97);
    v.entrance.visible=stage===7;
    for(const decoration of v.finishDetails)decoration.visible=stage===7;
  }
  sync(economy,construction){
    for(const tent of economy.tents){
      if(!this.tentModels.has(tent.id)){
        this.tentModels.set(tent.id,this.makeTent(tent));
      }
    }
    for(const b of economy.structures){
      if(this.done.has(b.id))continue;
      const instance=this.makeBuilding(b.type,b.x,b.z,1);
      this.done.set(b.id,instance);
    }
    const key=construction?construction.type+':'+construction.x+':'+construction.z:null;
    if(!key){
      if(this.preview)this.scene.remove(this.preview.group);
      this.preview=null;this.previewKey=null;
    }else if(key!==this.previewKey){
      if(this.preview)this.scene.remove(this.preview.group);
      this.preview=this.makeBuilding(construction.type,construction.x,construction.z,.04);
      this.previewKey=key;
    }
    if(this.preview&&construction)this.applyProgress(this.preview,construction.progress,construction.phase);
    for(const field of economy.fields){
      let patch=this.fields.get(field.id);
      if(!patch){
        const contact=foundationContact(this.height,field.x,field.z,4.8,3);
        patch=new THREE.Group();patch.position.set(field.x,contact.top,field.z);
        addFoundationSupports(patch,contact,this.height,'#745a42');
        const soil=new THREE.Mesh(box(4.8,.18,3),material('#725c43'));
        soil.receiveShadow=true;patch.add(soil);
        for(let r=0;r<4;r++){
          const row=new THREE.Mesh(box(4.5,.14,.3),material('#916f4f'));
          row.position.set(0,.15,(r-1.5)*.65);patch.add(row);
        }
        const plants=new THREE.Group();patch.add(plants);
        for(let r=0;r<4;r++)for(let j=0;j<8;j++){
          const stem=new THREE.Mesh(new THREE.ConeGeometry(.085,.8,4),material('#80a15e'));
          stem.position.set((j-3.5)*.52,.53,(r-1.5)*.65);plants.add(stem);
        }
        patch.userData.plants=plants;this.scene.add(patch);this.fields.set(field.id,patch);
      }
      patch.userData.plants.visible=field.planted;
      patch.userData.plants.scale.y=Math.max(.08,field.growth);
    }
  }
}
