import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';
import {MaterialWorld, RECIPES, FOOD_TYPES, ITEM_INFO} from './material-world.js';
import {initializeBiography,lifeEvent,experienceSkill,makeLifeCard} from './biography.js';
import {MaterialRenderer,BuildingRenderer} from './material-renderer.js';
import {Footpaths} from './footpaths.js';
import {FootpathRenderer} from './footpath-renderer.js';
import {decideCommunityProject} from './settlement-planner.js';
import {SocialDynamics} from './social-dynamics.js';
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
    this.seconds=0;this.day=1;this.material=new MaterialWorld();
    this.wood=0;this.stone=0;this.food=14;this.shelters=[];this.construction=null;
    this.syncStock();this.lastFireRecord=null;this.lastFireEvent=-100;
    this.paths=new Footpaths();this.lastPathReport=-100;this.lastMaterialReport=-100;
    this.nature=60;this.cooperation=80;this.messages=[];this.listeners=[];
    this.weather={kind:'clear',until:0};this.lastMiracle=-100;this.meetings=new Map();this.meetingSeq=0;this.lastNightNotice=-1;
    this.trees=points(83,13,34,0).map((p,i)=>({...p,id:i,stock:9,maxStock:9}));
    this.berries=points(28,8,32).map((p,i)=>({...p,id:i,stock:10,maxStock:10}));
    this.stones=points(21,14,32).map((p,i)=>({...p,id:i,stock:10,maxStock:10}));
    this.apples=points(12,14,32).map((p,i)=>({...p,id:i,stock:9,maxStock:9}));
    this.agents=names.map((name,i)=>initializeBiography(initCognition(initializeLife({id:i,name,x:rand(-2.8,2.8),z:rand(-2.8,2.8),energy:75+rand(0,20),mode:'idle',purpose:'',reason:'Rozhlíží se po novém světě.',target:null,resource:null,carry:0,carryType:null,workRemaining:0,workTotal:0,choiceAt:0,speed:2+rand(0,.55),color:colors[i]},i)),i));
    this.social=new SocialDynamics();
    for(const agent of this.agents)this.social.initialize(agent);
    this.lastDiscoveryReport=-100;
    this.nextMeal=75;this.lastScout=-999;this.addEvent('Nový začátek','Šest obyvatel dorazilo do neznámé krajiny.','✧');
    this.addEvent('První rozhodnutí','Obyvatelé sami zjišťují, co potřebují k přežití.','◈');
  }
  syncStock(){
    this.wood=this.material.count('wood');this.stone=this.material.count('stone');
    this.food=this.material.foodCount();this.seeds=this.material.count('seed');
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
  startConstructionTrip(a){
    const project=this.construction;
    if(!project)return;
    if(this.material.projectReady(project.id)){
      project.phase='building';
      this.go(a,'build',project,
        'Všechny skutečné polena a kameny už dorazily na staveniště. Může začít stavět.');
      return;
    }
    const pending=this.material.pendingProject(project.id,4);
    if(!pending.length){
      a.choiceAt=this.seconds+1.5;return;
    }
    const source=this.material.containers.get(pending[0].container);
    const ids=pending.filter(i=>i.container===source.id).map(i=>i.id);
    this.go(a,'pickupBuild',source,
      'Jde na skutečnou hromadu nabrat '+ids.length+' kusů materiálu.',{
        projectId:project.id,ids
      });
  }
  decide(a){
    if(this.seconds<a.choiceAt)return;
    this.syncStock();
    // A frustrated citizen may voluntarily leave a settlement and live in a tent.
    // This is a real physical trip with wood and food carried from separate storages.
    if(a.social?.status==='camping'){
      const camp=a.social.site;
      if(this.social.shouldReturn(a,this.seconds)){
        if(this.social.beginReturn(a,this.seconds)){
          this.material.packTentReturn(a,a.social.habitat);
          a.carry=this.material.cargo(a).length;a.carryType='berry';
          this.go(a,'returnHome',{x:0,z:0},
            'Po čase o samotě se rozhodl vrátit do původní osady.');
          return;
        }
      }
      if(this.material.foodAtTent(a.social.habitat)>0&&a.hunger>53){
        this.go(a,'tentEat',{x:camp.x,z:camp.z},
          'Má vlastní jídlo v táboře a rozhodl se najíst.');return;
      }
      this.go(a,'campWander',{x:camp.x+rand(-1.6,1.6),z:camp.z+rand(-1.6,1.6)},
        'Chce být nějaký čas sám. Odpočívá a přemýšlí v táboře.');return;
    }
    if(a.social?.status==='resident'&&!this.construction){
      const place=this.social.canLeave(a,{
        day:this.day,time:this.seconds,wood:this.wood,food:this.food,height:terrainHeight
      });
      if(place&&this.social.beginDeparture(a,place,this.seconds)){
        this.addEvent('Rozhodnutí odejít',
          a.name+' je dlouhodobě nespokojený. Rozhodl se na čas opustit osadu.','↗');
        lifeEvent(a,this.day,'Rozhodl se odejít',
          'Osobní nespokojenost '+Math.round(a.social.frustration)+' %.');
        this.go(a,'departWood',this.material.containers.get('woodpile'),
          'Bere si vlastní skutečné dřevo na přístřešek.');return;
      }
    }
    const need=needsDecision(a,this.food);
    if(need==='eat'){
      this.go(a,'eat',{x:rand(-2,2),z:rand(-2,2)},'Má hlad ('+Math.round(a.hunger)+' %) a jde se samostatně najíst.');return;
    }
    const dark=(this.seconds%75)/75>.72 || (this.seconds%75)/75<.11;
    if(need==='rest'||(dark && a.energy<76)){
      this.go(a,'rest',{x:rand(-3,3),z:rand(-3,3)},dark?'Je noc a chce se vyspat.':'Je unavený a potřebuje odpočinek.');return;
    }
    if(need==='social' && this.seekConversation(a))return;
    // Construction is requested by needs, the site is chosen from actual terrain
    // and personally explored places, never from a hardcoded list.
    if(!this.construction){
      const knownSites=a.cognition.visited;
      const mood=this.agents.reduce((n,p)=>n+p.mood,0)/this.agents.length;
      const proposal=decideCommunityProject(this.material,{
        population:this.agents.length,averageMood:mood,
        buildings:this.material.structures,height:terrainHeight,
        paths:this.paths,known:knownSites,
        obstacles:[...this.trees.map(p=>({...p})),...this.stones.map(p=>({...p}))]
      });
      if(proposal){
        const project=this.material.createProject(proposal.recipe,{
          type:proposal.type,x:proposal.x,z:proposal.z,builderId:a.id,time:this.seconds
        });
        if(project){
          this.construction={...project,agentId:a.id,progress:0,phase:'hauling'};
          this.syncStock();
          this.addEvent('Nová autonomní stavba',a.name+' vybral místo pro '+proposal.recipe.name+
            '. Nejdříve musí fyzicky přepravit '+project.total+' kusů materiálu.','⌂');
          lifeEvent(a,this.day,'Navrhl '+proposal.recipe.name,proposal.reason);
          this.startConstructionTrip(a);
          return;
        }
      }
    }
    if(this.construction && this.construction.agentId===a.id){
      this.startConstructionTrip(a);return;
    }
    if(this.construction && this.material.projectReady(this.construction.id) &&
      !this.construction.assistantId && a.id!==this.construction.agentId&&a.energy>42 &&
      Math.random()<.22){
      this.construction.assistantId=a.id;
      this.go(a,'assistBuild',this.construction,'Dobrovolně pomáhá se společnou stavbou.');return;
    }
    // Covered warehouse generates real hauling jobs to relocate exposed wood.
    if(!this.construction && this.material.nearestRoofedStore() && Math.random()<.28){
      const move=this.material.planStockTransfer(4);
      if(move){
        this.go(a,'pickupStore',move.source,
          'Chce přenést '+move.ids.length+' věcí z nekrytého skladu pod střechu.',move);
        return;
      }
    }
    // Material needs and farming precede optional work.
    if(this.material.count('twig')>=5&&!this.material.baskets.length){
      this.go(a,'weave',{x:2.8,z:2.4},
        'Proutí lze splést do košíku, aby šlo potraviny bezpečně uskladnit.');return;
    }
    const farm=this.material.fields[0];
    if(farm && !farm.planted && this.seeds>=1){
      this.go(a,'plant',{x:farm.x,z:farm.z},
        'Našel semena, připravené pole a chce je vysít.');return;
    }
    if(farm && farm.planted && farm.growth>=1){
      this.go(a,'reap',{x:farm.x,z:farm.z},
        'Úroda na poli dozrála. Rozhodl se ji sklidit.');return;
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
    const knownStone=chooseKnownResource(a,'stone',this.seconds);
    const knownApple=chooseKnownResource(a,'apple',this.seconds);
    const goKnown=(kind,remembered,reason)=>{
      if(!remembered)return false;
      const type=kind==='berries'?'berry':kind==='stone'?'stone':kind==='apples'?'apple':'tree';
      const sources={berry:this.berries,tree:this.trees,stone:this.stones,apple:this.apples};
      const actual=sources[type].find(p=>p.id===remembered.id);
      if(!actual)return false;
      const source=remembered.origin==='heard'?'z vyprávění '+remembered.from:'z vlastního pozorování';
      this.go(a,kind,{x:remembered.x,z:remembered.z},reason+' O místě ví '+source+'.',actual);
      return true;
    };
    if(knownApple && (this.food<30 || Math.random()<.22)){
      if(goKnown('apples',knownApple,'Chce nasbírat jablka z nalezené jabloně.'))return;
    }
    if(this.material.structures.some(b=>b.type==='house') && this.stone<18 && knownStone){
      if(goKnown('stone',knownStone,'Osada potřebuje kámen na skladiště a hospodářské budovy.'))return;
    }
    if((gatherFood || (a.hunger>=70 && this.food===0)) && knownBerry){
      if(goKnown('berries',knownBerry,'Osada potřebuje potravu. Vybral známé místo se zdrojem.'))return;
    }
    if(knownTree && (this.shelters.length===0 || (this.wood<5 && Math.random()*100>this.nature/2) || (this.nature<70 && (this.wood<25 || Math.random()*100>this.nature)))){
      if(goKnown('wood',knownTree,'Potřebuje stavební materiál a vybavil si známý strom.'))return;
    }
    if(knownBerry && goKnown('berries',knownBerry,'Zvolil šetrný sběr ze známého naleziště.'))return;
    if(knownStone && this.stone<26 && goKnown('stone',knownStone,'Potřebuje kámen na stavbu.'))return;
    if(knownTree && this.wood<38 && goKnown('wood',knownTree,'Zvolil již objevený strom.'))return;
    this.go(a,'explore',chooseExplorationTarget(a,this.seconds),
      'Nezná žádný vhodný aktuální zdroj. Nejdřív musí oblast sám prozkoumat.');
  }
  arrived(a){
    if(a.purpose==='departWood'){
      if(this.material.packDepartureWood(a)){
        a.carry=this.material.cargo(a).length;a.carryType='wood';
        this.go(a,'departFood',this.material.containers.get('crate-1'),
          'Jde osobně pro jídlo, které si odnese do nového tábora.');return;
      }
      a.social.status='resident';this.idle(a);return;
    }
    if(a.purpose==='departFood'){
      if(this.material.packDepartureFood(a)){
        a.carry=this.material.cargo(a).length;
        a.social.status='travelling';
        this.go(a,'departCamp',a.social.site,
          'Nese vlastní dřevo a potraviny na místo, které sám objevil.');return;
      }
      this.material.cancelDeparture(a);a.carry=0;a.social.status='resident';this.idle(a);return;
    }
    if(a.purpose==='departCamp'){
      const tent=this.material.pitchTent(a,a.social.site,this.seconds);
      if(tent&&this.social.establishCamp(a,tent,this.seconds)){
        a.carry=0;a.carryType=null;
        a.profile.settlement='Samostatný tábor';
        a.profile.departures++;
        a.profile.home=tent.id;
        lifeEvent(a,this.day,'Postavil si stan',
          'Vlastními silami se přestěhoval na okraj známého světa.');
        this.addEvent('Osamělý tábor',
          a.name+' donesl dřevo a jídlo, postavil stan a začal žít stranou.','⛺');
      }else{
        a.social.status='resident';this.material.cancelDeparture(a);
      }
      this.idle(a);return;
    }
    if(a.purpose==='returnHome'){
      const n=this.material.deliver(a);
      this.social.arrivedHome(a,this.seconds);
      a.profile.settlement='První osada';a.profile.home=null;
      a.carry=0;a.carryType=null;
      lifeEvent(a,this.day,'Vrátil se do osady',
        'Po čase v samostatném táboře se rozhodl znovu připojit ke komunitě.');
      this.addEvent('Návrat domů',
        a.name+' se vrátil do původní osady. Přinesl '+n+' zbývajících zásob.','↩');
      this.idle(a);return;
    }
    if(a.purpose==='tentEat'){
      if(this.material.eatAtTent(a,a.social.habitat)){
        a.hunger=Math.max(0,a.hunger-69);
        remember(a,'Najedl se z vlastních zásob v táboře');
      }
      this.idle(a);return;
    }
    if(a.purpose==='campWander'){
      this.work(a,'campLiving',6,
        'Tráví čas o samotě, odpočívá a přemýšlí o návratu.');return;
    }
    if(a.purpose==='pickupBuild'){
      const order=a.resource;
      if(order&&this.material.pickProjectLoad(a,order.projectId,order.ids)){
        const project=this.construction;
        a.carry=this.material.cargo(a).length;a.carryType='wood';
        this.go(a,'deliverBuild',project,'Nese stavební materiál na vybrané staveniště.',
          {projectId:project.id});return;
      }
      this.idle(a);return;
    }
    if(a.purpose==='deliverBuild'){
      const project=this.construction;
      if(project){
        const n=this.material.depositProjectLoad(a,project.id);
        a.carry=0;a.carryType=null;
        this.addEvent('Stavební materiál dopraven',
          a.name+' donesl '+n+' skutečné předměty. Na staveništi je '+
          project.delivered+' / '+project.total+'.','◧');
      }
      this.idle(a);return;
    }
    if(a.purpose==='pickupStore'){
      const order=a.resource;
      if(order&&this.material.pickupStorage(a,order.ids)){
        a.carry=this.material.cargo(a).length;a.carryType='wood';
        this.go(a,'deliverStore',order.destination,
          'Nese zásoby pod střechu, aby se nekazily a nepromokaly.',
          {destination:order.destination.id});return;
      }
      this.idle(a);return;
    }
    if(a.purpose==='deliverStore'){
      const order=a.resource,n=this.material.deliver(a,order.destination);
      a.carry=0;a.carryType=null;this.syncStock();
      if(n&&this.seconds-this.lastMaterialReport>8){
        this.lastMaterialReport=this.seconds;
        this.addEvent('Přesun do skladiště',
          a.name+' fyzicky přenesl '+n+' položky pod střechu.','▣');
      }
      this.idle(a);return;
    }
    if(a.purpose==='assistBuild'){
      this.work(a,'assisting',7,'Pomáhá druhému obyvateli dokončit společnou stavbu.');return;
    }
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
    if(a.purpose==='weave'){this.work(a,'weaving',6,
      'Plete košík z nasbíraného proutí.');return;}
    if(a.purpose==='plant'){this.work(a,'planting',6,
      'Vysévá skutečná nalezená semínka do připraveného pole.');return;}
    if(a.purpose==='reap'){this.work(a,'reaping',7,
      'Sklízí dozrálé obilí a sbírá nové osivo.');return;}
    if(a.purpose==='stone'||a.purpose==='apples'){
      const type=a.purpose==='stone'?'stone':'apple';
      if(!a.resource||a.resource.stock<=0){
        if(a.resource)learnOutcome(a,type,a.resource,0,this.seconds);
        this.idle(a);return;
      }
      this.work(a,type==='stone'?'mining':'applepicking',type==='stone'?7:4,
        type==='stone'?'Uvolňuje kámen z nalezeného ložiska.':'Sbírá jablka ze stromu.');return;
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
      this.material.deliver(a);
      experienceSkill(a,'wood',a.carry);
      a.twigsCarry=0;a.carry=0;a.carryType=null;this.syncStock();this.idle(a);
      if(this.wood>=12&&!this.shelters.length&&!this.construction)this.addEvent(
        'Dostatek dřeva','V hromadě je dost polen pro první dům.','♣');
      return;
    }
    if(a.purpose==='returnfood'){
      this.material.deliver(a);
      a.carry=0;a.carryType=null;a.seedsCarry=0;this.syncStock();this.idle(a);return;
    }
    if(a.purpose==='returnstone'){
      this.material.deliver(a);
      experienceSkill(a,'stone',a.carry);
      a.carry=0;a.carryType=null;this.syncStock();this.idle(a);return;
    }
    if(a.purpose==='build'){
      this.work(a,'building',14,
        'Staví '+(RECIPES[this.construction?.type]?.name||'budovu')+' z nasbíraného materiálu.');return;
    }
    if(a.purpose==='rest'){this.work(a,'resting',6,'Odpočívá po práci v blízkosti osady.');return;}
    if(a.purpose==='explore'){if(this.seconds-this.lastScout>15){this.addEvent('Průzkum okolí',a.name+' prozkoumal další kus krajiny.','⌕');this.lastScout=this.seconds;}this.idle(a);}
  }
  completed(a){
    if(a.purpose==='campLiving'){
      a.energy=clamp(a.energy+17,0,100);
      a.mood=clamp(a.mood+1.5,0,100);
      this.idle(a);return;
    }
    if(a.purpose==='eating'){
      if(this.material.consumeFood()){
        this.syncStock();a.hunger=Math.max(0,a.hunger-76);a.mood=Math.min(100,a.mood+7);
        a.lastMeal=this.seconds;remember(a,'Najedl se ze zásob osady');
      }else{a.mood=Math.max(0,a.mood-8);remember(a,'Nenašel jídlo, když měl hlad');}
      this.idle(a);return;
    }
    if(a.purpose==='talking'){
      const meeting=this.meetings.get(a.conversation);
      if(meeting && !meeting.done){
        meeting.done=true;
        const first=this.agents[meeting.first],second=this.agents[meeting.second];
        const conflict=(first.social?.frustration>63||second.social?.frustration>63)&&
          this.social.markConflict(first,second,this.seconds);
        if(conflict){
          lifeEvent(first,this.day,'Spor s '+second.name,'Neshodli se při rozhovoru.');
          lifeEvent(second,this.day,'Spor s '+first.name,'Neshodli se při rozhovoru.');
          this.addEvent('Osobní konflikt',
            first.name+' a '+second.name+' se nepohodli. Jejich vzájemná důvěra klesla.','⚡');
        }else{
          socialBond(first,second);
          first.social.frustration=Math.max(0,first.social.frustration-8);
          second.social.frustration=Math.max(0,second.social.frustration-8);
          lifeEvent(first,this.day,'Rozhovor s '+second.name,'Prohloubili svůj vztah.');
          lifeEvent(second,this.day,'Rozhovor s '+first.name,'Prohloubili svůj vztah.');
        }
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
      a.carry=amount;a.carryType='wood';a.twigsCarry=amount?1:0;
      this.material.collect(a,'wood',amount,{origin:'tree:'+a.resource?.id,time:this.seconds});
      if(amount)this.material.collect(a,'twig',1,{origin:'tree:'+a.resource?.id,time:this.seconds});
      remember(a,'Nasbíral dřevo a proutí pro osadu');
      this.go(a,'returnwood',{x:0,z:0},'Nese '+amount+' jednotky dřeva do společných zásob.');return;
    }
    if(a.purpose==='forage'){
      const amount=Math.min(a.resource?.stock||0,4);if(a.resource)a.resource.stock-=amount;
      if(a.resource)learnOutcome(a,'berry',a.resource,amount,this.seconds);
      a.carry=amount;a.carryType='berry';a.seedsCarry=amount?1:0;
      this.material.collect(a,'berry',amount,{origin:'berry:'+a.resource?.id,time:this.seconds});
      if(amount)this.material.collect(a,'seed',1,{origin:'berry:'+a.resource?.id,time:this.seconds});
      remember(a,'Nasbíral bobule a nalezl semínka');
      this.go(a,'returnfood',{x:0,z:0},'Nese nasbírané jídlo do společných zásob.');return;
    }
    if(a.purpose==='mining'||a.purpose==='applepicking'){
      const type=a.purpose==='mining'?'stone':'apple';
      const amount=Math.min(a.resource?.stock||0,type==='stone'?3:4);
      if(a.resource)a.resource.stock-=amount;
      if(a.resource)learnOutcome(a,type,a.resource,amount,this.seconds);
      a.carry=amount;a.carryType=type;
      this.material.collect(a,type,amount,{origin:type+':'+a.resource?.id,time:this.seconds});
      this.go(a,type==='stone'?'returnstone':'returnfood',{x:0,z:0},
        'Nese '+amount+' kusy '+(type==='stone'?'kamene':'jablek')+' do skladu.');return;
    }
    if(a.purpose==='weaving'){
      const basket=this.material.craftBasket(a.id);
      if(basket){
        experienceSkill(a,'craft',8);
        lifeEvent(a,this.day,'Upletl košík','Použil pět jednotek proutí.');
        this.addEvent('Ručně vyrobený košík',a.name+' upletl košík. Nové ovoce se do něj bude ukládat.','⌑');
      }
      this.idle(a);return;
    }
    if(a.purpose==='planting'){
      const field=this.material.fields[0];
      if(field&&this.material.plant(field.id,this.seconds)){
        experienceSkill(a,'farm',3);
        lifeEvent(a,this.day,'Zasel první pole','Použil semena získaná v přírodě.');
        this.addEvent('Zaseté pole',a.name+' skutečně spotřeboval semínko a založil úrodu.','✿');
      }
      this.syncStock();this.idle(a);return;
    }
    if(a.purpose==='reaping'){
      const field=this.material.fields[0],result=field&&this.material.harvest(field.id);
      if(result){
        experienceSkill(a,'farm',7);
        lifeEvent(a,this.day,'Sklidil pole',result.berries+' porcí bobulí a '+result.seeds+' semen.');
        this.addEvent('Sklizeň úrody',a.name+' sklidil '+result.berries+' porcí bobulí a nová semena.','❀');
      }
      this.syncStock();this.idle(a);return;
    }
    if(a.purpose==='assisting'){
      if(this.construction){
        this.construction.extraProgress=Math.min(5,(this.construction.extraProgress||0)+1);
        lifeEvent(a,this.day,'Pomáhal na společné stavbě','Přidal práci k budově.');
      }
      this.idle(a);return;
    }
    if(a.purpose==='building' && this.construction){
      if(!this.material.projectReady(this.construction.id)){
        this.idle(a);return;
      }
      const completed={...this.construction},type=completed.type;
      if(!this.material.finalizeProject(completed.id)){this.idle(a);return;}
      const building=this.material.addStructure(type,completed.x,completed.z,a.id,this.seconds);
      if(completed.assistantId!==undefined){
        const partner=this.agents[completed.assistantId];
        if(partner)lifeEvent(partner,this.day,'Společně dokončil '+RECIPES[type].name,
          'Pomáhal staviteli '+a.name+'.');
      }
      if(type==='house')this.shelters.push({x:completed.x,z:completed.z,type});
      this.construction=null;
      experienceSkill(a,'wood',4);
      a.profile.occupation='Stavitel';
      if(type==='house'&&!a.profile.home)a.profile.home=building.id;
      lifeEvent(a,this.day,'Dokončil '+RECIPES[type].name,'Stavbu zaplatila osada svými zásobami.');
      remember(a,'Dokončil '+RECIPES[type].name);
      this.addEvent('Dokončená stavba',a.name+' bez příkazu hráče dokončil '+RECIPES[type].name+'.','⌂');
      this.idle(a);return;
    }
    if(a.purpose==='resting'){a.energy=Math.min(100,a.energy+68);this.idle(a);return;}
    this.idle(a);
  }
  update(dt){
    this.seconds+=dt;this.day=Math.floor(this.seconds/75)+1;
    this.material.tick(dt,this.weather.kind);
    if(this.seconds-this.lastPathReport>30){
      const trailStats=this.paths.summary();
      if(trailStats.established<9){this.lastPathReport=this.seconds;}else{
      this.lastPathReport=this.seconds;
      this.addEvent('Vznikají vyšlapané pěšiny',
        'Opakovaný pohyb obyvatel už vytvořil '+trailStats.established+
        ' viditelných částí cesty. Nikdo ji nekreslil ručně.','⌁');
      }
    }
    const fuel=(this.material.structures.length||this.material.count('wood')>17)?
      this.material.burnWood(this.seconds,this.weather.kind):null;
    if(fuel&&this.seconds-this.lastFireEvent>12){
      this.lastFireEvent=this.seconds;
      this.addEvent('Vlastnosti paliva',
        (fuel.roof?'Kryté':'Nekryté')+' poleno s vlhkostí '+Math.round(fuel.wet*100)+
        ' % poskytlo '+fuel.heat+' % využitelného tepla.','♨');
    }
    this.syncStock();
    if(this.weather.kind!=='clear' && this.seconds>=this.weather.until){
      this.weather={kind:'clear',until:0};
      this.addEvent('Počasí se uklidnilo','Krajina se vrací k běžným podmínkám.','☼');
    }
    while(this.seconds>=this.nextMeal){
      this.nextMeal+=75;
      const recovery=this.weather.kind==='rain'?6:this.weather.kind==='drought'?1:3;
      for(const b of this.berries)b.stock=Math.min(b.maxStock,b.stock+recovery);
      for(const apple of this.apples)apple.stock=Math.min(apple.maxStock,apple.stock+(recovery>3?2:1));
      this.addEvent('Nový den','Začal další den. Jídlo už nespotřebovává osada hromadně: každý NPC jí podle vlastního hladu.','☼');
    }
    const night=(this.seconds%75)/75>.73;
    if(night && this.lastNightNotice!==this.day){
      this.lastNightNotice=this.day;this.addEvent('Přichází večer','Obyvatelé se postupně rozhodují, zda dokončit práci, setkat se, nebo jít odpočívat.','☾');
    }
    for(const a of this.agents){
      const discoveries=observeNearby(a,{trees:this.trees,berries:this.berries,stones:this.stones,apples:this.apples},this.seconds,7.5);
      if(discoveries.length && this.seconds-this.lastDiscoveryReport>=12){
        const kind=discoveries.some(x=>x.type==='berry')?'jedlé plody':'stromy';
        this.addEvent('Nové místo na mapě',a.name+' sám objevil '+kind+'. Informaci zatím neznají ostatní.','⌕');
        this.lastDiscoveryReport=this.seconds;
      }
      updateLife(a,dt,this.weather.kind);
      this.social.tick(a,dt,{
        weather:this.weather.kind,houseCount:this.material.structures.filter(b=>b.type==='house').length,
        food:this.food,day:this.day
      });
      if(a.mode==='idle'){this.decide(a);continue;}
      if(a.mode==='walk' && a.target){
        const d=dist(a,a.target),step=a.speed*dt;
        const before={x:a.x,z:a.z};
        if(d<=step+.3){a.x=a.target.x;a.z=a.target.z;}
        else{a.x+=(a.target.x-a.x)/d*step;a.z+=(a.target.z-a.z)/d*step;}
        this.paths.recordMotion(before,a,this.weather.kind);
        this.material.moveCarrier(a);
        if(d<=step+.3)this.arrived(a);
        a.energy=clamp(a.energy-dt*.16,0,100);
      }
      else if(a.mode==='work'){
        const wetWork=this.weather.kind==='rain' && ['harvest','forage','building'].includes(a.purpose);
        a.workRemaining-=dt*(wetWork?.78:1);
        a.energy=clamp(a.energy-dt*.55,0,100);
        if(a.purpose==='building'&&this.construction){
          const helpers=this.agents.filter(p=>p.purpose==='assisting').length;
          const ratio=clamp(1-a.workRemaining/a.workTotal,0,1);
          this.construction.progress=Math.min(1,ratio+(this.construction.extraProgress||0)*.03);
        }
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
    this.addCamp();this.treeModels=[];this.addForest();this.addBerries();
    this.addRocksAndGrass();this.addDeposits();this.addRain();
    this.pathVisuals=new FootpathRenderer(this.scene,terrainHeight);
    this.inventoryVisuals=new MaterialRenderer(this.scene,terrainHeight);
    this.buildingVisuals=new BuildingRenderer(this.scene,terrainHeight);
    this.inventoryVisuals.sync(sim.material);
    this.people=[];this.pickables=[];
    for(const agent of sim.agents){const group=this.makePerson(agent);this.scene.add(group);this.people.push(group);}
    this.shelterVisual=null;this.constructionVisual=null;this.built=0;this.timer=0;
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();
    const canvas=this.renderer.domElement;let start={x:0,y:0};
    canvas.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};});
    canvas.addEventListener('pointerup',e=>{if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>7)return;this.pointer.set((e.offsetX/canvas.clientWidth)*2-1,-(e.offsetY/canvas.clientHeight)*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);const hit=this.raycaster.intersectObjects(this.pickables,false)[0];if(hit){chooseAgent(hit.object.userData.agentId);}});
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);this.resize();
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
    const carried=new THREE.Group();carried.position.set(.52,1.02,.15);
    const carryColors={wood:'#936544',stone:'#929d9b',apple:'#cb654e',berry:'#5b6b9c'};
    for(let i=0;i<5;i++){
      const mesh=this.mesh(new THREE.DodecahedronGeometry(.13,0),this.mat('#95694d'),(i%2)*.2,Math.floor(i/2)*.19,0);
      mesh.visible=false;carried.add(mesh);
    }
    g.add(carried);g.userData.carried=carried;g.userData.carryColors=carryColors;
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
      for(let k=0;k<g.userData.carried.children.length;k++){
        const item=g.userData.carried.children[k];
        item.visible=false; // Individually tracked cargo has visible meshes in MaterialRenderer.
        item.material.color.set(g.userData.carryColors[a.carryType]||'#b49b73');
      }
    });
    for(const tree of this.treeModels)if(tree.resource.stock<=0 && tree.model.scale.y>.32)tree.model.scale.y=.32;
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
    this.controls.update();this.renderer.render(this.scene,this.camera);
  }
  resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);}
}
let selectedAgent=0;
const sim=new Civilization();
let world;
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
  const xToScreen=x=>w/2+x*scale, zToScreen=z=>h/2+z*scale;
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
  ctx.fillStyle='#e8c88c';ctx.font='11px sans-serif';ctx.fillText('Tábor',xToScreen(0)+9,zToScreen(0)-7);
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
  if(!list.dataset.ready){
    list.dataset.ready='yes';
    for(const person of sim.agents){
      const button=document.createElement('button');button.type='button';
      button.className='citizen-option';button.dataset.person=person.id;
      const icon=document.createElement('span');icon.className='avatar';icon.textContent=person.name[0];
      const caption=document.createElement('span');caption.className='citizen-option-label';
      const name=document.createElement('strong');name.textContent=person.profile.fullName;
      const role=document.createElement('small');role.textContent=person.profile.origin;
      caption.append(name,role);button.append(icon,caption);
      button.addEventListener('click',()=>{chooseAgent(person.id);renderLifePage();});
      list.append(button);
    }
  }
  el('people-day').textContent='Den '+sim.day;
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
    pickupBuild:'Nabírá stavební materiál',deliverBuild:'Nese materiál na stavbu',
    pickupStore:'Přebírá zásoby',deliverStore:'Stěhuje zásoby do skladiště',
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
  el('people').textContent=sim.agents.length;el('wood').textContent=sim.wood;el('food').textContent=sim.food;
  el('m-people').textContent=sim.agents.length;el('m-wood').textContent=sim.wood;el('m-food').textContent=sim.food;
  el('day').textContent='Den '+sim.day;
  if(document.body.classList.contains('page-map')){
    if(el('map-trails'))el('map-trails').textContent=sim.paths.summary().trails;
    if(el('map-hauls'))el('map-hauls').textContent=sim.material.logistics.constructionDeliveries;
  }
  if(document.body.classList.contains('page-overview'))renderMaterialLedger();
  renderLifePage();
  const building=!!sim.construction,done=sim.material.structures.length>0;
  el('stage-tag').textContent=done?'PRVNÍ DOMOV':building?'VÝSTAVBA':'PRŮZKUM';
  el('stage-title').textContent=building?'Staví: '+RECIPES[sim.construction.type].name:
    done?'Osada roste vlastními silami':'Hledání místa k životu';
  el('stage-description').textContent=building?'Obyvatelé opravdu spotřebovali materiál a právě z něj stavějí.':
    done?'Obyvatelé sami rozšiřují osadu. Zásoby, materiály a budovy jsou fyzicky evidované.':
    'Obyvatelé hledají dřevo, kámen, jídlo, semena a další materiály.';
  el('progress-name').textContent=building?'Postup stavby':done?'Hotové budovy':'Materiál na první dům';
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