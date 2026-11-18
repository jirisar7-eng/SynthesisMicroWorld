import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';

const el = id => document.getElementById(id);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const dist = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const rand = (min,max) => min+Math.random()*(max-min);
const names = ['Adam','Ema','Tobiáš','Klára','Matěj','Nora'];
const colors = [0xb17b59,0x9baf74,0x637f9b,0xca9d75,0x8e798d,0x81ad9f];
const terrainHeight = (x,z) => {
  const r=Math.hypot(x,z);
  const shore=clamp(1-Math.pow(r/46,4),0,1);
  return -1.65+3.6*shore+0.31*Math.sin(x*.35)*Math.cos(z*.31)+0.15*Math.sin(x*.9+z*.55);
};
function seeded(seed){let n=seed>>>0;return()=>{n=(n*1664525+1013904223)>>>0;return n/4294967296;};}
const rng=seeded(217);
function points(count,minR,maxR,exclude=0){
  const a=[];let tries=0;
  while(a.length<count && tries++<count*40){
    const angle=rng()*Math.PI*2,r=minR+rng()*(maxR-minR),x=Math.cos(angle)*r,z=Math.sin(angle)*r;
    if(Math.hypot(x,z)<exclude)continue;
    if(a.some(p=>Math.hypot(p.x-x,p.z-z)<(count>60?3.4:2.4)))continue;
    a.push({x,z});
  }return a;
}

class Civilization {
  constructor(){
    this.seconds=0;this.day=1;this.wood=0;this.food=14;this.shelters=[];this.construction=null;
    this.nature=60;this.cooperation=80;this.messages=[];this.listeners=[];
    this.trees=points(83,13,34,0).map((p,i)=>({...p,id:i,stock:9,maxStock:9}));
    this.berries=points(28,8,32).map((p,i)=>({...p,id:i,stock:10,maxStock:10}));
    this.agents=names.map((name,i)=>({id:i,name,x:rand(-2.8,2.8),z:rand(-2.8,2.8),energy:75+rand(0,20),mode:'idle',purpose:'',reason:'Rozhlíží se po novém světě.',target:null,resource:null,carry:0,workRemaining:0,workTotal:0,choiceAt:0,speed:2+rand(0,0.55),color:colors[i]}));
    this.nextMeal=75;this.lastScout=-999;this.addEvent('Nový začátek','Šest obyvatel dorazilo do neznámé krajiny.','✧');
    this.addEvent('První rozhodnutí','Obyvatelé sami zjišťují, co potřebují k přežití.','◈');
  }
  addEvent(title,detail,icon='◈'){
    this.messages.unshift({title,detail,icon,time:'Den '+this.day});this.messages=this.messages.slice(0,13);
    this.listeners.forEach(f=>f(this.messages[0]));
  }
  setPolicies(nature,cooperation){this.nature=+nature;this.cooperation=+cooperation;}
  go(a,purpose,target,reason,resource=null){
    a.mode='walk';a.purpose=purpose;a.target={x:target.x,z:target.z};a.reason=reason;a.resource=resource;
  }
  work(a,purpose,duration,reason){
    a.mode='work';a.purpose=purpose;a.workRemaining=duration;a.workTotal=duration;a.reason=reason;
  }
  idle(a){a.mode='idle';a.purpose='';a.target=null;a.resource=null;a.choiceAt=this.seconds+rand(0.25,1.25);}
  closestAvailable(list,a){return list.filter(p=>p.stock>0).sort((p,q)=>dist(a,p)-dist(a,q))[0];}
  decide(a){
    if(this.seconds<a.choiceAt)return;
    if(a.energy<21){this.go(a,'rest',{x:rand(-3,3),z:rand(-3,3)},'Je unavený a potřebuje odpočinek.');return;}
    if(!this.construction && this.shelters.length<1 && this.wood>=12){
      this.wood-=12;this.construction={x:5.1,z:4.9,progress:0,agentId:a.id};
      this.addEvent('Vzniká první stavba',a.name+' se rozhodl postavit přístřešek. Osada má dost dřeva.','⌂');
      this.go(a,'build',this.construction,'Rozhodl se řešit nedostatek bydlení: staví první přístřešek.');return;
    }
    if(this.construction && this.construction.agentId===a.id){
      this.go(a,'build',this.construction,'Chce dokončit rozestavěný přístřešek.');return;
    }
    const urgentFood=this.food<9+this.cooperation/20;
    const foragers=this.agents.filter(p=>p.id!==a.id && (p.purpose==='berries'||p.purpose==='returnfood')).length;
    const cooperativeSlots=Math.max(1,Math.round(this.cooperation/35));
    const gatherFood=(urgentFood && foragers<cooperativeSlots) || (foragers<1 && this.cooperation>=35) || (this.wood>7 && Math.random()<0.27);
    const woods=this.trees.filter(t=>t.stock>0);
    const berry=this.closestAvailable(this.berries,a);
    const tree=this.closestAvailable(woods,a);
    if(gatherFood && berry){
      this.go(a,'berries',berry,urgentFood?'Zásoby potravy klesají. Rozhodl se hledat bobule.':'Zajišťuje zásoby potravy pro ostatní.',berry);return;
    }
    if(tree && (this.shelters.length===0 || (this.wood<5 && Math.random()*100>this.nature/2) || (this.nature<70 && (this.wood<25 || Math.random()*100>this.nature)))){
      this.go(a,'wood',tree,'Osada potřebuje dřevo. Vybral si dostupný strom v okolí.',tree);return;
    }
    if(berry){this.go(a,'berries',berry,'Dává přednost šetrnému sběru potravy před těžbou.',berry);return;}
    this.go(a,'explore',{x:rand(-27,27),z:rand(-27,27)},'Zkoumá krajinu a hledá další příležitosti.');
  }
  arrived(a){
    if(a.purpose==='wood'){
      if(!a.resource || a.resource.stock<=0){this.idle(a);return;}
      this.work(a,'harvest',2.8+rand(0,1),'Sbírá dřevo z nalezeného stromu.');return;
    }
    if(a.purpose==='berries'){
      if(!a.resource || a.resource.stock<=0){this.idle(a);return;}
      this.work(a,'forage',2.3+rand(0,1),'Sbírá jedlé plody pro osadu.');return;
    }
    if(a.purpose==='returnwood'){
      this.wood+=a.carry;a.carry=0;this.idle(a);
      if(this.wood>=12 && this.shelters.length===0 && !this.construction)this.addEvent('Dostatek dřeva','V osadě je materiál na první přístřešek. Někdo může začít stavět.','♣');
      return;
    }
    if(a.purpose==='returnfood'){
      this.food+=a.carry;a.carry=0;this.idle(a);return;
    }
    if(a.purpose==='build'){
      this.work(a,'building',11,'Staví přístřešek z nasbíraného dřeva.');return;
    }
    if(a.purpose==='rest'){this.work(a,'resting',6,'Odpočívá po práci v blízkosti osady.');return;}
    if(a.purpose==='explore'){if(this.seconds-this.lastScout>15){this.addEvent('Průzkum okolí',a.name+' prozkoumal další kus krajiny.','⌕');this.lastScout=this.seconds;}this.idle(a);}
  }
  completed(a){
    if(a.purpose==='harvest'){
      const amount=Math.min(a.resource?.stock||0,3);if(a.resource)a.resource.stock-=amount;
      a.carry=amount;this.go(a,'returnwood',{x:0,z:0},'Nese '+amount+' jednotky dřeva do společných zásob.');return;
    }
    if(a.purpose==='forage'){
      const amount=Math.min(a.resource?.stock||0,4);if(a.resource)a.resource.stock-=amount;
      a.carry=amount;this.go(a,'returnfood',{x:0,z:0},'Nese nasbírané jídlo do společných zásob.');return;
    }
    if(a.purpose==='building' && this.construction){
      this.shelters.push({x:this.construction.x,z:this.construction.z});
      this.construction=null;this.addEvent('První přístřešek je hotový',a.name+' dokončil první stavbu bez jakéhokoli příkazu hráče.','⌂');
      this.idle(a);return;
    }
    if(a.purpose==='resting'){a.energy=Math.min(100,a.energy+68);this.idle(a);return;}
    this.idle(a);
  }
  update(dt){
    this.seconds+=dt;this.day=Math.floor(this.seconds/75)+1;
    if(this.seconds>=this.nextMeal){
      this.nextMeal+=75;this.food=Math.max(0,this.food-6);
      this.addEvent('Nový den','Obyvatelé spotřebovali 6 jednotek potravy.','☼');
      for(const b of this.berries)b.stock=Math.min(b.maxStock,b.stock+3);
    }
    for(const a of this.agents){
      if(a.mode==='idle'){this.decide(a);continue;}
      if(a.mode==='walk' && a.target){
        const d=dist(a,a.target),step=a.speed*dt;
        if(d<=step+.3){a.x=a.target.x;a.z=a.target.z;this.arrived(a);}
        else{a.x+=(a.target.x-a.x)/d*step;a.z+=(a.target.z-a.z)/d*step;}
        a.energy=clamp(a.energy-dt*.16,0,100);
      }
      else if(a.mode==='work'){
        a.workRemaining-=dt;a.energy=clamp(a.energy-dt*.55,0,100);
        if(a.purpose==='building' && this.construction)this.construction.progress=clamp(1-a.workRemaining/a.workTotal,0,1);
        if(a.workRemaining<=0)this.completed(a);
      }
    }
  }
}
class Diorama {
  constructor(container,sim){
    this.sim=sim;this.container=container;this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#c8dfdd');this.scene.fog=new THREE.Fog('#c8dfdd',60,140);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.7));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.43;
    container.appendChild(this.renderer.domElement);
    this.camera=new THREE.PerspectiveCamera(47,1,.1,250);this.resetCamera();
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.dampingFactor=.07;this.controls.minDistance=13;this.controls.maxDistance=90;this.controls.maxPolarAngle=Math.PI*.46;this.controls.minPolarAngle=.22;this.controls.target.set(0,1.5,0);this.controls.enablePan=true;this.controls.screenSpacePanning=true;this.controls.maxTargetRadius=32;
    this.scene.add(new THREE.HemisphereLight('#edffff','#768b68',2.4));
    const sun=new THREE.DirectionalLight('#ffeed6',3.5);sun.position.set(-20,43,24);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-49;sun.shadow.camera.right=49;sun.shadow.camera.top=49;sun.shadow.camera.bottom=-49;sun.shadow.camera.near=1;sun.shadow.camera.far=110;sun.shadow.bias=-.00022;this.scene.add(sun);this.sun=sun;
    const groundGeo=new THREE.PlaneGeometry(100,100,100,100);groundGeo.rotateX(-Math.PI/2);
    const pos=groundGeo.attributes.position,vertices=[];
    const light=new THREE.Color('#98bb73'),dark=new THREE.Color('#628c55'),sandy=new THREE.Color('#d8cf94');
    for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i);const h=terrainHeight(x,z);pos.setY(i,h);
      let color=light.clone().lerp(dark,clamp((.5+Math.sin(x*1.1+z*.35)*.25+Math.cos(z*.94-x*.3)*.22),0,1)*.55);
      if(h<-.25)color.lerp(sandy,clamp((-.25-h)*1.3,0,.95));vertices.push(color.r,color.g,color.b);
    }groundGeo.setAttribute('color',new THREE.Float32BufferAttribute(vertices,3));groundGeo.computeVertexNormals();
    const land=new THREE.Mesh(groundGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}));land.receiveShadow=true;this.scene.add(land);
    const water=new THREE.Mesh(new THREE.PlaneGeometry(190,190),new THREE.MeshPhysicalMaterial({color:'#7cb2ad',roughness:.25,metalness:.07,transparent:true,opacity:.76,clearcoat:.6,clearcoatRoughness:.18}));water.rotation.x=-Math.PI/2;water.position.y=-.58;this.scene.add(water);this.water=water;
    this.addCamp();this.treeModels=[];this.addForest();this.addBerries();this.addRocksAndGrass();this.people=[];this.pickables=[];
    for(const agent of sim.agents){const group=this.makePerson(agent);this.scene.add(group);this.people.push(group);}
    this.shelterVisual=null;this.constructionVisual=null;this.built=0;this.timer=0;
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();
    const canvas=this.renderer.domElement;let start={x:0,y:0};
    canvas.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};});
    canvas.addEventListener('pointerup',e=>{if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>7)return;this.pointer.set((e.offsetX/canvas.clientWidth)*2-1,-(e.offsetY/canvas.clientHeight)*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);const hit=this.raycaster.intersectObjects(this.pickables,false)[0];if(hit){chooseAgent(hit.object.userData.agentId);}});
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);this.resize();
  }
  mat(color,roughness=1){return new THREE.MeshStandardMaterial({color,roughness});}
  mesh(geometry,material,x,y,z,cast=true){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=cast;m.receiveShadow=true;return m;}
  resetCamera(){this.camera?.position.set(29,37,48);if(this.controls){this.controls.target.set(0,1.4,0);this.controls.update();}}
  addCamp(){
    const y=terrainHeight(0,0);const base=this.mesh(new THREE.CylinderGeometry(3.6,3.7,.14,24),this.mat('#aa906c'),0,y+.1,0,false);this.scene.add(base);
    const stonesMat=this.mat('#8e8876');
    for(let i=0;i<11;i++){const a=i*Math.PI*2/11;const rock=this.mesh(new THREE.DodecahedronGeometry(.38,0),stonesMat,Math.cos(a)*1.2,y+.25,Math.sin(a)*1.2);rock.scale.set(1,.6,.8);this.scene.add(rock);}
    const fire=this.mesh(new THREE.ConeGeometry(.33,.8,5),new THREE.MeshStandardMaterial({color:'#f6b755',emissive:'#f48c36',emissiveIntensity:2}),0,y+.58,0,false);this.scene.add(fire);this.fire=fire;
    const light=new THREE.PointLight('#ffb463',2.3,11);light.position.set(0,y+1.2,0);this.scene.add(light);this.campLight=light;
    for(const [x,z,r] of [[-2,1,.2],[1.9,-1.6,-.7]]){const log=this.mesh(new THREE.CylinderGeometry(.19,.19,2.1,7),this.mat('#866245'),x,y+.26,z);log.rotation.z=Math.PI/2;log.rotation.y=r;this.scene.add(log);}
  }
  addForest(){
    const trunk=this.mat('#776047'),leaf1=this.mat('#3e7155'),leaf2=this.mat('#5f9663'),leaf3=this.mat('#719e66');
    const treeMaterials=[leaf1,leaf2,leaf3];
    for(const p of this.sim.trees){
      const y=terrainHeight(p.x,p.z);const group=new THREE.Group();group.position.set(p.x,y,p.z);
      const sc=.78+rng(0,.8);group.scale.setScalar(sc);
      group.add(this.mesh(new THREE.CylinderGeometry(.19,.3,2.1,7),trunk,0,1.05,0));
      const col=treeMaterials[p.id%3];
      group.add(this.mesh(new THREE.ConeGeometry(1.22,3.1,7),col,0,3.05,0));
      group.add(this.mesh(new THREE.ConeGeometry(1.01,2.6,7),col,0,4.25,0));
      group.add(this.mesh(new THREE.ConeGeometry(.76,2,7),col,0,5.16,0));
      this.scene.add(group);this.treeModels.push({model:group,resource:p,scale:sc});
    }
  }
  addBerries(){
    const mat=this.mat('#4f8a59'),fruit=this.mat('#c57e58'),stem=this.mat('#597b42');
    for(const p of this.sim.berries){
      const y=terrainHeight(p.x,p.z);const g=new THREE.Group();g.position.set(p.x,y,p.z);
      for(let i=0;i<3;i++){const ang=i*2.094;g.add(this.mesh(new THREE.SphereGeometry(.6,7,5),mat,Math.cos(ang)*.42,.64,Math.sin(ang)*.42));}
      for(let i=0;i<4;i++){const ang=i*1.57;g.add(this.mesh(new THREE.SphereGeometry(.13,6,5),fruit,Math.cos(ang)*.62,1.03,Math.sin(ang)*.58));}
      g.add(this.mesh(new THREE.CylinderGeometry(.07,.11,.75,5),stem,0,.37,0));this.scene.add(g);
    }
  }
  addRocksAndGrass(){
    const stone=[this.mat('#a1a39a'),this.mat('#8d9992'),this.mat('#b6ae99')];
    for(const p of points(42,8,36)){const m=this.mesh(new THREE.DodecahedronGeometry(.4+rng(0,.6),0),stone[Math.floor(rand(0,3))],p.x,terrainHeight(p.x,p.z)+.19,p.z);m.scale.set(1.5,.62,1.15);m.rotation.y=rand(0,7);this.scene.add(m);}
    const bladeGeo=new THREE.ConeGeometry(.15,.74,3),bladeMat=this.mat('#709963');
    const grass=new THREE.InstancedMesh(bladeGeo,bladeMat,330);const dummy=new THREE.Object3D();
    for(let i=0;i<330;i++){const r=7+Math.sqrt(rng())*30,a=rng()*Math.PI*2;dummy.position.set(Math.cos(a)*r,terrainHeight(Math.cos(a)*r,Math.sin(a)*r)+.25,Math.sin(a)*r);dummy.scale.setScalar(.6+rng()*.7);dummy.rotation.y=rng()*6.3;dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);}grass.instanceMatrix.needsUpdate=true;this.scene.add(grass);
    const cloudMat=new THREE.MeshStandardMaterial({color:'#f4fcf3',transparent:true,opacity:.55,roughness:1,depthWrite:false});
    for(let i=0;i<6;i++){const cloud=new THREE.Group();cloud.position.set((i-3)*19,19+rand(0,6),-21+rand(-15,15));for(let j=0;j<4;j++){const ball=this.mesh(new THREE.SphereGeometry(2+rand(0,1.3),9,7),cloudMat,(j-1.5)*2.6,rand(-.5,.5),rand(-1,1),false);ball.scale.y=.5;cloud.add(ball);}this.scene.add(cloud);}
  }
  makePerson(a){
    const g=new THREE.Group(),skin=this.mat('#e9c49f'),shirt=this.mat(a.color),pants=this.mat('#445d53'),hair=this.mat(a.id%2?'#584239':'#88664d');
    g.add(this.mesh(new THREE.CylinderGeometry(.32,.39,.77,8),shirt,0,.95,0));
    g.add(this.mesh(new THREE.SphereGeometry(.32,10,8),skin,0,1.61,0));
    const cap=this.mesh(new THREE.SphereGeometry(.32,10,8),hair,0,1.78,-.025);cap.scale.set(1,.48,1);g.add(cap);
    for(const sign of [-1,1]){g.add(this.mesh(new THREE.CylinderGeometry(.12,.13,.5,7),pants,sign*.19,.38,0));g.add(this.mesh(new THREE.CylinderGeometry(.11,.11,.57,7),shirt,sign*.44,1.03,0));}
    const halo=this.mesh(new THREE.RingGeometry(.55,.67,28),new THREE.MeshBasicMaterial({color:'#e8ffd1',side:THREE.DoubleSide,transparent:true,opacity:.85}),0,.11,0,false);halo.rotation.x=-Math.PI/2;halo.visible=false;g.add(halo);g.userData.halo=halo;
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
    this.fire.scale.y=.8+Math.sin(this.timer*9)*.2;this.campLight.intensity=2+Math.sin(this.timer*7)*.3;
    this.water.position.y=-.58+Math.sin(this.timer*.45)*.015;
    this.sim.agents.forEach((a,i)=>{
      const g=this.people[i];g.position.set(a.x,terrainHeight(a.x,a.z)+.04+(a.mode==='walk'?Math.sin(this.timer*9+i)*.055:0),a.z);
      if(a.mode==='walk' && a.target){const dx=a.target.x-a.x,dz=a.target.z-a.z;if(Math.hypot(dx,dz)>.2)g.rotation.y=Math.atan2(dx,dz);}
      g.userData.halo.visible=i===selectedAgent;
    });
    for(const tree of this.treeModels)if(tree.resource.stock<=0 && tree.model.scale.y>.32)tree.model.scale.y=.32;
    if(this.sim.construction){
      if(!this.constructionVisual){this.constructionVisual=this.addShelter(this.sim.construction.x,this.sim.construction.z,.05);announce('Obyvatelé zahájili stavbu prvního přístřešku.');}
      const p=this.sim.construction.progress,model=this.constructionVisual;model.walls.scale.y=clamp(p*1.4,0,1);model.walls.position.y=.3+model.walls.scale.y*1.2;
      model.roof.visible=p>.62;model.door.visible=p>.75;model.chimney.visible=p>.8;
    }
    if(this.sim.shelters.length && !this.built){this.built=this.sim.shelters.length;if(this.constructionVisual){this.scene.remove(this.constructionVisual.group);this.constructionVisual=null;}for(const s of this.sim.shelters)this.addShelter(s.x,s.z);announce('První přístřešek vyrostl z rozhodnutí NPC.');}
    this.controls.update();this.renderer.render(this.scene,this.camera);
  }
  resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);}
}
let selectedAgent=0;
const sim=new Civilization();
let world;
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
function renderUI(){
  el('people').textContent=sim.agents.length;el('wood').textContent=sim.wood;el('food').textContent=sim.food;
  el('m-people').textContent=sim.agents.length;el('m-wood').textContent=sim.wood;el('m-food').textContent=sim.food;
  el('day').textContent='Den '+sim.day;
  const building=!!sim.construction,done=sim.shelters.length>0;
  el('stage-tag').textContent=done?'PRVNÍ DOMOV':building?'VÝSTAVBA':'PRŮZKUM';
  el('stage-title').textContent=done?'Osada má první přístřešek':building?'Obyvatelé staví přístřešek':'Hledání místa k životu';
  el('stage-description').textContent=done?'Stavbu si sami naplánovali, zajistili materiál a dokončili. Simulace běží dál.':building?'Jeden z obyvatel se rozhodl využít společné zásoby dřeva a začal stavět.':'Obyvatelé samostatně hledají suroviny. Jakmile jich bude dost, některý začne stavět.';
  el('progress-name').textContent=done?'První autonomní stavba dokončena':building?'Postup stavby':'Materiál na první přístřešek';
  el('progress-number').textContent=done?'HOTOVO':building?Math.round(sim.construction.progress*100)+' %':Math.min(sim.wood,12)+' / 12';
  el('build-progress').style.width=(done?100:building?sim.construction.progress*100:Math.min(sim.wood/12,1)*100)+'%';
  const a=sim.agents[selectedAgent];el('npc-avatar').textContent=a.name.charAt(0);el('npc-avatar').style.background='#'+new THREE.Color(a.color).getHexString();
  el('npc-name').textContent=a.name;
  const actions={wood:'Cestuje ke stromu',harvest:'Sbírá dřevo',berries:'Hledá potravu',forage:'Sbírá bobule',returnwood:'Nese dřevo',returnfood:'Nese jídlo',build:'Jde stavět',building:'Staví přístřešek',rest:'Hledá odpočinek',resting:'Odpočívá',explore:'Prozkoumává krajinu'};
  el('npc-role').textContent=actions[a.purpose]||'Rozhoduje o dalším kroku';el('npc-reason').textContent=a.reason;
  el('agent-state').textContent='ENERGIE '+Math.round(a.energy)+' %';
}
el('btn-next-npc').addEventListener('click',()=>chooseAgent((selectedAgent+1)%sim.agents.length));
el('btn-pause').addEventListener('click',()=>{paused=!paused;el('btn-pause').textContent=paused?'▶':'Ⅱ';el('btn-pause').title=paused?'Pokračovat':'Pozastavit';});
const speeds=[1,2,4];let speedIndex=0,paused=false;
el('btn-speed').addEventListener('click',()=>{speedIndex=(speedIndex+1)%3;el('btn-speed').textContent=speeds[speedIndex]+'×';});
el('nature').addEventListener('input',e=>{el('nature-out').textContent=e.target.value+' %';sim.setPolicies(e.target.value,sim.cooperation);});
el('cooperation').addEventListener('input',e=>{el('cooperation-out').textContent=e.target.value+' %';sim.setPolicies(sim.nature,e.target.value);});
el('btn-new-world').addEventListener('click',()=>{if(confirm('Začít nový experiment? Současná simulace se ztratí.'))location.reload();});
el('btn-info').addEventListener('click',()=>el('help-modal').classList.remove('hidden'));
el('btn-close-modal').addEventListener('click',()=>el('help-modal').classList.add('hidden'));
el('help-modal').addEventListener('click',e=>{if(e.target===el('help-modal'))el('help-modal').classList.add('hidden');});
document.addEventListener('keydown',e=>{if(e.key==='Escape')el('help-modal').classList.add('hidden');if(e.code==='Space' && e.target.tagName!=='BUTTON'){e.preventDefault();el('btn-pause').click();}});
try{
  world=new Diorama(el('scene'),sim);
  el('btn-reset-camera').addEventListener('click',()=>world.resetCamera());
  const clock=new THREE.Clock();let uiTime=0;
  function frame(){requestAnimationFrame(frame);const delta=Math.min(clock.getDelta(),.06);const actual=paused?0:delta*speeds[speedIndex];if(actual)sim.update(actual);world.update(delta);uiTime+=delta;if(uiTime>.28){renderUI();uiTime=0;}}
  events();renderUI();frame();
}catch(error){
  console.error('MicroWorld rendering failed',error);
  el('scene').innerHTML='<div style="display:grid;place-items:center;height:100%;background:#1f3028;color:#fff;padding:30px;text-align:center">3D vykreslování není dostupné. Ověř podporu WebGL v prohlížeči.</div>';
  events();renderUI();
}