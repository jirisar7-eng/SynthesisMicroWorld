import * as THREE from 'three';
import {describeSceneFailure} from './scene-diagnostics.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';
import {MaterialWorld, RECIPES, FOOD_TYPES, ITEM_INFO} from './material-world.js';
import {initializeBiography,lifeEvent,experienceSkill,makeLifeCard} from './biography.js';
import {MaterialRenderer,BuildingRenderer} from './material-renderer.js';
import {Footpaths} from './footpaths.js';
import {FootpathRenderer} from './footpath-renderer.js';
import {decideCommunityProject} from './settlement-planner.js';
import {SocialDynamics} from './social-dynamics.js';
import {createGroundTexture} from './ground-details.js';
import {createForestPatches,createTrampledCamp,createGroundClutter} from './terrain-details.js';
import {loadSpeed} from './carry-poses.js';
import {initializeBuildSite,beginPhase,clearNextObject,phaseProgress,validStage,CONSTRUCTION_LABELS} from './construction-stages.js';
import {createAvatar,selectPlayerMode,advanceAvatar,encounterEffect,PLAYER_LABELS} from './avatar-modes.js';
import {fetchExternalWeather} from './external-world-api.js';
import {createSprings,springRefill,drinkFromSpring,collectSpringWater,waterAvailability} from './water-cycle.js';
import {calendarAt,ageResidents} from './world-calendar.js';
import {WORLD_SAVE_KEY,serializeWorld,restoreWorld,hydrateWorldMirror} from './world-save.js';
import {populationDay,livingSummary,isDependent,isLiving,populateFounders} from './generations.js';
import {solidFootprints,indexSolids,planWalk,advanceWalk,clearSpawn,groundDropPosition,chooseCampPlot} from './spatial-world.js';
import {
  initCognition, observeNearby, chooseKnownResource, chooseExplorationTarget,
  learnOutcome, exchangeKnowledge, decision, knowledgeSummary, episode
} from './cognition.js';
import {initializeLife, updateLife, remember, socialBond, needsDecision, relationshipLabel} from './life.js';

import {Civilization,terrainHeight,clamp,dist,rand,rng,seeded,points,names,colors} from './simulation-core.js';

const el = id => document.getElementById(id);
class Diorama {
  constructor(container,sim,selection={}){
    // The renderer lives outside launchMicroWorld's lexical scope: selection
    // MUST be passed explicitly, never read as a nonexistent global.
    this.getSelectedAgent=selection.getSelectedAgent||(()=>0);
    this.chooseAgent=selection.chooseAgent||(()=>{});
    Diorama.lastStage='webgl';
    this.sim=sim;this.container=container;this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#c8dfdd');this.scene.fog=new THREE.Fog('#c8dfdd',65,205);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.7));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.43;
    container.appendChild(this.renderer.domElement);
    Diorama.lastStage='camera';
    this.camera=new THREE.PerspectiveCamera(47,1,.1,250);this.resetCamera();
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.dampingFactor=.07;this.controls.minDistance=13;this.controls.maxDistance=175;this.controls.maxPolarAngle=Math.PI*.46;this.controls.minPolarAngle=.22;this.controls.target.set(0,1.5,0);this.controls.enablePan=true;this.controls.screenSpacePanning=true;this.controls.maxTargetRadius=115;
    this.ambient=new THREE.HemisphereLight('#edffff','#768b68',2.4);this.scene.add(this.ambient);
    this.clearSky=new THREE.Color('#c8dfdd');this.nightSky=new THREE.Color('#627c84');this.rainSky=new THREE.Color('#869a9b');
    const sun=new THREE.DirectionalLight('#ffeed6',3.5);sun.position.set(-20,43,24);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-49;sun.shadow.camera.right=49;sun.shadow.camera.top=49;sun.shadow.camera.bottom=-49;sun.shadow.camera.near=1;sun.shadow.camera.far=110;sun.shadow.bias=-.00022;this.scene.add(sun);this.sun=sun;
    Diorama.lastStage='terrain';
    const groundGeo=new THREE.PlaneGeometry(100,100,148,148);groundGeo.rotateX(-Math.PI/2);
    const pos=groundGeo.attributes.position,vertices=[];
    const light=new THREE.Color('#a4c68b'),dark=new THREE.Color('#587953'),sandy=new THREE.Color('#c9b68d'),earth=new THREE.Color('#8b795e');
    for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i);const h=terrainHeight(x,z);pos.setY(i,h);
      let color=light.clone().lerp(dark,clamp((.5+Math.sin(x*1.1+z*.35)*.25+Math.cos(z*.94-x*.3)*.22),0,1)*.55);
      if(h<-.25)color.lerp(sandy,clamp((-.25-h)*1.3,0,.95));
      const centerDist=Math.hypot(x,z);
      const worn=clamp((8.8-centerDist)/6.8,0,1)*.35;
      color.lerp(earth,worn);
      const woodland=clamp((centerDist-12)/15,0,1)*(.09+.06*Math.sin(x*.43+z*.61));
      color.lerp(dark,woodland);
      vertices.push(color.r,color.g,color.b);
    }groundGeo.setAttribute('color',new THREE.Float32BufferAttribute(vertices,3));groundGeo.computeVertexNormals();
    const land=new THREE.Mesh(groundGeo,new THREE.MeshStandardMaterial({map:createGroundTexture(THREE),vertexColors:true,roughness:1,side:THREE.DoubleSide}));land.receiveShadow=true;this.scene.add(land);
    // Separate terrain mesh on the same exact deterministic second-island heightfield.
    const farGeo=new THREE.PlaneGeometry(54,54,70,70);
    farGeo.rotateX(-Math.PI/2);
    const farPos=farGeo.attributes.position,farColors=[];
    const farGrass=new THREE.Color('#91b17b'),farBeach=new THREE.Color('#c0b08b');
    for(let i=0;i<farPos.count;i++){
      const x=farPos.getX(i)+86,z=farPos.getZ(i),h=terrainHeight(x,z);
      farPos.setY(i,h);
      const c=farGrass.clone().multiplyScalar(.86+.15*Math.sin(x*.43+z*.52));
      if(h<-.20)c.lerp(farBeach,clamp((-.20-h)*1.05,0,.92));
      farColors.push(c.r,c.g,c.b);
    }
    farGeo.setAttribute('color',new THREE.Float32BufferAttribute(farColors,3));
    farGeo.computeVertexNormals();
    const farLand=new THREE.Mesh(farGeo,land.material);
    farLand.position.x=86;farLand.receiveShadow=true;this.scene.add(farLand);
    const water=new THREE.Mesh(new THREE.PlaneGeometry(270,270),new THREE.MeshPhysicalMaterial({color:'#7cb2ad',roughness:.25,metalness:.07,transparent:true,opacity:.76,clearcoat:.6,clearcoatRoughness:.18}));water.rotation.x=-Math.PI/2;water.position.y=-.58;this.scene.add(water);this.water=water;
    Diorama.lastStage='resources';
    this.addCamp();
    this.treeModels=[];this.berryModels=[];this.saplingModels=[];
    this.boulderModels=[];this.fallenLogModels=[];
    this.addForest();this.addBerries();this.addSprings();
    createForestPatches(this.scene,terrainHeight,this.sim.trees);
    createTrampledCamp(this.scene,terrainHeight);
    createGroundClutter(this.scene,terrainHeight,this.sim.trees);
    this.addRocksAndGrass();this.addDeposits();this.addRain();
    Diorama.lastStage='physical-world';
    this.pathVisuals=new FootpathRenderer(this.scene,terrainHeight);
    this.inventoryVisuals=new MaterialRenderer(this.scene,terrainHeight);
    this.buildingVisuals=new BuildingRenderer(this.scene,terrainHeight);
    Diorama.lastStage='citizens';
    this.people=[];this.pickables=[];
    for(const agent of sim.agents){const group=this.makePerson(agent);this.scene.add(group);this.people.push(group);}
    this.inventoryVisuals.bindCarriers(this.people);
    this.inventoryVisuals.sync(sim.material);
    this.shelterVisual=null;this.constructionVisual=null;this.built=0;this.timer=0;
    this.visitor=this.makeVisitor();
    this.inventoryVisuals.carriers.set('visitor',this.visitor.group);
    this.lastPropRefresh=0;
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();
    const canvas=this.renderer.domElement;let start={x:0,y:0};
    canvas.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};});
    canvas.addEventListener('pointerup',e=>{if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>7)return;this.pointer.set((e.offsetX/canvas.clientWidth)*2-1,-(e.offsetY/canvas.clientHeight)*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);const hit=this.raycaster.intersectObjects(this.pickables,false)[0];if(hit){this.chooseAgent(hit.object.userData.agentId);}});
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);this.resize();
    Diorama.lastStage='ready';
  }
  addDeposits(){
    // Resource nodes: trees are handled by the existing forest, but rocks and apples must
    // have a 3D object at their true simulated coordinates.
    const stone=this.mat('#777c7b'),moss=this.mat('#678c69');
    for(const p of this.sim.stones){
      const g=new THREE.Group();g.position.set(p.x,terrainHeight(p.x,p.z),p.z);
      for(let i=0;i<4;i++){
        const x=Math.sin(p.id*1.2+i)*.55,z=Math.cos(p.id*1.6+i)*.51;
        const rock=this.mesh(new THREE.DodecahedronGeometry(.52+i*.07,0),
          i%3===0?moss:stone,x,.27,z);
        rock.scale.y=.61;g.add(rock);
      }
      this.scene.add(g);
    }
    const bark=this.mat('#6f5643'),leaves=this.mat('#59864e');
    const fruit=this.mat('#c95d43',.55);
    for(const p of this.sim.apples){
      const g=new THREE.Group();g.position.set(p.x,terrainHeight(p.x,p.z),p.z);
      const trunk=this.mesh(new THREE.CylinderGeometry(.22,.32,2.1,7),bark,0,1.08,0);g.add(trunk);
      for(const [x,y,z] of [[-.58,2.37,0],[.65,2.55,.18],[0,3.05,-.3]]){
        const crown=this.mesh(new THREE.IcosahedronGeometry(1.05,1),leaves,x,y,z);
        crown.scale.y=.82;g.add(crown);
      }
      for(let i=0;i<7;i++){
        const angle=i*2.399;
        g.add(this.mesh(new THREE.SphereGeometry(.12,8,6),fruit,
          Math.cos(angle)*.8,2.0+(i%3)*.39,Math.sin(angle)*.72));
      }
      this.scene.add(g);
    }
  }
  addRain(){
    const count=280,coords=new Float32Array(count*6);this.rainCoords=coords;
    this.rainGeometry=new THREE.BufferGeometry();
    this.rainGeometry.setAttribute('position',new THREE.BufferAttribute(coords,3));
    for(let i=0;i<count;i++){
      const x=rand(-25,25),z=rand(-25,25),y=rand(1,18),idx=i*6;
      coords[idx]=x;coords[idx+1]=y;coords[idx+2]=z;
      coords[idx+3]=x-.17;coords[idx+4]=y-.64;coords[idx+5]=z;
    }
    this.rain=new THREE.LineSegments(this.rainGeometry,new THREE.LineBasicMaterial({color:'#d8eff0',transparent:true,opacity:.53,depthWrite:false}));
    this.rain.frustumCulled=false;this.rain.visible=false;this.scene.add(this.rain);
  }
  mat(color,roughness=1){return new THREE.MeshStandardMaterial({color,roughness});}
  mesh(geometry,material,x,y,z,cast=true){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=cast;m.receiveShadow=true;return m;}
  makeVisitor(){
    const group=new THREE.Group(),skin=this.mat('#e5c99f');
    const clothes=this.mat('#b6a68a'),cape=this.mat('#eee9ca');
    const body=this.mesh(new THREE.CylinderGeometry(.32,.41,.94,10),clothes,0,.93,0);
    const head=this.mesh(new THREE.SphereGeometry(.31,12,10),skin,0,1.66,0);
    const hood=this.mesh(new THREE.ConeGeometry(.4,.58,9),cape,0,2.07,-.06);
    const halo=this.mesh(new THREE.TorusGeometry(.55,.055,7,20),
      new THREE.MeshBasicMaterial({color:'#ffe4a1'}),0,2.52,0,false);
    halo.rotation.x=Math.PI/2;
    const legs=[];
    for(const sign of [-1,1]){
      const foot=this.mesh(new THREE.CylinderGeometry(.12,.13,.58,7),clothes,sign*.19,.32,0);
      legs.push(foot);group.add(foot);
    }
    group.add(body,head,hood,halo);
    const cargoAnchor=new THREE.Group();cargoAnchor.position.set(0,1.03,.47);
    group.add(cargoAnchor);group.userData.cargoAnchor=cargoAnchor;
    group.visible=false;this.scene.add(group);
    return {group,body,head,hood,halo,legs,clothes,cape};
  }
  updateVisitor(time){
    const avatar=this.sim.avatar,model=this.visitor;
    const mode=avatar.mode,active=mode!=='observer';
    this.controls.enabled=!active;
    model.group.visible=mode==='god'||mode==='poor';
    if(!active)return;
    const y=terrainHeight(avatar.x,avatar.z);
    model.group.position.set(avatar.x,y+.06,avatar.z);
    model.group.rotation.y=avatar.yaw;
    model.clothes.color.set(mode==='god'?'#f1e7c5':'#827260');
    model.cape.color.set(mode==='god'?'#f8edaa':'#776754');
    model.halo.visible=mode==='god';
    model.hood.visible=mode==='god';
    const moving=avatar.controls.forward||avatar.controls.back;
    for(let i=0;i<model.legs.length;i++){
      model.legs[i].rotation.x=moving?Math.sin(this.timer*9+i*Math.PI)*.32:0;
    }
    const cameraOffset=4.6;
    const cameraGoal=new THREE.Vector3(avatar.x-Math.sin(avatar.yaw)*cameraOffset,
      y+3.1,avatar.z-Math.cos(avatar.yaw)*cameraOffset);
    this.camera.position.lerp(cameraGoal,Math.min(.4,time*8+.04));
    this.camera.lookAt(avatar.x,y+1.25,avatar.z);
  }
  focusIsland(far){
    const x=far?86:0;
    this.camera.position.set(x+29,37,48);
    if(this.controls){this.controls.target.set(x,1.4,0);this.controls.update();}
  }
  resetCamera(){this.focusIsland(false);}
  addCamp(){
    // No raised, perfectly circular beige platform: terrain decals now form
    // irregular trampled soil directly on the real ground surface.
    const y=terrainHeight(0,0);
    const stonesMat=this.mat('#8e8876');
    for(let i=0;i<11;i++){const a=i*Math.PI*2/11;const rock=this.mesh(new THREE.DodecahedronGeometry(.38,0),stonesMat,Math.cos(a)*1.2,y+.25,Math.sin(a)*1.2);rock.scale.set(1,.6,.8);this.scene.add(rock);}
    const fire=this.mesh(new THREE.ConeGeometry(.33,.8,5),new THREE.MeshStandardMaterial({color:'#f6b755',emissive:'#f48c36',emissiveIntensity:2}),0,y+.58,0,false);this.scene.add(fire);this.fire=fire;
    const light=new THREE.PointLight('#ffb463',2.3,11);light.position.set(0,y+1.2,0);this.scene.add(light);this.campLight=light;
    for(const [x,z,r] of [[-2,1,.2],[1.9,-1.6,-.7]]){const log=this.mesh(new THREE.CylinderGeometry(.19,.19,2.1,7),this.mat('#866245'),x,y+.26,z);log.rotation.z=Math.PI/2;log.rotation.y=r;this.scene.add(log);}
  }
  addForest(){
    const trunk=this.mat('#806148'),darkBark=this.mat('#76604b');
    const pinePal=[this.mat('#397451'),this.mat('#4e8456'),this.mat('#659665'),this.mat('#397f72')];
    const leafPal=[this.mat('#78ad61'),this.mat('#609852'),this.mat('#9ab773'),this.mat('#5a9269')];
    for(const p of this.sim.trees){
      const y=terrainHeight(p.x,p.z),group=new THREE.Group();group.position.set(p.x,y,p.z);
      const scale=.73+rng(.05,.7);group.scale.setScalar(scale);
      const broadleaf=p.id%5===1||p.id%5===4;
      if(broadleaf){
        group.add(this.mesh(new THREE.CylinderGeometry(.22,.35,2.75,7),darkBark,0,1.35,0));
        const leaf=leafPal[p.id%leafPal.length];
        for(const [x,y,z,r] of [[0,3.5,0,1.65],[-.8,3.0,.3,1.18],[.87,3.12,-.13,1.12],[.2,4.27,.12,1.03]]){
          const ball=this.mesh(new THREE.IcosahedronGeometry(r,1),leaf,x,y,z);
          ball.scale.set(1,.8,1);group.add(ball);
        }
      }else{
        group.add(this.mesh(new THREE.CylinderGeometry(.17,.3,2.15,7),trunk,0,1.08,0));
        const leaf=pinePal[p.id%pinePal.length];
        for(const [y,r,h] of [[2.85,1.24,2.55],[3.93,1.03,2.45],[4.93,.75,1.85]]){
          group.add(this.mesh(new THREE.ConeGeometry(r,h,7),leaf,0,y,0));
        }
      }
      this.scene.add(group);this.treeModels.push({model:group,resource:p,scale});
    }
    // Accent trees with color variation; scattered lower branches make the woodland look less repetitive.
    const saplingTrunk=this.mat('#8a7055');
    for(const p of this.sim.saplings){
      const x=p.x,z=p.z,i=p.id;
      const g=new THREE.Group();g.position.set(x,terrainHeight(x,z),z);g.scale.setScalar(.44+rng()*.3);
      g.add(this.mesh(new THREE.CylinderGeometry(.13,.21,1.7,6),saplingTrunk,0,.9,0));
      g.add(this.mesh(new THREE.IcosahedronGeometry(1.18,1),leafPal[i%leafPal.length],0,2.3,0));
      this.scene.add(g);this.saplingModels.push({id:p.id,model:g});
    }
  }
  addBerries(){
    const mat=this.mat('#4f8a59'),fruit=this.mat('#c57e58'),stem=this.mat('#597b42');
    for(const p of this.sim.berries){
      const y=terrainHeight(p.x,p.z);const g=new THREE.Group();g.position.set(p.x,y,p.z);
      for(let i=0;i<3;i++){const ang=i*2.094;g.add(this.mesh(new THREE.SphereGeometry(.6,7,5),mat,Math.cos(ang)*.42,.64,Math.sin(ang)*.42));}
      for(let i=0;i<4;i++){const ang=i*1.57;g.add(this.mesh(new THREE.SphereGeometry(.13,6,5),fruit,Math.cos(ang)*.62,1.03,Math.sin(ang)*.58));}
      g.add(this.mesh(new THREE.CylinderGeometry(.07,.11,.75,5),stem,0,.37,0));
      this.scene.add(g);this.berryModels.push({id:p.id,model:g});
    }
  }
  addSprings(){
    const rock=this.mat('#81918d');
    const water=new THREE.MeshPhysicalMaterial({
      color:'#4faca3',roughness:.17,metalness:.05,transparent:true,
      opacity:.82,clearcoat:.8,clearcoatRoughness:.1
    });
    for(const source of this.sim.springs){
      const group=new THREE.Group();
      group.position.set(source.x,terrainHeight(source.x,source.z),source.z);
      const rim=new THREE.Mesh(new THREE.TorusGeometry(.76,.19,9,22),rock);
      rim.rotation.x=-Math.PI/2;rim.position.y=.10;
      rim.castShadow=true;rim.receiveShadow=true;group.add(rim);
      const pool=new THREE.Mesh(new THREE.CircleGeometry(.65,24),water.clone());
      pool.rotation.x=-Math.PI/2;pool.position.y=.07;pool.receiveShadow=true;group.add(pool);
      const wetEarth=new THREE.Mesh(new THREE.CircleGeometry(1.03,24),this.mat('#698176'));
      wetEarth.rotation.x=-Math.PI/2;wetEarth.position.y=.015;group.add(wetEarth);
      // Actual object opacity tracks stock; it cannot look full when depleted.
      pool.renderOrder=2;wetEarth.renderOrder=-1;this.scene.add(group);
      if(!this.springModels)this.springModels=[];
      this.springModels.push({source,pool});
    }
  }
  addRocksAndGrass(){
    // Ground composition: mixed stone shapes instead of identical angular pebbles.
    const stone=[this.mat('#a1a99e'),this.mat('#949e96'),this.mat('#c5c2ae'),this.mat('#abb1a2')];
    for(const p of this.sim.boulders){
      const r=p.r;
      const m=this.mesh(new THREE.DodecahedronGeometry(r/1.45,0),stone[p.id%stone.length],
        p.x,terrainHeight(p.x,p.z)+r*.42,p.z);
      m.scale.set(1.45,.73,1.07);m.rotation.y=p.id*2.399963229728;
      this.scene.add(m);this.boulderModels.push({id:p.id,model:m});
    }
    const dummy=new THREE.Object3D();
    // Dense but cheap grass tufts, distributed in clumps around the viewing area.
    const grasses=new THREE.InstancedMesh(new THREE.ConeGeometry(.14,.82,3),this.mat('#6f9f5e'),1750);
    for(let i=0;i<1750;i++){
      const r=3.5+Math.sqrt(rng())*36,a=rng()*Math.PI*2,x=Math.cos(a)*r,z=Math.sin(a)*r;
      dummy.position.set(x,terrainHeight(x,z)+.28,z);dummy.scale.set(.4+rng()*.85,.35+rng()*1.1,.4+rng()*.7);
      dummy.rotation.set(0,rng()*6.28,0);dummy.updateMatrix();grasses.setMatrixAt(i,dummy.matrix);
    }
    grasses.instanceMatrix.needsUpdate=true;grasses.frustumCulled=false;this.scene.add(grasses);

    // Four distinct colors of meadow wildflowers; stems and blooms are GPU instanced.
    const petals=['#f2e8bd','#e2b8d1','#b9cbef','#eed082'].map(c=>this.mat(c));
    const stems=new THREE.InstancedMesh(new THREE.CylinderGeometry(.025,.037,.47,4),this.mat('#57834b'),540);
    const blooms=petals.map(m=>new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.13,0),m,135));
    const flowerCounts=[0,0,0,0];
    for(let i=0;i<540;i++){
      const r=4.4+Math.sqrt(rng())*34,a=rng()*Math.PI*2,x=Math.cos(a)*r,z=Math.sin(a)*r;
      const ground=terrainHeight(x,z);const height=.65+rng()*.75;
      dummy.position.set(x,ground+.16*height,z);dummy.scale.set(.8,height,.8);
      dummy.rotation.set(0,rng()*6.28,.04*Math.sin(i));dummy.updateMatrix();stems.setMatrixAt(i,dummy.matrix);
      const color=i%4;const n=flowerCounts[color]++;
      dummy.position.set(x,ground+.31*height,z);dummy.scale.setScalar(.8+rng()*.45);
      dummy.rotation.set(0,rng()*6.28,0);dummy.updateMatrix();blooms[color].setMatrixAt(n,dummy.matrix);
    }
    stems.instanceMatrix.needsUpdate=true;stems.frustumCulled=false;this.scene.add(stems);
    for(const b of blooms){b.instanceMatrix.needsUpdate=true;b.frustumCulled=false;this.scene.add(b);}

    // Mixed bushes and ferns introduce a middle vegetation layer beneath trees.
    const shrubMaterials=[this.mat('#5f915c'),this.mat('#7aa36b'),this.mat('#4a8061'),this.mat('#8da45d')];
    const shrubs=shrubMaterials.map(mat=>new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.72,0),mat,70));
    const shrubCounts=[0,0,0,0];
    for(let i=0;i<280;i++){
      const r=6.1+Math.sqrt(rng())*35,a=rng()*Math.PI*2,x=Math.cos(a)*r,z=Math.sin(a)*r;
      const color=i%4,k=shrubCounts[color]++;
      dummy.position.set(x,terrainHeight(x,z)+.31,z);
      dummy.scale.set(.68+rng()*.55,.34+rng()*.32,.7+rng()*.6);
      dummy.rotation.set(0,rng()*6.28,0);dummy.updateMatrix();shrubs[color].setMatrixAt(k,dummy.matrix);
    }
    for(const b of shrubs){b.instanceMatrix.needsUpdate=true;this.scene.add(b);}

    // Reed belts give the shoreline a recognisable biome transition.
    const reed=new THREE.InstancedMesh(new THREE.CylinderGeometry(.025,.08,1,4),this.mat('#71946b'),260);
    const cattails=new THREE.InstancedMesh(new THREE.CylinderGeometry(.085,.085,.32,6),this.mat('#97704e'),80);
    let cat=0;
    for(let i=0;i<260;i++){
      const a=rng()*6.28,r=40+rng()*3,x=Math.cos(a)*r,z=Math.sin(a)*r;
      const y=terrainHeight(x,z);const height=.48+rng()*.95;
      dummy.position.set(x,y+height*.52,z);dummy.scale.set(.8,height,.8);dummy.rotation.set(0,rng()*6.28,0);
      dummy.updateMatrix();reed.setMatrixAt(i,dummy.matrix);
      if(i%4===0){dummy.position.set(x,y+height+.08,z);dummy.scale.setScalar(.7+rng()*.5);
        dummy.updateMatrix();cattails.setMatrixAt(cat++,dummy.matrix);}
    }
    reed.instanceMatrix.needsUpdate=true;cattails.instanceMatrix.needsUpdate=true;this.scene.add(reed,cattails);

    // Small woodland mushrooms and fallen branches.
    const stemsM=new THREE.InstancedMesh(new THREE.CylinderGeometry(.055,.072,.29,5),this.mat('#ded0af'),70);
    const capsM=new THREE.InstancedMesh(new THREE.ConeGeometry(.24,.22,7),this.mat('#b67755'),70);
    for(let i=0;i<70;i++){
      const t=this.sim.trees[i%this.sim.trees.length],a=rng()*6.28,r=1.1+rng()*2.5;
      const x=t.x+Math.cos(a)*r,z=t.z+Math.sin(a)*r,y=terrainHeight(x,z);
      dummy.position.set(x,y+.18,z);dummy.scale.setScalar(.7+rng()*.5);dummy.rotation.set(0,rng()*6.28,0);
      dummy.updateMatrix();stemsM.setMatrixAt(i,dummy.matrix);
      dummy.position.y+=.17;dummy.updateMatrix();capsM.setMatrixAt(i,dummy.matrix);
    }
    stemsM.instanceMatrix.needsUpdate=true;capsM.instanceMatrix.needsUpdate=true;this.scene.add(stemsM,capsM);
    const wood=this.mat('#8b6c4f');
    for(const p of this.sim.fallenLogs){
      const x=p.x,z=p.z;
      const fallen=this.mesh(new THREE.CylinderGeometry(.13,.18,1.3+(p.id%5)*.12,6),
        wood,x,terrainHeight(x,z)+.18,z);
      fallen.rotation.z=Math.PI/2;fallen.rotation.y=p.yaw;
      this.scene.add(fallen);this.fallenLogModels.push({id:p.id,model:fallen});
    }
    // Butterflies float around wildflowers. Pure presentation, no simulated agents.
    this.butterflies=[];
    const wingMaterials=['#f4e3a9','#d5b3e7','#eec3a2','#d7e9f4'].map(c=>new THREE.MeshBasicMaterial({color:c,side:THREE.DoubleSide}));
    for(let i=0;i<12;i++){
      const a=rng()*Math.PI*2,r=6+rng()*25,x=Math.cos(a)*r,z=Math.sin(a)*r;
      const b=new THREE.Group();b.position.set(x,terrainHeight(x,z)+1.15,z);
      const wingGeo=new THREE.SphereGeometry(.2,7,5);
      for(const sign of [-1,1]){const w=this.mesh(wingGeo,wingMaterials[i%4],sign*.2,0,0,false);w.scale.set(.85,.09,1.6);b.add(w);}
      this.scene.add(b);this.butterflies.push({group:b,x,z,phase:rng()*6.28});
    }
    const cloudMat=new THREE.MeshStandardMaterial({color:'#f4fcf3',transparent:true,opacity:.55,roughness:1,depthWrite:false});
    for(let i=0;i<6;i++){
      const cloud=new THREE.Group();cloud.position.set((i-3)*19,19+rng()*6,-21+(rng()-.5)*30);
      for(let j=0;j<4;j++){const ball=this.mesh(new THREE.SphereGeometry(2+rng()*1.3,9,7),cloudMat,(j-1.5)*2.6,(rng()-.5),rng()*2-1,false);ball.scale.y=.5;cloud.add(ball);}
      this.scene.add(cloud);
    }
  }
  makePerson(a){
    const g=new THREE.Group(),skin=this.mat('#e9c49f'),shirt=this.mat(a.color),pants=this.mat('#445d53'),hair=this.mat(a.id%2?'#584239':'#88664d');
    g.userData.legs=[];g.userData.arms=[];
    const torso=this.mesh(new THREE.CylinderGeometry(.32,.39,.77,10),shirt,0,.95,0);g.add(torso);
    const head=this.mesh(new THREE.SphereGeometry(.32,12,10),skin,0,1.61,0);g.add(head);
    const cap=this.mesh(new THREE.SphereGeometry(.32,10,8),hair,0,1.78,-.025);cap.scale.set(1,.48,1);g.add(cap);
    g.userData.head=head;g.userData.hair=cap;g.userData.torso=torso;
    for(const sign of [-1,1]){
      const leg=this.mesh(new THREE.CylinderGeometry(.12,.13,.5,7),pants,sign*.19,.38,0);
      const arm=this.mesh(new THREE.CylinderGeometry(.11,.11,.57,7),shirt,sign*.44,1.03,0);
      g.add(leg,arm);g.userData.legs.push(leg);g.userData.arms.push(arm);
    }
    // A real rig attachment inherits character motion and orientation.
    // Every carried item will become a child of this anchor (not a floating
    // world-space mesh adjusted every ~350ms).
    const cargoAnchor=new THREE.Group();
    cargoAnchor.position.set(0,1.03,.46);g.add(cargoAnchor);
    g.userData.cargoAnchor=cargoAnchor;
    // A shallow cloth sling is VISIBLY under hand-carried food. Its material
    // is wearable clothing, not a free craftable/teleported storage basket.
    const support=new THREE.Group();
    support.position.set(0,-.18,.14);
    const cloth=this.mat('#b29c7a');
    const sling=new THREE.Mesh(new THREE.CylinderGeometry(.39,.27,.28,14,1,true),cloth);
    sling.position.y=-.04;sling.castShadow=true;support.add(sling);
    const base=this.mesh(new THREE.CylinderGeometry(.275,.275,.035,14),
      this.mat('#887456'),0,-.195,0,false);
    support.add(base);
    const rim=this.mesh(new THREE.TorusGeometry(.39,.04,7,16),
      this.mat('#c5ad86'),0,.105,0,false);
    rim.rotation.x=Math.PI/2;support.add(rim);
    cargoAnchor.add(support);
    support.visible=false;g.userData.cargoSupport=support;
    g.userData.carryClass='empty';
    const halo=this.mesh(new THREE.RingGeometry(.55,.67,28),new THREE.MeshBasicMaterial({color:'#e8ffd1',side:THREE.DoubleSide,transparent:true,opacity:.85}),0,.11,0,false);
    halo.rotation.x=-Math.PI/2;halo.visible=false;g.add(halo);g.userData.halo=halo;
    const bubbleCanvas=document.createElement('canvas');bubbleCanvas.width=128;bubbleCanvas.height=64;
    const ctx=bubbleCanvas.getContext('2d');
    ctx.fillStyle='rgba(28,58,46,.87)';ctx.beginPath();ctx.roundRect(6,8,116,44,18);ctx.fill();
    ctx.fillStyle='#f1ffe5';ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText('···',64,38);
    const bubble=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(bubbleCanvas),transparent:true,depthWrite:false}));
    bubble.position.set(0,2.7,0);bubble.scale.set(1.65,.82,1);bubble.visible=false;g.add(bubble);g.userData.bubble=bubble;
    for(const m of g.children)if(m.isMesh){m.userData.agentId=a.id;this.pickables.push(m);}
    g.position.set(a.x,terrainHeight(a.x,a.z)+.1,a.z);return g;
  }
  addShelter(x,z,progress=1){
    const g=new THREE.Group();g.position.set(x,terrainHeight(x,z),z);
    const floor=this.mesh(new THREE.BoxGeometry(4.1,.28,3.8),this.mat('#b99b70'),0,.16,0);g.add(floor);
    const walls=this.mesh(new THREE.BoxGeometry(3.55,2.4,3.3),this.mat('#d9c69d'),0,1.48,0);walls.scale.y=clamp(progress*1.4,0,1);walls.position.y=.3+walls.scale.y*1.2;g.add(walls);
    const roof=this.mesh(new THREE.ConeGeometry(2.95,1.9,4),this.mat('#845b45'),0,3.41,0);roof.rotation.y=Math.PI/4;roof.visible=progress>.62;g.add(roof);
    const door=this.mesh(new THREE.BoxGeometry(.8,1.5,.09),this.mat('#785743'),0,1.18,1.69);door.visible=progress>.75;g.add(door);
    const windowMat=new THREE.MeshStandardMaterial({color:'#f6d89a',emissive:'#e6bc72',emissiveIntensity:.15});
    for(const side of [-1,1]){const w=this.mesh(new THREE.BoxGeometry(.51,.55,.09),windowMat,side*1.04,1.61,1.69);w.visible=progress>.75;g.add(w);}
    const chimney=this.mesh(new THREE.BoxGeometry(.47,1.25,.5),this.mat('#a07d65'),1.05,3.31,-.35);chimney.visible=progress>.8;g.add(chimney);
    this.scene.add(g);return{group:g,walls,roof,door,chimney};
  }
  update(time){
    this.timer+=time;
    const phase=(this.sim.seconds%75)/75;
    const daylight=phase<.12?(.42+.58*phase/.12):phase<.67?1:phase<.89?(1-.58*(phase-.67)/.22):.42;
    const raining=this.sim.weather.kind==='rain';
    const dry=this.sim.weather.kind==='drought';
    const lightFactor=daylight*(raining?.65:dry?1.15:1);
    this.sun.intensity=3.5*lightFactor;
    this.ambient.intensity=1.0+1.35*lightFactor;
    this.sun.position.set(Math.cos(phase*Math.PI*2)*35,13+daylight*35,Math.sin(phase*Math.PI*2)*35);
    this.renderer.toneMappingExposure=.97+daylight*.46;
    this.scene.background.copy(this.nightSky).lerp(raining?this.rainSky:this.clearSky,clamp(lightFactor,0,1));
    this.scene.fog.color.copy(this.scene.background);
    this.rain.visible=raining;
    if(raining){
      const attr=this.rainGeometry.attributes.position,coords=this.rainCoords;
      for(let i=0;i<coords.length;i+=6){
        let y=coords[i+1]-time*19;
        if(y<terrainHeight(coords[i],coords[i+2])+.3)y=17+Math.random()*4;
        coords[i+1]=y;coords[i+4]=y-.64;
      }
      attr.needsUpdate=true;
    }
    this.fire.scale.y=.8+Math.sin(this.timer*9)*.2;this.campLight.intensity=1.4+(1-daylight)*3+Math.sin(this.timer*7)*.3;
    this.water.position.y=-.58+Math.sin(this.timer*.45)*.015;
    for(const entry of this.springModels||[])entry.pool.material.opacity=.20+.62*(entry.source.stock/entry.source.maxStock);
    for(const b of this.butterflies){
      const t=this.timer+b.phase;
      b.group.position.set(b.x+Math.sin(t*.9)*.85,terrainHeight(b.x,b.z)+1.1+Math.sin(t*2.2)*.34,b.z+Math.cos(t*.75)*.8);
      b.group.children[0].rotation.y=Math.sin(t*16)*.65;
      b.group.children[1].rotation.y=-Math.sin(t*16)*.65;
      b.group.rotation.y=t*.3;
    }
    // People are indexed by immutable citizen ID; births add meshes but never
    // recycle the model of a deceased founder.
    for(const a of this.sim.agents){
      if(!this.people[a.id]){
        const model=this.makePerson(a);
        model.scale.setScalar(isDependent(a)?.62:1);
        this.people[a.id]=model;this.scene.add(model);
        this.inventoryVisuals.carriers.set(a.id,model);
      }
    }
    this.sim.agents.forEach((a,i)=>{
      const g=this.people[i];g.visible=isLiving(a);
      g.scale.setScalar(isDependent(a)?.62:1);
      if(!isLiving(a))return;
      g.position.set(a.x,(a.mode==='voyage'?this.water.position.y+.32:terrainHeight(a.x,a.z)+.04)+
        (a.mode==='walk'?Math.sin(this.timer*9+i)*.055:0),a.z);
      if(a.mode==='walk' && a.target){const target=a.waypoints?.[0]||a.target;
        const dx=target.x-a.x,dz=target.z-a.z;
        if(Math.hypot(dx,dz)>.08)g.rotation.y=Math.atan2(dx,dz);}
      const walking=a.mode==='walk',working=a.mode==='work';
      const stride=walking?Math.sin(this.timer*8+i*1.3)*.47:0;
      const loadMode=g.userData.carryClass;
      for(let j=0;j<2;j++){
        g.userData.legs[j].rotation.x=(j===0?1:-1)*stride;
        if(loadMode==='shoulder'){
          g.userData.arms[j].rotation.x=j===0?-.60:-.34;
          g.userData.arms[j].rotation.z=j===0?.34:-.27;
        }else if(loadMode==='heavy'||loadMode==='hands'){
          g.userData.arms[j].rotation.x=-.80;
          g.userData.arms[j].rotation.z=j===0?.27:-.27;
        }else{
          g.userData.arms[j].rotation.x=walking?(j===0?-1:1)*stride*.7:
            working?Math.sin(this.timer*5+i+j*1.8)*.24:0;
          g.userData.arms[j].rotation.z=0;
        }
      }
      g.userData.torso.rotation.z=walking?Math.sin(this.timer*8+i)*.035:a.purpose==='resting'?.10:0;
      g.userData.head.rotation.y=a.purpose==='talking'?Math.sin(this.timer*2+i)*.25:Math.sin(this.timer*.8+i)*.07;
      g.userData.hair.rotation.y=g.userData.head.rotation.y;
      g.userData.bubble.visible=a.purpose==='talking';
      g.userData.halo.visible=i===this.getSelectedAgent();
      const carrying=g.userData.carryClass!=='empty';
      g.userData.cargoAnchor.rotation.x=carrying?Math.sin(this.timer*8+i)*.015:0;
    });
    this.lastPropRefresh+=time;
    if(this.lastPropRefresh>.35){
      this.lastPropRefresh=0;
      for(const [models,data] of [
        [this.boulderModels,this.sim.boulders],[this.berryModels,this.sim.berries],
        [this.saplingModels,this.sim.saplings],[this.fallenLogModels,this.sim.fallenLogs]]){
        const alive=new Set(data.map(o=>o.id));
        for(const entry of models)entry.model.visible=alive.has(entry.id);
      }
    }
    for(const tree of this.treeModels){
      if(tree.resource.stock<=0&&tree.model.scale.y>.32)tree.model.scale.y=.32;
      tree.model.rotation.z=Math.sin(this.timer*.72+tree.resource.id*1.9)*.012;
      tree.model.rotation.x=Math.cos(this.timer*.61+tree.resource.id*.79)*.008;
    }
    this.pathVisuals.update(this.sim.paths,this.sim.seconds);
    this.inventoryRefresh=(this.inventoryRefresh||0)+time;
    if(this.inventoryRefresh>.35){
      this.inventoryRefresh=0;
      this.inventoryVisuals.sync(this.sim.material);
      this.buildingVisuals.sync(this.sim.material,this.sim.construction);
    }
    const actualHeat=this.sim.material.fire.heat;
    const lit=actualHeat>0;
    this.fire.visible=lit;
    this.campLight.intensity=lit?(1.4+(1-daylight)*3)*actualHeat/100:0;
    this.fire.scale.y=lit?(.3+actualHeat/130)*(1+Math.sin(this.timer*9)*.14):.01;
    this.updateVisitor(time);
    if(this.sim.avatar.mode==='observer')this.controls.update();
    this.syncSeaLife();
    this.renderer.render(this.scene,this.camera);
  }
  syncSeaLife(){
    if(!this.seaVessels)this.seaVessels=new Map();
    if(!this.seaPredators)this.seaPredators=new Map();
    for(const vessel of this.sim.islands?.vessels||[]){
      let m=this.seaVessels.get(vessel.id);
      if(!m){
        const boat=vessel.type==='boat';
        const base=new THREE.Mesh(new THREE.BoxGeometry(boat?4.4:2.9,.34,boat?1.7:2.1),
          new THREE.MeshStandardMaterial({color:boat?'#785137':'#947050',roughness:.87}));
        if(boat){
          const keel=new THREE.Mesh(new THREE.CylinderGeometry(.61,.31,4.55,10),
            new THREE.MeshStandardMaterial({color:'#65472f',roughness:.84}));
          keel.rotation.z=Math.PI/2;keel.position.y=-.22;base.add(keel);
        }else{
          for(let i=-1;i<=1;i++){
            const log=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,3.2,8),
              new THREE.MeshStandardMaterial({color:'#806342',roughness:.94}));
            log.rotation.z=Math.PI/2;log.position.z=i*.63;base.add(log);
          }
        }
        m=base;this.scene.add(m);this.seaVessels.set(vessel.id,m);
      }
      m.position.set(vessel.x,this.water.position.y+.17,vessel.z);
    }
    for(const beast of this.sim.islands?.predators||[]){
      let m=this.seaPredators.get(beast.id);
      if(!m){
        m=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),
          new THREE.MeshStandardMaterial({color:'#426c65',roughness:.7}));
        m.scale.set(1.8,.45,.7);
        this.scene.add(m);this.seaPredators.set(beast.id,m);
      }
      m.position.set(beast.x,this.water.position.y-.18+Math.sin(this.timer*2+beast.id)*.06,beast.z);
      m.rotation.y=Math.sin(this.timer*.5+beast.id)*.25;
    }
  }
  resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);}
}
async function launchMicroWorld(){
let selectedAgent=0;
const sim=new Civilization();
const thirtyScenario=new URLSearchParams(location.search).get('scenario')==='30';
const activeSaveKey=thirtyScenario?WORLD_SAVE_KEY+'-30':WORLD_SAVE_KEY;
if(thirtyScenario){
  const result=populateFounders(sim,30);
  sim.addEvent('Dlouhodobý experiment',result.living+
    ' zakladatelů začíná s nezávislými potřebami a rozhodováním.','⌛');
}
let world;
let remoteWorldMode=false,remoteWorldError=null;
let initialSaveStatus=thirtyScenario?'Scénář 30 obyvatel':'Nový svět';
try{
  const rawSave=window.localStorage.getItem(activeSaveKey);
  if(rawSave){
    const restored=restoreWorld(sim,rawSave);
    initialSaveStatus='Načtený svět · den '+restored.day;
  }
 }catch(error){
  initialSaveStatus='Uložený svět nelze načíst; nový svět byl vytvořen';
  console.error('MicroWorld save restore failed',error);
}
// If a private VPS snapshot endpoint exists, it replaces the local scene.
// A failed connection to a previously established server never starts a
// competing local civilization: that would fabricate history for this URL.
async function refreshServerWorld(){
  const response=await fetch('/api/world',{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Server HTTP '+response.status);
  const snapshot=await response.text();
  const oldSeconds=remoteWorldMode?sim.seconds:-1;
  const state=hydrateWorldMirror(sim,snapshot);
  if(oldSeconds>=0&&state.seconds<oldSeconds)throw new Error('World clock went backwards');
  remoteWorldMode=true;remoteWorldError=null;
  if(el('save-status'))el('save-status').textContent='Automatické ukládání na VPS · den '+state.day;
  return state;
}
try{
  await refreshServerWorld();
  initialSaveStatus='Automatické ukládání na VPS · den '+sim.day;
}catch(error){
  // Public/browser-only builds intentionally have no /api/world endpoint.
  // Private preview has it; if it becomes unreachable later the viewer freezes.
  console.info('No live VPS world endpoint; using isolated local simulation',error.message);
}
if(window.matchMedia('(max-width:720px)').matches){
  // Preserve the 3D map as the main screen. Inspectors open only on request.
  el('map-agent-peek')?.removeAttribute('open');
  el('visitor-panel')?.removeAttribute('open');
}
if(remoteWorldMode){
  document.body.classList.add('remote-world');
  const notice=el('notice');
  if(notice){notice.classList.add('quiet');notice.setAttribute('aria-hidden','true');}
  const godTitle=document.querySelector('.god-flyout summary');
  if(godTitle)godTitle.textContent='✦ Boží zásahy · jen náhled';
  if(el('visitor-summary-mode'))el('visitor-summary-mode').textContent='Pouze pozorování';
  for(const id of ['btn-save-world','btn-pause','btn-speed','btn-new-world',
    'visitor-mode','btn-live-weather','nature','cooperation'])
    if(el(id))el(id).disabled=true;
  for(const button of document.querySelectorAll('[data-god]'))button.disabled=true;
  for(const button of document.querySelectorAll('[data-visitor-move]'))button.disabled=true;
  const tagline=document.querySelector('.top-center');
  if(tagline)tagline.textContent='ŽIVÝ SVĚT NA VPS · POUZE POZOROVÁNÍ';
  window.setInterval(async()=>{
    try{await refreshServerWorld();}
    catch(error){
      remoteWorldError=error.message;
      if(el('save-status'))el('save-status').textContent='Server nedostupný · zobrazuji poslední potvrzený stav';
      console.warn('VPS world update failed',error);
    }
  },5000);
}


// Two real navigable page routes; transitions preserve the running simulation and WebGL instance.
function pageFromLocation(){
  return location.pathname.startsWith('/lide')?'people':
    location.pathname.startsWith('/prehled')?'overview':'map';
}
function showPage(page,push=false){
  const path=page==='overview'?'/prehled/':page==='people'?'/lide/':'/svet/';
  if(push)history.pushState({page},'',path);
  document.body.classList.toggle('page-map',page==='map');
  document.body.classList.toggle('page-overview',page==='overview');
  document.body.classList.toggle('page-people',page==='people');
  for(const link of document.querySelectorAll('[data-page]')){
    if(link.dataset.page===page)link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  }
  if(page==='map')requestAnimationFrame(()=>world?.resize());
}
for(const link of document.querySelectorAll('[data-page]')){
  link.addEventListener('click',event=>{
    if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();showPage(link.dataset.page,true);
  });
}
window.addEventListener('popstate',()=>showPage(pageFromLocation()));
if(location.pathname==='/')history.replaceState({page:'map'},'','/svet/');
showPage(pageFromLocation());
function announce(message){const n=el('notice');n.textContent=message;n.classList.remove('quiet');clearTimeout(announce.timeout);announce.timeout=setTimeout(()=>n.classList.add('quiet'),6500);}
const list=el('event-list');
function events(){
  list.replaceChildren();
  for(const m of sim.messages.slice(0,6)){
    const row=document.createElement('div');row.className='event-item';
    const icon=document.createElement('div');icon.className='event-bullet';icon.textContent=m.icon;
    const body=document.createElement('div'),title=document.createElement('strong'),p=document.createElement('p');
    title.textContent=m.title;p.textContent=m.detail;body.append(title,p);row.append(icon,body);list.append(row);
  }
}
sim.listeners.push(m=>{events();if(m.title.includes('stavba')||m.title.includes('přístřešek'))announce(m.detail);});
function chooseAgent(index){selectedAgent=index;renderUI();}
function drawPersonalKnowledgeMap(knowledge, person){
  const canvas=el('knowledge-map');
  if(!canvas || !document.body.classList.contains('page-overview'))return;
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  const w=canvas.width,h=canvas.height;
  const scale=Math.min((w-28)/74,(h-24)/74);
  const centerX=person.x>58?86:0;
  const xToScreen=x=>w/2+(x-centerX)*scale, zToScreen=z=>h/2+z*scale;
  ctx.clearRect(0,0,w,h);
  const background=ctx.createLinearGradient(0,0,w,h);
  background.addColorStop(0,'#172820');background.addColorStop(1,'#101d1b');
  ctx.fillStyle=background;ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='rgba(113,151,124,.10)';ctx.lineWidth=1;
  for(let coord=-35;coord<=35;coord+=5){
    const x=xToScreen(coord),z=zToScreen(coord);
    ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,z);ctx.lineTo(w,z);ctx.stroke();
  }
  // Revealed areas come ONLY from this citizen's visited cells.
  for(const p of knowledge.visited){
    const x=xToScreen(p.x),z=zToScreen(p.z);
    const glow=ctx.createRadialGradient(x,z,1,x,z,7.1*scale);
    glow.addColorStop(0,'rgba(111,158,102,.38)');
    glow.addColorStop(.55,'rgba(107,155,108,.19)');
    glow.addColorStop(1,'rgba(107,155,108,0)');
    ctx.fillStyle=glow;ctx.fillRect(x-8*scale,z-8*scale,16*scale,16*scale);
  }
  ctx.beginPath();ctx.arc(xToScreen(0),zToScreen(0),4,0,Math.PI*2);
  ctx.fillStyle='#e8c88c';ctx.fill();
  ctx.fillStyle='#e8c88c';ctx.font='11px sans-serif';ctx.fillText(centerX?'Druhý ostrov':'Tábor',xToScreen(centerX)+9,zToScreen(0)-7);
  for(const r of knowledge.resources){
    const x=xToScreen(r.x),z=zToScreen(r.z);
    if(x<4||x>w-4||z<4||z>h-4)continue;
    const fromOthers=r.origin==='heard';
    ctx.beginPath();ctx.arc(x,z,r.type==='tree'?3.5:4.2,0,Math.PI*2);
    ctx.fillStyle=fromOthers?'#eebd6a':r.type==='tree'?'#9cd584':'#77d1b9';
    ctx.fill();
    if(fromOthers){ctx.strokeStyle='#fbdfac';ctx.lineWidth=1.1;ctx.stroke();}
  }
  const px=xToScreen(person.x),pz=zToScreen(person.z);
  ctx.beginPath();ctx.arc(px,pz,9,0,Math.PI*2);
  ctx.strokeStyle='rgba(244,251,235,.72)';ctx.lineWidth=1.4;ctx.stroke();
  ctx.beginPath();ctx.arc(px,pz,4.6,0,Math.PI*2);
  ctx.fillStyle='#ffffff';ctx.fill();
  ctx.fillStyle='rgba(230,242,221,.65)';
  ctx.font='10px sans-serif';ctx.fillText('Jen '+person.name+'ovy znalosti',12,h-12);
}


const materialNames={wood:'Dřevo',twig:'Proutí',stone:'Kámen',berry:'Bobule',
  apple:'Jablka',seed:'Semínka',grain:'Obilí'};
function renderMaterialLedger(){
  const warehouse=sim.material;
  const stats=warehouse.snapshot();
  el('ledger-items').textContent=stats.total+' předmětů';
  el('building-number').textContent=stats.buildings;
  el('basket-number').textContent=stats.baskets;
  el('field-number').textContent=stats.fields.length;
  const socialStats=sim.social.summary(sim.agents);
  if(el('community-tension'))el('community-tension').textContent=socialStats.averageTension+' %';
  if(el('community-camps'))el('community-camps').textContent=socialStats.camps;
  if(el('community-away'))el('community-away').textContent=socialStats.away;
  if(el('carried-number'))el('carried-number').textContent=stats.carried;
  if(el('site-number'))el('site-number').textContent=stats.atSite;
  if(el('trail-number'))el('trail-number').textContent=sim.paths.summary().trails;
  if(el('logistics-number'))el('logistics-number').textContent=stats.logistics.delivered+stats.logistics.constructionDeliveries;
  const cells=el('material-grid');cells.replaceChildren();
  for(const [type,count] of Object.entries(stats.byType)){
    const item=document.createElement('div');item.className='material-cell';
    const ico=document.createElement('span');ico.className='material-icon';
    ico.textContent=ITEM_INFO[type]?.icon||'•';
    const value=document.createElement('strong');value.textContent=count;
    const name=document.createElement('span');name.textContent=materialNames[type]||type;
    item.append(ico,value,name);cells.appendChild(item);
  }
  const fire=stats.fire;
  el('fire-status').textContent=fire.lastWood?
    'Poslední poleno: '+Math.round(fire.lastWood.wet*100)+' % vlhkost → '+fire.lastWood.heat+' % tepla'+
    (fire.lastWood.roof?' (uchované pod střechou)':' (venkovní zásoby)'):
    'Zatím nebylo spáleno žádné poleno';
  const list=el('building-list');list.replaceChildren();
  if(!sim.material.structures.length){list.textContent='Obyvatelé teprve sbírají materiál pro první stavbu.';}
  else for(const b of sim.material.structures){
    const chip=document.createElement('span');chip.className='building-chip';
    chip.textContent=RECIPES[b.type]?.name||b.type;
    list.appendChild(chip);
  }
  if(sim.construction){
    const chip=document.createElement('span');chip.className='building-chip';
    chip.textContent='Staví se: '+RECIPES[sim.construction.type]?.name+
      ' ('+Math.round(sim.construction.progress*100)+' %)';
    list.appendChild(chip);
  }
}

function renderLifePage(){
  if(!document.body.classList.contains('page-people'))return;
  const list=el('citizen-list');
  if(list.children.length!==sim.agents.length){
    list.replaceChildren();
    list.dataset.ready='yes';
    for(const person of sim.agents){
      const button=document.createElement('button');button.type='button';
      button.className='citizen-option';button.dataset.person=person.id;
      const icon=document.createElement('span');icon.className='avatar';icon.textContent=person.name[0];
      const caption=document.createElement('span');caption.className='citizen-option-label';
      const name=document.createElement('strong');name.textContent=person.profile.fullName;
      const role=document.createElement('small');role.textContent=!isLiving(person)?'Zemřel · záznam zachován':isDependent(person)?'Dítě · potřebuje péči':person.profile.origin;
      caption.append(name,role);button.append(icon,caption);
      button.addEventListener('click',()=>{chooseAgent(person.id);renderLifePage();});
      list.append(button);
    }
  }
  el('people-day').textContent='Rok '+calendarAt(sim.day).year+' · Den '+sim.day;
  for(const button of list.children){
    button.setAttribute('aria-pressed',Number(button.dataset.person)===selectedAgent?'true':'false');
  }
  const a=sim.agents[selectedAgent],card=makeLifeCard(a,sim);
  if(!card)return;
  el('life-fullname').textContent=card.fullName;
  el('life-age').textContent=card.age+' let';
  el('life-origin').textContent=card.origin;
  el('life-description').textContent=card.description;
  el('life-settlement').textContent=card.colony;
  el('life-home').textContent=card.home;
  el('life-role').textContent=card.role;
  const taskNames={wood:'Hledá dřevo',harvest:'Sbírá dřevo',berries:'Hledá bobule',
    stone:'Těží kámen',mining:'Těží kámen',apples:'Sklízí jablka',
    applepicking:'Sbírá jablka',weaving:'Plete košík',plant:'Vysévá pole',
    planting:'Sází osivo',reap:'Sklízí úrodu',reaping:'Sklízí obilí',
    build:'Staví budovu',building:'Stavba',
    surveySite:'Zaměřuje pozemek',surveying:'Provádí průzkum pozemku',
    clearSite:'Jde čistit staveniště',clearing:'Odstraňuje kameny a keře',
    gradeSite:'Jde srovnat terén',grading:'Rovná stavební plochu',
    pickupBuild:'Nabírá stavební materiál',deliverBuild:'Nese materiál na stavbu',
    pickupStore:'Přebírá zásoby',deliverStore:'Stěhuje zásoby do skladiště',
    pickupDropped:'Zvedá odložené předměty',deliverDropped:'Nese nalezené zásoby',
    assistBuild:'Jde pomoci staviteli',assisting:'Pomáhá stavět',explore:'Průzkum',
    eat:'Jde jíst',eating:'Jí',talking:'Rozhovor',rest:'Odpočinek',
    resting:'Spí',meet:'Setkání',departWood:'Nese dřevo',departFood:'Bere jídlo',departCamp:'Odchází do samoty',campWander:'Žije v táboře',campLiving:'Odpočívá stranou',returnHome:'Vrací se domů',tentEat:'Jí ve stanu'};
  el('life-task').textContent=taskNames[card.action]||card.action||'Rozhoduje se';
  el('life-mood').textContent=card.mood+' %';
  el('life-knowledge').textContent=card.knowledge;
  el('life-tension').textContent=card.frustration+' %';
  const socialLabels={resident:'Žije v osadě',preparing:'Připravuje se na odchod',
    travelling:'Stěhuje se',camping:'Žije v samostatném stanu',returning:'Vrací se domů'};
  el('life-community-status').textContent=socialLabels[card.socialStatus]||card.socialStatus;
  el('life-biography').textContent=card.biography;
  const skills=el('life-skills'),relations=el('life-relations'),timeline=el('life-timeline');
  skills.replaceChildren();relations.replaceChildren();timeline.replaceChildren();
  for(const skill of card.skills){
    const row=document.createElement('div');row.className='life-line';
    const name=document.createElement('span');name.textContent=skill.name;
    const value=document.createElement('strong');value.textContent=skill.level+' / 100';
    row.append(name,value);skills.appendChild(row);
  }
  for(const rel of card.relationships.slice(0,6)){
    const row=document.createElement('div');row.className='life-line';
    const name=document.createElement('span');name.textContent=rel.name;
    const score=document.createElement('strong');score.textContent=rel.trust+' / 100';
    row.append(name,score);relations.appendChild(row);
  }
  for(const event of card.timeline.slice(0,15)){
    const row=document.createElement('div');row.className='life-timeline-entry';
    const heading=document.createElement('strong');heading.textContent='Den '+event.day+' · '+event.event;
    const body=document.createElement('small');body.textContent=event.detail;
    row.append(heading,body);timeline.appendChild(row);
  }
}
function renderUI(){
  el('people').textContent=livingSummary(sim.agents).living;el('wood').textContent=sim.wood;el('food').textContent=sim.food;
  el('m-people').textContent=livingSummary(sim.agents).living;el('m-wood').textContent=sim.wood;el('m-food').textContent=sim.food;
  el('day').textContent='Rok '+calendarAt(sim.day).year+' · Den '+sim.day;
  if(document.body.classList.contains('page-map')){
    if(el('map-trails'))el('map-trails').textContent=sim.paths.summary().trails;
    if(el('map-hauls'))el('map-hauls').textContent=sim.material.logistics.constructionDeliveries;
    if(el('map-carrying'))el('map-carrying').textContent=sim.material.countCarried();
    if(el('map-crossings'))el('map-crossings').textContent=sim.islands.crossings;
    if(el('map-vessels'))el('map-vessels').textContent=sim.islands.vessels.length;
    if(el('visitor-status'))el('visitor-status').textContent=
      (remoteWorldMode?'Pouze pozorování · data ze serveru':
       PLAYER_LABELS[sim.avatar.mode]+' · dary '+(sim.avatar.gifts||0)+
       ' · šipky / WASD / dotyk');
    if(!remoteWorldMode&&el('visitor-summary-mode'))
      el('visitor-summary-mode').textContent=PLAYER_LABELS[sim.avatar.mode];
  }
  if(document.body.classList.contains('page-overview'))renderMaterialLedger();
  renderLifePage();
  const building=!!sim.construction,done=sim.material.structures.length>0;
  el('stage-tag').textContent=done?'PRVNÍ DOMOV':building?'VÝSTAVBA':'PRŮZKUM';
  el('stage-title').textContent=building?RECIPES[sim.construction.type].name+' — '+
    (CONSTRUCTION_LABELS[sim.construction.phase]||'Výstavba'):
    done?'Osada roste vlastními silami':'Hledání místa k životu';
  el('stage-description').textContent=building?'Každá fáze stavby vyžaduje fyzickou práci: zaměření, odstranění kamenů a keřů, srovnání plochy, materiál, základy, hrubou stavbu s lešením a dokončení.':
    done?'Obyvatelé sami rozšiřují osadu. Zásoby, materiály a budovy jsou fyzicky evidované.':
    'Obyvatelé hledají dřevo, kámen, jídlo, semena a další materiály.';
  el('progress-name').textContent=building?(CONSTRUCTION_LABELS[sim.construction.phase]||'Postup stavby'):
    done?'Hotové budovy':'Materiál na první dům';
  el('progress-number').textContent=building?Math.round(sim.construction.progress*100)+' %':
    done?sim.material.structures.length+' objektů':Math.min(sim.wood,12)+' / 12';
  el('build-progress').style.width=(building?sim.construction.progress*100:done?100:
    Math.min(sim.wood/12,1)*100)+'%';
  const a=sim.agents[selectedAgent];el('npc-avatar').textContent=a.name.charAt(0);el('npc-avatar').style.background='#'+new THREE.Color(a.color).getHexString();
  el('npc-name').textContent=a.name;
  el('map-npc-name').textContent=a.name;
  const actions={departWood:'Bere dřevo na cestu',departFood:'Vybírá vlastní jídlo',departCamp:'Odchází do samoty',campWander:'Žije v táboře',campLiving:'Odpočívá mimo osadu',tentEat:'Jí ve stanu',returnHome:'Vrací se domů',wood:'Cestuje ke stromu',harvest:'Sbírá dřevo',berries:'Hledá potravu',forage:'Sbírá bobule',returnwood:'Nese dřevo',returnfood:'Nese jídlo',build:'Jde stavět',building:'Staví přístřešek',rest:'Hledá odpočinek',resting:'Odpočívá',explore:'Prozkoumává krajinu',stone:'Cestuje ke kameni',mining:'Těží kámen',apples:'Cestuje pro jablka',applepicking:'Sbírá jablka',returnstone:'Nese kámen',weave:'Jde uplést košík',weaving:'Plete košík',plant:'Jde sázet',planting:'Vysévá semena',reap:'Jde sklízet',reaping:'Sklízí úrodu',meet:'Jde na setkání',waiting:'Čeká na přítele',talking:'Povídá si',eat:'Jde se najíst',eating:'Jí jídlo'};
  el('npc-role').textContent=actions[a.purpose]||'Rozhoduje o dalším kroku';el('npc-reason').textContent=a.reason;
  el('agent-state').textContent='ENERGIE '+Math.round(a.energy)+' %';
  el('map-npc-action').textContent=actions[a.purpose]||'Rozhoduje o dalším kroku';
  el('map-npc-reason').textContent=a.reason;
  el('npc-personality').textContent=a.personality.name;
  const stats=[['hunger',a.hunger],['thirst',a.thirst],['social',a.socialNeed],['energy',a.energy],['mood',a.mood]];
  for(const [name,value] of stats){
    el('npc-'+name).textContent=Math.round(value)+' %';
    el('need-'+name).style.width=clamp(value,0,100)+'%';
  }
  el('npc-memory').textContent=a.memories[a.memories.length-1]||'Zatím žádné vzpomínky';
  const friends=sim.agents.filter(b=>b.id!==a.id && (a.relationships[b.id]??0)>0)
    .sort((x,y)=>(a.relationships[y.id]??0)-(a.relationships[x.id]??0));
  el('npc-friend').textContent=friends.length?friends[0].name+' · '+relationshipLabel(a.relationships[friends[0].id]):'Zatím se s nikým nespřátelil';
  const conditions=sim.weather.kind==='rain'?'☂ Déšť':sim.weather.kind==='drought'?'☀ Sucho':'☀ Jasno';
  el('map-weather').textContent=conditions;
  el('world-weather').textContent=conditions;
  const remaining=Math.max(0,12-(sim.seconds-sim.lastMiracle));
  for(const button of document.querySelectorAll('[data-god]')){
    button.disabled=remoteWorldMode||remaining>.01;
    button.title=remoteWorldMode?'Serverový svět je pouze pro čtení':remaining>0?'Další zásah za '+Math.ceil(remaining)+' herních sekund':'Změnit podmínky světa';
  }
  const knowledge=knowledgeSummary(a);
  el('map-knowledge-count').textContent=
    knowledge.seen+' přímo objevených · '+knowledge.heard+' z doslechu';
  el('known-tree-count').textContent=knowledge.trees;
  el('known-berry-count').textContent=knowledge.berries;
  el('known-heard-count').textContent=knowledge.heard;
  el('known-places-count').textContent=knowledge.places;
  el('knowledge-discoveries').textContent=knowledge.discoveries+' objevů';
  const last=knowledge.lastDecision;
  el('knowledge-goal').textContent=last?(actions[last.goal]||last.goal):'Rozhlíží se po novém světě';
  el('knowledge-cause').textContent=last?.cause||'Zatím nemá dost informací k rozhodnutí.';
  el('knowledge-source').textContent=last?.source==='heard'?'Zdroj informace: vyprávění jiného obyvatele':
    last?.source==='seen'?'Zdroj informace: vlastní pozorování':
    'Zdroj rozhodnutí: vlastní potřeby a zkušenosti';
  if(document.body.classList.contains('page-overview')){
    drawPersonalKnowledgeMap(knowledge,a);
    const episodes=el('knowledge-episodes');
    episodes.replaceChildren();
    const recent=a.cognition.episodes.slice(-4).reverse();
    if(!recent.length){const p=document.createElement('p');p.className='knowledge-episode';
      p.textContent='Zatím nemá žádné významné zkušenosti.';episodes.appendChild(p);}
    for(const moment of recent){
      const article=document.createElement('article');article.className='knowledge-episode';
      const title=document.createElement('strong');title.textContent=moment.title;
      const cause=document.createElement('p');cause.textContent='Příčina: '+moment.cause;
      const result=document.createElement('p');result.textContent='Důsledek: '+moment.outcome;
      const date=document.createElement('small');date.textContent='Den '+(Math.floor(moment.time/75)+1);
      article.append(title,cause,result,date);episodes.appendChild(article);
    }
  }
    el('god-cooldown').textContent=remaining>0?
    'Další zásah za '+Math.ceil(remaining)+' herních sekund · lidé stále rozhodují sami':
    'Můžeš změnit podmínky světa. Každý zásah se zapíše do historie.';
}
el('btn-next-npc').addEventListener('click',()=>chooseAgent((selectedAgent+1)%sim.agents.length));
for(const button of document.querySelectorAll('[data-god]')){
  button.addEventListener('click',()=>{
    const kind=button.dataset.god;
    if(!remoteWorldMode&&sim.miracle(kind)){
      const label=kind==='rain'?'Déšť zasáhl krajinu.':kind==='drought'?'Krajinu zasáhlo sucho.':'Úroda v krajině zesílila.';
      announce(label+' Sleduj, jak se obyvatelé zachovají.');
      renderUI();
    }else announce('Božská moc se ještě obnovuje.');
  });
}
// Visitor controls change the player's body, not citizens' decisions.
const modeSelect=el('visitor-mode'),movePanel=el('visitor-controls');
const resetVisitorControls=()=>{for(const key of Object.keys(sim.avatar.controls))
  sim.avatar.controls[key]=false;
  for(const button of document.querySelectorAll('[data-visitor-move]'))
    button.classList.remove('is-held');
};
modeSelect.addEventListener('change',()=>{
  resetVisitorControls();
  const previous=sim.avatar.mode;
  selectPlayerMode(sim.avatar,modeSelect.value);
  movePanel.hidden=sim.avatar.mode==='observer';
  if(sim.avatar.mode==='observer')world?.resetCamera();
  announce(sim.avatar.mode==='god'?'Bůh se zjevil mezi obyvateli.':
    sim.avatar.mode==='poor'?'Procházíš světem jako chudý poutník.':
    sim.avatar.mode==='invisible'?'Pohybuješ se světem neviditelně.':
    'Vrátil ses k volné kameře.');
});
movePanel.hidden=true;
for(const button of document.querySelectorAll('[data-visitor-move]')){
  const direction=button.dataset.visitorMove;
  button.addEventListener('pointerdown',event=>{
    if(sim.avatar.mode==='observer')return;
    event.preventDefault();button.setPointerCapture?.(event.pointerId);
    sim.avatar.controls[direction]=true;button.classList.add('is-held');
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture']){
    button.addEventListener(type,()=>{
      sim.avatar.controls[direction]=false;button.classList.remove('is-held');
    });
  }
}
const visitorKeys={KeyW:'forward',ArrowUp:'forward',KeyS:'back',ArrowDown:'back',
  KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};
window.addEventListener('keydown',event=>{
  const direction=visitorKeys[event.code];
  if(!direction||sim.avatar.mode==='observer'||document.activeElement?.matches('input,select,textarea'))return;
  event.preventDefault();sim.avatar.controls[direction]=true;
});
window.addEventListener('keyup',event=>{
  const direction=visitorKeys[event.code];
  if(direction)sim.avatar.controls[direction]=false;
});
window.addEventListener('blur',resetVisitorControls);

// Real API is OPTIONAL. It never receives the user's GPS location or private data.
let loadingWeather=false;
async function updateExternalWeather(){
  if(!sim.externalWeatherEnabled||loadingWeather)return;
  loadingWeather=true;
  try{
    const weather=await fetchExternalWeather();
    if(!sim.externalWeatherEnabled)return;
    sim.externalWeather=weather;
    sim.weather={kind:weather.kind,until:sim.seconds+220};
    el('weather-api-status').textContent=weather.reference+' · '+weather.temperature+
      ' °C · srážky '+weather.precipitation+' mm · aktualizováno';
    sim.addEvent('Počasí z externího API','Open-Meteo ('+weather.reference+
      ') ovlivňuje srážky, práci a pohyb obyvatel.','☂');
  }catch(error){
    el('weather-api-status').textContent='Open-Meteo nedostupné — pokračuje místní simulace';
    console.warn('Optional live weather unavailable',error);
  }finally{loadingWeather=false;}
}
el('btn-live-weather').addEventListener('click',()=>{
  sim.externalWeatherEnabled=!sim.externalWeatherEnabled;
  el('btn-live-weather').textContent=sim.externalWeatherEnabled?
    'Živé počasí API: zapnuto':'Živé počasí API: vypnuto';
  if(sim.externalWeatherEnabled)updateExternalWeather();
  else {sim.externalWeather=null;
    el('weather-api-status').textContent='Místní autonomní simulace počasí';
  }
});
window.setInterval(()=>{if(sim.externalWeatherEnabled)updateExternalWeather();},600000);
// Local autosave preserves actual NPC decisions, inventory IDs, trails, spring
// reserves, elapsed years and the world chronicle on this browser only.
let saveDebounce=false;
function saveCurrentWorld(manual=false){
  if(remoteWorldMode||saveDebounce)return;
  saveDebounce=true;
  try{
    window.localStorage.setItem(activeSaveKey,serializeWorld(sim));
    if(el('save-status'))el('save-status').textContent=
      (manual?'Ručně uloženo':'Automaticky uloženo')+
      ' · rok '+calendarAt(sim.day).year+' / den '+sim.day;
  }catch(error){
    if(el('save-status'))el('save-status').textContent='Uložení selhalo · '+error.message;
    console.warn('MicroWorld local save unavailable',error);
  }finally{saveDebounce=false;}
}
if(el('save-status'))el('save-status').textContent=initialSaveStatus;
el('btn-save-world').addEventListener('click',()=>saveCurrentWorld(true));
window.setInterval(()=>saveCurrentWorld(false),30000);
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden')saveCurrentWorld(false);
});
window.addEventListener('beforeunload',()=>saveCurrentWorld(false));
el('btn-pause').addEventListener('click',()=>{if(remoteWorldMode)return;paused=!paused;el('btn-pause').textContent=paused?'▶':'Ⅱ';el('btn-pause').title=paused?'Pokračovat':'Pozastavit';});
const speeds=[1,2,4];let speedIndex=0,paused=false;
el('btn-speed').addEventListener('click',()=>{if(remoteWorldMode)return;speedIndex=(speedIndex+1)%3;el('btn-speed').textContent=speeds[speedIndex]+'×';});
el('nature').addEventListener('input',e=>{el('nature-out').textContent=e.target.value+' %';sim.setPolicies(e.target.value,sim.cooperation);});
el('cooperation').addEventListener('input',e=>{el('cooperation-out').textContent=e.target.value+' %';sim.setPolicies(sim.nature,e.target.value);});
el('btn-new-world').addEventListener('click',()=>{if(confirm('Začít nový experiment? Současná simulace se ztratí.'))location.reload();});
el('btn-info').addEventListener('click',()=>el('help-modal').classList.remove('hidden'));
el('btn-close-modal').addEventListener('click',()=>el('help-modal').classList.add('hidden'));
el('help-modal').addEventListener('click',e=>{if(e.target===el('help-modal'))el('help-modal').classList.add('hidden');});
document.addEventListener('keydown',e=>{if(e.key==='Escape')el('help-modal').classList.add('hidden');if(e.code==='Space' && e.target.tagName!=='BUTTON'){e.preventDefault();el('btn-pause').click();}});
/**
 * Show the real error on mobile instead of falsely blaming WebGL for every
 * exception in the rendering or world-model initialization.
 * The report contains no auth header, save data or device fingerprint.
 */
function showSceneFailure(error,stage){
  const result=describeSceneFailure(error,stage);
  console.error('MicroWorld 3D failed',result.code,result.diagnostic,error);
  const root=el('scene');
  if(!root)return;
  root.replaceChildren();
  const panel=document.createElement('section');
  panel.setAttribute('role','alert');
  panel.style.cssText='box-sizing:border-box;display:flex;flex-direction:column;gap:14px;justify-content:center;align-items:center;min-height:100%;padding:28px 20px;text-align:center;background:#1f3028;color:#eff6e8';
  const header=document.createElement('strong');
  header.textContent=result.title;
  header.style.fontSize='19px';
  const details=document.createElement('code');
  details.textContent=result.code+' · '+result.diagnostic;
  details.style.cssText='max-width:100%;box-sizing:border-box;overflow-wrap:anywhere;white-space:normal;font-size:12px;line-height:1.6;padding:12px;border:1px solid #6c9680;border-radius:9px;color:#b8d9bb';
  const hint=document.createElement('p');
  hint.textContent=result.hint;
  const retry=document.createElement('button');
  retry.textContent='Zkusit znovu';
  retry.type='button';
  retry.style.cssText='padding:12px 18px;border:1px solid #95ba9e;border-radius:9px;background:#294d3a;color:white';
  retry.addEventListener('click',()=>location.reload());
  panel.append(header,details,hint,retry);
  root.append(panel);
}

try{
  world=new Diorama(el('scene'),sim,{
    getSelectedAgent:()=>selectedAgent,
    chooseAgent:index=>chooseAgent(index)
  });
  let viewingFar=false;
  el('btn-far-island')?.addEventListener('click',()=>{
    viewingFar=!viewingFar;
    world.focusIsland(viewingFar);
    el('btn-far-island').textContent=viewingFar?'První ostrov':'Druhý ostrov';
  });
  el('btn-reset-camera').addEventListener('click',()=>{
    viewingFar=false;world.resetCamera();
    if(el('btn-far-island'))el('btn-far-island').textContent='Druhý ostrov';
  });
  const clock=new THREE.Clock();let uiTime=0;
  function frame(){
    try{
      const delta=Math.min(clock.getDelta(),.06);
      const actual=paused?0:delta*speeds[speedIndex];
      if(document.body.classList.contains('page-map')&&sim.avatar.mode!=='observer')
        advanceAvatar(sim.avatar,delta,indexSolids(solidFootprints(sim)));
      if(actual&&!remoteWorldMode)sim.update(actual);
      if(document.body.classList.contains('page-map'))world.update(delta);
      uiTime+=delta;if(uiTime>.28){renderUI();uiTime=0;}
      requestAnimationFrame(frame);
    }catch(error){
      showSceneFailure(error,'frame');
    }
  }
  events();renderUI();frame();
}catch(error){
  showSceneFailure(error,Diorama.lastStage||'initialization');
  events();renderUI();
}
}
launchMicroWorld().catch(error=>{
  console.error('MicroWorld bootstrap failed',error);
  const target=document.getElementById('scene');
  if(target)target.textContent='Nelze spustit zobrazení světa. Zkontroluj dostupnost simulačního serveru.';
});
