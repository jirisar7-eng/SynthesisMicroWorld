import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';
import {
  initCognition, observeNearby, chooseKnownResource, chooseExplorationTarget,
  learnOutcome, exchangeKnowledge, decision, knowledgeSummary, episode
} from './cognition.js';
import {initializeLife, updateLife, remember, socialBond, needsDecision, relationshipLabel} from './life.js';

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
    this.weather={kind:'clear',until:0};this.lastMiracle=-100;this.meetings=new Map();this.meetingSeq=0;this.lastNightNotice=-1;
    this.trees=points(83,13,34,0).map((p,i)=>({...p,id:i,stock:9,maxStock:9}));
    this.berries=points(28,8,32).map((p,i)=>({...p,id:i,stock:10,maxStock:10}));
    this.agents=names.map((name,i)=>initCognition(initializeLife({id:i,name,x:rand(-2.8,2.8),z:rand(-2.8,2.8),energy:75+rand(0,20),mode:'idle',purpose:'',reason:'Rozhlíží se po novém světě.',target:null,resource:null,carry:0,workRemaining:0,workTotal:0,choiceAt:0,speed:2+rand(0,.55),color:colors[i]},i)));
    this.lastDiscoveryReport=-100;
    this.nextMeal=75;this.lastScout=-999;this.addEvent('Nový začátek','Šest obyvatel dorazilo do neznámé krajiny.','✧');
    this.addEvent('První rozhodnutí','Obyvatelé sami zjišťují, co potřebují k přežití.','◈');
  }
  addEvent(title,detail,icon='◈'){
    this.messages.unshift({title,detail,icon,time:'Den '+this.day});this.messages=this.messages.slice(0,13);
    this.listeners.forEach(f=>f(this.messages[0]));
  }
  setPolicies(nature,cooperation){this.nature=+nature;this.cooperation=+cooperation;}
  // A god changes the environment, never takes over an NPC's decisions.
  miracle(kind){
    if(this.seconds-this.lastMiracle<12)return false;
    this.lastMiracle=this.seconds;
    if(kind==='rain'){
      this.weather={kind:'rain',until:this.seconds+50};
      for(const berry of this.berries)berry.stock=Math.min(berry.maxStock,berry.stock+2);
      this.addEvent('Božský zásah: déšť','Na krajinu začalo pršet. Rostliny se lépe obnovují, lidé se rozhodují podle počasí.','☂');
    }else if(kind==='bloom'){
      for(const berry of this.berries)berry.stock=Math.min(berry.maxStock,berry.stock+6);
      this.addEvent('Božský zásah: úroda','Krajina náhle rozkvetla a zvýšila se dostupnost plodů. Obyvatelé je stále musí sami sesbírat.','✿');
    }else if(kind==='drought'){
      this.weather={kind:'drought',until:this.seconds+50};
      for(const berry of this.berries)berry.stock=Math.max(0,berry.stock-4);
      this.addEvent('Božský zásah: sucho','Úroda zeslábla. Obyvatelé se budou muset přizpůsobit nedostatku zdrojů.','☀');
    }else return false;
    return true;
  }
  beginConversation(a,b){
    const id=++this.meetingSeq;
    const x=rand(-2.7,2.7),z=rand(-3,3);
    this.meetings.set(id,{first:a.id,second:b.id,ready:new Set(),done:false});
    a.conversation=id;b.conversation=id;
    this.go(a,'meet',{x:x-.45,z},'Chce si popovídat s '+b.name+' a posílit vztahy.');
    this.go(b,'meet',{x:x+.45,z},'Přijal pozvání od '+a.name+' ke společnému rozhovoru.');
  }
  seekConversation(a){
    const candidates=this.agents.filter(b=>b.id!==a.id && b.mode==='idle' && b.socialNeed>=38 && b.energy>23 && b.hunger<72);
    if(!candidates.length)return false;
    const b=candidates.sort((x,y)=>(y.socialNeed+(a.relationships[y.id]||0)*.12)-(x.socialNeed+(a.relationships[x.id]||0)*.12))[0];
    this.beginConversation(a,b);return true;
  }
  go(a,purpose,target,reason,resource=null){
    a.mode='walk';a.purpose=purpose;a.target={x:target.x,z:target.z};a.reason=reason;a.resource=resource;
    const sourceType=purpose==='wood'?'tree':purpose==='berries'?'berry':null;
    const provenance=sourceType&&resource?a.cognition.resources[sourceType+':'+resource.id]?.origin||'unknown':'own';
    decision(a,this.seconds,purpose,reason,provenance);
  }
  work(a,purpose,duration,reason){
    a.mode='work';a.purpose=purpose;
    const skilled=['harvest','forage','building'].includes(purpose);
    a.workRemaining=duration*(skilled?1.12-a.personality.persistence/500:1);
    a.workTotal=a.workRemaining;a.reason=reason;
  }
  idle(a){a.mode='idle';a.purpose='';a.target=null;a.resource=null;a.choiceAt=this.seconds+rand(0.25,1.25);}
  decide(a){
    if(this.seconds<a.choiceAt)return;
    const need=needsDecision(a,this.food);
    if(need==='eat'){
      this.go(a,'eat',{x:rand(-2,2),z:rand(-2,2)},'Má hlad ('+Math.round(a.hunger)+' %) a jde se samostatně najíst.');return;
    }
    const dark=(this.seconds%75)/75>.72 || (this.seconds%75)/75<.11;
    if(need==='rest'||(dark && a.energy<76)){
      this.go(a,'rest',{x:rand(-3,3),z:rand(-3,3)},dark?'Je noc a chce se vyspat.':'Je unavený a potřebuje odpočinek.');return;
    }
    if(need==='social' && this.seekConversation(a))return;
    if(!this.construction && this.shelters.length<1 && this.wood>=12){
      this.wood-=12;this.construction={x:5.1,z:4.9,progress:0,agentId:a.id};
      this.addEvent('Vzniká první stavba',a.name+' se rozhodl postavit přístřešek. Osada má dost dřeva.','⌂');
      this.go(a,'build',this.construction,'Rozhodl se řešit nedostatek bydlení: staví první přístřešek.');return;
    }
    if(this.construction && this.construction.agentId===a.id){
      this.go(a,'build',this.construction,'Chce dokončit rozestavěný přístřešek.');return;
    }
    // Different personalities generate different priorities even under the same weather.
    if(this.shelters.length && this.wood>=12 && this.food>=12 && a.personality.curiosity>75 &&
      Math.random()<(a.personality.curiosity-60)/60){
      this.go(a,'explore',chooseExplorationTarget(a,this.seconds),
        'Ze své zvědavosti hledá neznámé místo; neví předem, co tam najde.');return;
    }
    const urgentFood=this.food<9+this.cooperation/20;
    const foragers=this.agents.filter(p=>p.id!==a.id && (p.purpose==='berries'||p.purpose==='returnfood')).length;
    const cooperativeSlots=Math.max(1,Math.round(this.cooperation/35));
    const gatherFood=(urgentFood && foragers<cooperativeSlots) || (foragers<1 && this.cooperation>=35) || (this.wood>7 && Math.random()<0.27);
    // A citizen may select resources ONLY from his or her own memories.
    // The world object is consulted ONLY to resolve a known identity for interaction.
    const knownBerry=chooseKnownResource(a,'berry',this.seconds);
    const knownTree=chooseKnownResource(a,'tree',this.seconds);
    const goKnown=(kind,remembered,reason)=>{
      if(!remembered)return false;
      const type=kind==='berries'?'berry':'tree';
      const actual=(type==='berry'?this.berries:this.trees).find(p=>p.id===remembered.id);
      if(!actual)return false;
      const source=remembered.origin==='heard'?'z vyprávění '+remembered.from:'z vlastního pozorování';
      this.go(a,kind,{x:remembered.x,z:remembered.z},reason+' O místě ví '+source+'.',actual);
      return true;
    };
    if((gatherFood || (a.hunger>=70 && this.food===0)) && knownBerry){
      if(goKnown('berries',knownBerry,'Osada potřebuje potravu. Vybral známé místo se zdrojem.'))return;
    }
    if(knownTree && (this.shelters.length===0 || (this.wood<5 && Math.random()*100>this.nature/2) || (this.nature<70 && (this.wood<25 || Math.random()*100>this.nature)))){
      if(goKnown('wood',knownTree,'Potřebuje stavební materiál a vybavil si známý strom.'))return;
    }
    if(knownBerry && goKnown('berries',knownBerry,'Zvolil šetrný sběr ze známého naleziště.'))return;
    if(knownTree && this.wood<25 && goKnown('wood',knownTree,'Zvolil již objevený strom.'))return;
    this.go(a,'explore',chooseExplorationTarget(a,this.seconds),
      'Nezná žádný vhodný aktuální zdroj. Nejdřív musí oblast sám prozkoumat.');
  }
  arrived(a){
    if(a.purpose==='meet'){
      const conversation=this.meetings.get(a.conversation);
      if(!conversation){this.idle(a);return;}
      a.mode='waiting';a.purpose='waiting';a.reason='Čeká na druhého obyvatele, aby spolu mohli mluvit.';
      conversation.ready.add(a.id);
      if(conversation.ready.size===2){
        const first=this.agents[conversation.first],second=this.agents[conversation.second];
        this.work(first,'talking',4.5,'Povídá si s '+second.name+' u ohniště.');
        this.work(second,'talking',4.5,'Povídá si s '+first.name+' u ohniště.');
        this.addEvent('Setkání obyvatel',first.name+' a '+second.name+' si spolu povídají.','♡');
      }
      return;
    }
    if(a.purpose==='eat'){
      this.work(a,'eating',3,'Jí ze společných zásob a doplňuje síly.');return;
    }
    if(a.purpose==='wood'){
      if(!a.resource || a.resource.stock<=0){
        if(a.resource)learnOutcome(a,'tree',a.resource,0,this.seconds);
        remember(a,'Známý strom byl vyčerpaný');
        this.idle(a);return;
      }
      this.work(a,'harvest',2.8+rand(0,1),'Sbírá dřevo z nalezeného stromu.');return;
    }
    if(a.purpose==='berries'){
      if(!a.resource || a.resource.stock<=0){
        if(a.resource)learnOutcome(a,'berry',a.resource,0,this.seconds);
        remember(a,'Na známém místě nebyly plody');
        this.idle(a);return;
      }
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
    if(a.purpose==='eating'){
      if(this.food>0){
        this.food--;a.hunger=Math.max(0,a.hunger-76);a.mood=Math.min(100,a.mood+7);
        a.lastMeal=this.seconds;remember(a,'Najedl se ze zásob osady');
      }else{a.mood=Math.max(0,a.mood-8);remember(a,'Nenašel jídlo, když měl hlad');}
      this.idle(a);return;
    }
    if(a.purpose==='talking'){
      const meeting=this.meetings.get(a.conversation);
      if(meeting && !meeting.done){
        meeting.done=true;
        const first=this.agents[meeting.first],second=this.agents[meeting.second];
        socialBond(first,second);
        const heardA=exchangeKnowledge(second,first,this.seconds,3);
        const heardB=exchangeKnowledge(first,second,this.seconds,3);
        if(heardA.length+heardB.length){
          this.addEvent('Výměna znalostí',first.name+' a '+second.name+
            ' si předali '+(heardA.length+heardB.length)+' informací o zdrojích.','✧');
        }else{
          this.addEvent('Nové přátelství',first.name+' a '+second.name+' si popovídali a posílili svůj vztah.','♡');
        }
        this.meetings.delete(a.conversation);
      }
      a.conversation=null;this.idle(a);return;
    }
    if(a.purpose==='harvest'){
      const amount=Math.min(a.resource?.stock||0,3);if(a.resource)a.resource.stock-=amount;
      if(a.resource)learnOutcome(a,'tree',a.resource,amount,this.seconds);
      a.carry=amount;remember(a,'Nasbíral dřevo pro osadu');
      this.go(a,'returnwood',{x:0,z:0},'Nese '+amount+' jednotky dřeva do společných zásob.');return;
    }
    if(a.purpose==='forage'){
      const amount=Math.min(a.resource?.stock||0,4);if(a.resource)a.resource.stock-=amount;
      if(a.resource)learnOutcome(a,'berry',a.resource,amount,this.seconds);
      a.carry=amount;remember(a,'Nasbíral potravu pro ostatní');
      this.go(a,'returnfood',{x:0,z:0},'Nese nasbírané jídlo do společných zásob.');return;
    }
    if(a.purpose==='building' && this.construction){
      this.shelters.push({x:this.construction.x,z:this.construction.z});
      this.construction=null;remember(a,'Dokončil první přístřešek');
      this.addEvent('První přístřešek je hotový',a.name+' dokončil první stavbu bez jakéhokoli příkazu hráče.','⌂');
      this.idle(a);return;
    }
    if(a.purpose==='resting'){a.energy=Math.min(100,a.energy+68);this.idle(a);return;}
    this.idle(a);
  }
  update(dt){
    this.seconds+=dt;this.day=Math.floor(this.seconds/75)+1;
    if(this.weather.kind!=='clear' && this.seconds>=this.weather.until){
      this.weather={kind:'clear',until:0};
      this.addEvent('Počasí se uklidnilo','Krajina se vrací k běžným podmínkám.','☼');
    }
    while(this.seconds>=this.nextMeal){
      this.nextMeal+=75;
      const recovery=this.weather.kind==='rain'?6:this.weather.kind==='drought'?1:3;
      for(const b of this.berries)b.stock=Math.min(b.maxStock,b.stock+recovery);
      this.addEvent('Nový den','Začal další den. Jídlo už nespotřebovává osada hromadně: každý NPC jí podle vlastního hladu.','☼');
    }
    const night=(this.seconds%75)/75>.73;
    if(night && this.lastNightNotice!==this.day){
      this.lastNightNotice=this.day;this.addEvent('Přichází večer','Obyvatelé se postupně rozhodují, zda dokončit práci, setkat se, nebo jít odpočívat.','☾');
    }
    for(const a of this.agents){
      const discoveries=observeNearby(a,{trees:this.trees,berries:this.berries},this.seconds,7.5);
      if(discoveries.length && this.seconds-this.lastDiscoveryReport>=12){
        const kind=discoveries.some(x=>x.type==='berry')?'jedlé plody':'stromy';
        this.addEvent('Nové místo na mapě',a.name+' sám objevil '+kind+'. Informaci zatím neznají ostatní.','⌕');
        this.lastDiscoveryReport=this.seconds;
      }
      updateLife(a,dt,this.weather.kind);
      if(a.mode==='idle'){this.decide(a);continue;}
      if(a.mode==='walk' && a.target){
        const d=dist(a,a.target),step=a.speed*dt;
        if(d<=step+.3){a.x=a.target.x;a.z=a.target.z;this.arrived(a);}
        else{a.x+=(a.target.x-a.x)/d*step;a.z+=(a.target.z-a.z)/d*step;}
        a.energy=clamp(a.energy-dt*.16,0,100);
      }
      else if(a.mode==='work'){
        const wetWork=this.weather.kind==='rain' && ['harvest','forage','building'].includes(a.purpose);
        a.workRemaining-=dt*(wetWork?.78:1);
        a.energy=clamp(a.energy-dt*.55,0,100);
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
    this.ambient=new THREE.HemisphereLight('#edffff','#768b68',2.4);this.scene.add(this.ambient);
    this.clearSky=new THREE.Color('#c8dfdd');this.nightSky=new THREE.Color('#627c84');this.rainSky=new THREE.Color('#869a9b');
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
    this.addCamp();this.treeModels=[];this.addForest();this.addBerries();this.addRocksAndGrass();this.addRain();this.people=[];this.pickables=[];
    for(const agent of sim.agents){const group=this.makePerson(agent);this.scene.add(group);this.people.push(group);}
    this.shelterVisual=null;this.constructionVisual=null;this.built=0;this.timer=0;
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();
    const canvas=this.renderer.domElement;let start={x:0,y:0};
    canvas.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};});
    canvas.addEventListener('pointerup',e=>{if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>7)return;this.pointer.set((e.offsetX/canvas.clientWidth)*2-1,-(e.offsetY/canvas.clientHeight)*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);const hit=this.raycaster.intersectObjects(this.pickables,false)[0];if(hit){chooseAgent(hit.object.userData.agentId);}});
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);this.resize();
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
    for(let i=0;i<39;i++){
      const r=10+Math.sqrt(rng())*25,a=rng()*Math.PI*2,x=Math.cos(a)*r,z=Math.sin(a)*r;
      if(this.sim.trees.some(t=>Math.hypot(t.x-x,t.z-z)<1.55))continue;
      const g=new THREE.Group();g.position.set(x,terrainHeight(x,z),z);g.scale.setScalar(.44+rng()*.3);
      g.add(this.mesh(new THREE.CylinderGeometry(.13,.21,1.7,6),saplingTrunk,0,.9,0));
      g.add(this.mesh(new THREE.IcosahedronGeometry(1.18,1),leafPal[i%leafPal.length],0,2.3,0));
      this.scene.add(g);
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
    // Ground composition: mixed stone shapes instead of identical angular pebbles.
    const stone=[this.mat('#a1a99e'),this.mat('#949e96'),this.mat('#c5c2ae'),this.mat('#abb1a2')];
    for(const p of points(49,8,36)){
      const m=this.mesh(new THREE.DodecahedronGeometry(.38+rng()*.68,0),stone[Math.floor(rng()*stone.length)],p.x,terrainHeight(p.x,p.z)+.19,p.z);
      m.scale.set(1.45,.53+rng()*.2,1.07);m.rotation.y=rng()*6.28;this.scene.add(m);
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
    for(let i=0;i<18;i++){
      const p=this.sim.trees[(i*7+3)%this.sim.trees.length],a=rng()*6.28;
      const x=p.x+Math.cos(a)*2.2,z=p.z+Math.sin(a)*2.2;
      const fallen=this.mesh(new THREE.CylinderGeometry(.13,.18,1.3+rng()*.6,6),wood,x,terrainHeight(x,z)+.18,z);
      fallen.rotation.z=Math.PI/2;fallen.rotation.y=a;this.scene.add(fallen);
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
    for(const b of this.butterflies){
      const t=this.timer+b.phase;
      b.group.position.set(b.x+Math.sin(t*.9)*.85,terrainHeight(b.x,b.z)+1.1+Math.sin(t*2.2)*.34,b.z+Math.cos(t*.75)*.8);
      b.group.children[0].rotation.y=Math.sin(t*16)*.65;
      b.group.children[1].rotation.y=-Math.sin(t*16)*.65;
      b.group.rotation.y=t*.3;
    }
    this.sim.agents.forEach((a,i)=>{
      const g=this.people[i];g.position.set(a.x,terrainHeight(a.x,a.z)+.04+(a.mode==='walk'?Math.sin(this.timer*9+i)*.055:0),a.z);
      if(a.mode==='walk' && a.target){const dx=a.target.x-a.x,dz=a.target.z-a.z;if(Math.hypot(dx,dz)>.2)g.rotation.y=Math.atan2(dx,dz);}
      const walking=a.mode==='walk',working=a.mode==='work';
      const stride=walking?Math.sin(this.timer*8+i*1.3)*.47:0;
      for(let j=0;j<2;j++){
        g.userData.legs[j].rotation.x=(j===0?1:-1)*stride;
        g.userData.arms[j].rotation.x=walking?(j===0?-1:1)*stride*.7:working?Math.sin(this.timer*5+i+j*1.8)*.24:0;
      }
      g.userData.torso.rotation.z=walking?Math.sin(this.timer*8+i)*.035:a.purpose==='resting'?.10:0;
      g.userData.head.rotation.y=a.purpose==='talking'?Math.sin(this.timer*2+i)*.25:Math.sin(this.timer*.8+i)*.07;
      g.userData.hair.rotation.y=g.userData.head.rotation.y;
      g.userData.bubble.visible=a.purpose==='talking';
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
// Two real navigable page routes; transitions preserve the running simulation and WebGL instance.
function pageFromLocation(){return location.pathname.startsWith('/prehled')?'overview':'map';}
function showPage(page,push=false){
  const path=page==='overview'?'/prehled/':'/svet/';
  if(push)history.pushState({page},'',path);
  document.body.classList.toggle('page-map',page==='map');
  document.body.classList.toggle('page-overview',page==='overview');
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
  el('map-npc-name').textContent=a.name;
  const actions={wood:'Cestuje ke stromu',harvest:'Sbírá dřevo',berries:'Hledá potravu',forage:'Sbírá bobule',returnwood:'Nese dřevo',returnfood:'Nese jídlo',build:'Jde stavět',building:'Staví přístřešek',rest:'Hledá odpočinek',resting:'Odpočívá',explore:'Prozkoumává krajinu',meet:'Jde na setkání',waiting:'Čeká na přítele',talking:'Povídá si',eat:'Jde se najíst',eating:'Jí jídlo'};
  el('npc-role').textContent=actions[a.purpose]||'Rozhoduje o dalším kroku';el('npc-reason').textContent=a.reason;
  el('agent-state').textContent='ENERGIE '+Math.round(a.energy)+' %';
  el('map-npc-action').textContent=actions[a.purpose]||'Rozhoduje o dalším kroku';
  el('map-npc-reason').textContent=a.reason;
  el('npc-personality').textContent=a.personality.name;
  const stats=[['hunger',a.hunger],['social',a.socialNeed],['energy',a.energy],['mood',a.mood]];
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
    button.disabled=remaining>.01;
    button.title=remaining>0?'Další zásah za '+Math.ceil(remaining)+' herních sekund':'Změnit podmínky světa';
  }
  el('god-cooldown').textContent=remaining>0?
    'Další zásah za '+Math.ceil(remaining)+' herních sekund · lidé stále rozhodují sami':
    'Můžeš změnit podmínky světa. Každý zásah se zapíše do historie.';
}
el('btn-next-npc').addEventListener('click',()=>chooseAgent((selectedAgent+1)%sim.agents.length));
for(const button of document.querySelectorAll('[data-god]')){
  button.addEventListener('click',()=>{
    const kind=button.dataset.god;
    if(sim.miracle(kind)){
      const label=kind==='rain'?'Déšť zasáhl krajinu.':kind==='drought'?'Krajinu zasáhlo sucho.':'Úroda v krajině zesílila.';
      announce(label+' Sleduj, jak se obyvatelé zachovají.');
      renderUI();
    }else announce('Božská moc se ještě obnovuje.');
  });
}
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
  function frame(){requestAnimationFrame(frame);const delta=Math.min(clock.getDelta(),.06);const actual=paused?0:delta*speeds[speedIndex];if(actual)sim.update(actual);if(document.body.classList.contains('page-map'))world.update(delta);uiTime+=delta;if(uiTime>.28){renderUI();uiTime=0;}}
  events();renderUI();frame();
}catch(error){
  console.error('MicroWorld rendering failed',error);
  el('scene').innerHTML='<div style="display:grid;place-items:center;height:100%;background:#1f3028;color:#fff;padding:30px;text-align:center">3D vykreslování není dostupné. Ověř podporu WebGL v prohlížeči.</div>';
  events();renderUI();
}