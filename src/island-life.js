/** MW-011 — autonomous sea exploration. No renderer, browser or clock APIs.
 * Each crossing is physically stepped through a dangerous water corridor.
 * Shipbuilding consumes real item IDs transported by the builder to the shore.
 */
import {isDependent,isLiving} from './generations.js';
import {chooseKnownResource,chooseExplorationTarget,episode} from './cognition.js';
import {lifeEvent,experienceSkill} from './biography.js';

export const FAR_CENTER=Object.freeze({x:86,z:0});
export const HOME_PIER=Object.freeze({x:39,z:0});
export const FAR_PIER=Object.freeze({x:70,z:0});
export const SHIP_RECIPES=Object.freeze({
  raft:Object.freeze({wood:5,stone:0,speed:.92,protection:.35}),
  boat:Object.freeze({wood:9,stone:2,speed:1.75,protection:.78})
});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export function islandOf(point){return point.x>=59?'far':'home';}
export function forbidsWalkingAcrossSea(from,target){
  return islandOf(from)!==islandOf(target);
}
function knowledge(agent){
  if(!agent.cognition.islands)agent.cognition.islands={};
  if(!agent.cognition.technologies)agent.cognition.technologies={};
  return agent.cognition;
}
function availableIn(world,container,type,count){
  return world.material.items.filter(i=>i.container===container&&i.type===type&&world.material.isAvailable(i)).slice(0,count);
}
function availableVessel(world,side){
  return world.islands.vessels.find(v=>v.side===side&&!v.inUse);
}
function localSources(world,type){
  return ({berry:world.berries,tree:world.trees,stone:world.stones,apple:world.apples,spring:world.springs})[type]
    .filter(s=>islandOf(s)==='far');
}
export function initializeIslands(world){
  if(world.islands)return world.islands;
  const spots=[[-10,-5],[-8,9],[-3,-12],[0,11],[8,-6],[12,4],[-14,2],[4,3]];
  for(let i=0;i<spots.length;i++){
    const [dx,dz]=spots[i],x=FAR_CENTER.x+dx,z=dz;
    world.trees.push({id:1000+i,x,z,stock:8,maxStock:8});
    if(i<6)world.berries.push({id:1000+i,x:x+1.8,z:z-1,stock:9,maxStock:9});
    if(i<5)world.stones.push({id:1000+i,x:x-1.5,z:z+1.2,stock:8,maxStock:8});
    if(i<3)world.apples.push({id:1000+i,x:x+2.1,z:z+1.6,stock:7,maxStock:7});
  }
  world.springs.push({id:'spring-far',x:88,z:-3,name:'Pramen druhého ostrova',stock:18,maxStock:25});
  world.material.containers.set('far-cache',{
    id:'far-cache',kind:'crate',name:'Zásoby druhého ostrova',x:85,z:0,roof:false
  });
  world.material.containers.set('shore-yard',{
    id:'shore-yard',kind:'pile',name:'Rozestavěná plavidla',x:HOME_PIER.x,z:HOME_PIER.z,roof:false
  });
  world.islands={
    discoveredBy:[],crossings:0,returns:0,attacks:0,losses:0,
    nextVesselId:1,vessels:[],
    predators:[
      {id:1,x:49,z:2,anchorX:49,anchorZ:2,hunger:62,lastAttack:-100},
      {id:2,x:55,z:-2,anchorX:55,anchorZ:-2,hunger:77,lastAttack:-100},
      {id:3,x:61,z:4,anchorX:61,anchorZ:4,hunger:48,lastAttack:-100}
    ],fish:35
  };
  return world.islands;
}
export function discoverFarShore(world,agent){
  if(distance(agent,HOME_PIER)>9)return false;
  const c=knowledge(agent);
  if(c.islands.far?.seen)return false;
  c.islands.far={seen:true,origin:'seen',day:world.day,x:FAR_CENTER.x,z:FAR_CENTER.z};
  if(!world.islands.discoveredBy.includes(agent.id))world.islands.discoveredBy.push(agent.id);
  lifeEvent(agent,world.day,'Spatřil druhý ostrov','Z pobřeží pozoroval vzdálenou pevninu.');
  episode(agent,{time:world.seconds,title:'Objevil protější ostrov',
    cause:'Sám došel k pobřeží a zahlédl pevninu za mořem.',
    outcome:'Musí vymyslet bezpečný způsob přepravy.',category:'discovery'});
  world.addEvent('Nový ostrov',agent.name+' spatřil za mořem dosud neprozkoumanou pevninu.','⌕');
  return true;
}
function canTravel(world,agent,side){
  return isLiving(agent)&&!isDependent(agent)&&agent.energy>=64&&agent.thirst<58&&
    agent.hunger<65&&(agent.health??100)>48&&agent.social?.status==='resident'&&
    (side==='far'||knowledge(agent).islands.far?.seen);
}
/** Called only after life/food/childcare checks. Nobody receives direct commands. */
export function considerCoast(world,agent){
  const c=knowledge(agent),side=islandOf(agent);
  if(side==='far')return considerFarIsland(world,agent);
  if(!canTravel(world,agent,'home')||world.day<3||world.random()>.047)return false;
  if(!c.islands.far?.seen){
    if(agent.personality.curiosity<55)return false;
    return world.go(agent,'scoutCoast',HOME_PIER,'Ze zvědavosti se vydává hledat další pobřeží.');
  }
  let vessel=availableVessel(world,'home');
  if(vessel){
    return world.go(agent,'boardVoyage',HOME_PIER,'Rozhodl se pro vlastní výpravu za moře.',{side:'home',vesselId:vessel.id});
  }
  if(agent.energy>84&&agent.personality.curiosity>=82&&agent.profile.skills.exploration>=4&&world.random()<.09){
    return world.go(agent,'boardVoyage',HOME_PIER,'Riskuje cestu plaváním, protože nemá plavidlo.',{side:'home',vesselId:null});
  }
  if(!c.technologies.raft){
    if(agent.personality.curiosity>58&&world.material.count('wood')>=SHIP_RECIPES.raft.wood)
      return world.go(agent,'studyVessel',HOME_PIER,'Zkoumá, jak překonat vodu pomocí dřeva.',{type:'raft'});
    return false;
  }
  const type=c.technologies.boat&&world.material.count('wood')>=9&&world.material.count('stone')>=2?'boat':'raft';
  if(world.material.count('wood')<SHIP_RECIPES[type].wood||
     world.material.count('stone')<SHIP_RECIPES[type].stone)return false;
  agent.vesselPlan={type,woodIds:[],stoneIds:[]};
  return world.go(agent,'collectVesselWood',world.material.containers.get('woodpile'),
    'Jde fyzicky vyzvednout dřevo na '+(type==='boat'?'loď':'vor')+'.');
}
export function considerFarIsland(world,agent){
  const need=agent.thirst>=60?'drink':agent.hunger>=60?'eat':agent.energy<38?'rest':'explore';
  if(need==='drink'){
    const known=chooseKnownResource(agent,'spring',world.seconds);
    const spring=known&&localSources(world,'spring').find(s=>s.id===known.id&&s.stock>0);
    if(spring)return world.go(agent,'drinkWater',spring,'Našel vodu na druhém ostrově.',spring);
  }
  if(need==='eat'){
    const item=availableIn(world,'far-cache','berry',1)[0]||availableIn(world,'far-cache','apple',1)[0];
    if(item)return world.go(agent,'eat',world.material.containers.get('far-cache'),
      'Chce se najíst z místních skutečných zásob.',{containerId:'far-cache'});
    const known=chooseKnownResource(agent,'berry',world.seconds);
    const berry=known&&localSources(world,'berry').find(s=>s.id===known.id&&s.stock>0);
    if(berry)return world.go(agent,'berries',berry,'Sám sbírá potravu na vzdáleném ostrově.',berry);
  }
  if(need==='rest')return world.go(agent,'rest',{x:85,z:1},'Odpočívá na ostrově.');
  const vessel=availableVessel(world,'far');
  if(world.day-(agent.lastLandfallDay||world.day)>=2&&vessel&&world.random()<.18&&
     agent.energy>65&&agent.hunger<57&&agent.thirst<55)
    return world.go(agent,'boardVoyage',FAR_PIER,'Rozhodl se vrátit se domů vlastní cestou.',
      {side:'far',vesselId:vessel.id});
  const known=chooseKnownResource(agent,'berry',world.seconds);
  const berry=known&&localSources(world,'berry').find(s=>s.id===known.id&&s.stock>0);
  if(berry&&world.material.foodCount()<30&&world.random()<.68)
    return world.go(agent,'berries',berry,'Zřizuje místní zásoby potravy.',berry);
  return world.go(agent,'explore',chooseExplorationTarget(agent,world.seconds,()=>world.random()),
    'Samostatně zkoumá druhý ostrov.');
}
function sendToPier(world,agent,purpose){
  return world.go(agent,purpose,HOME_PIER,'Nese skutečný materiál na pobřeží.');
}
export function coastalArrival(world,agent){
  const purpose=agent.purpose,plan=agent.vesselPlan;
  if(purpose==='scoutCoast'){
    discoverFarShore(world,agent);world.idle(agent);return true;
  }
  if(purpose==='studyVessel'){
    world.work(agent,'experimentingVessel',7,'Zkouší vazby dřeva a princip vztlaku.');return true;
  }
  if(purpose==='collectVesselWood'&&plan){
    const ids=availableIn(world,'woodpile','wood',SHIP_RECIPES[plan.type].wood).map(i=>i.id);
    if(ids.length===SHIP_RECIPES[plan.type].wood&&world.material.pickupStorage(agent,ids)){
      plan.woodIds=ids;agent.carry=ids.length;agent.carryType='wood';
      sendToPier(world,agent,'deliverVesselWood');return true;
    }
    agent.vesselPlan=null;world.idle(agent);return true;
  }
  if(purpose==='deliverVesselWood'&&plan){
    world.material.deliver(agent,'shore-yard');
    for(const id of plan.woodIds){
      const item=world.material.items.find(i=>i.id===id);
      if(item)item.reservedFor='vessel-'+agent.id;
    }
    agent.carry=0;agent.carryType=null;
    if(SHIP_RECIPES[plan.type].stone)
      world.go(agent,'collectVesselStone',world.material.containers.get('stonepile'),
        'Potřebuje ještě kámen pro pevnější loď.');
    else world.work(agent,'assemblingVessel',11,'Sestavuje vor z vlastnoručně dopraveného dřeva.');
    return true;
  }
  if(purpose==='collectVesselStone'&&plan){
    const ids=availableIn(world,'stonepile','stone',SHIP_RECIPES[plan.type].stone).map(i=>i.id);
    if(ids.length===SHIP_RECIPES[plan.type].stone&&world.material.pickupStorage(agent,ids)){
      plan.stoneIds=ids;agent.carry=ids.length;agent.carryType='stone';
      sendToPier(world,agent,'deliverVesselStone');return true;
    }
    world.idle(agent);return true;
  }
  if(purpose==='deliverVesselStone'&&plan){
    world.material.deliver(agent,'shore-yard');
    for(const id of plan.stoneIds){
      const item=world.material.items.find(i=>i.id===id);
      if(item)item.reservedFor='vessel-'+agent.id;
    }
    agent.carry=0;agent.carryType=null;
    world.work(agent,'assemblingVessel',19,'Sestavuje loď z dopravených skutečných součástí.');
    return true;
  }
  if(purpose==='boardVoyage'){
    const side=agent.resource?.side;
    if(side!==islandOf(agent)){world.idle(agent);return true;}
    let vessel=world.islands.vessels.find(v=>v.id===agent.resource?.vesselId&&v.side===side&&!v.inUse);
    if(!vessel&&agent.resource?.vesselId!==null){world.idle(agent);return true;}
    if(!vessel&&agent.energy<82){world.idle(agent);return true;}
    const from=side==='home'?HOME_PIER:FAR_PIER;
    const to=side==='home'?FAR_PIER:HOME_PIER;
    if(distance(agent,from)>3){world.idle(agent);return true;}
    if(vessel)vessel.inUse=agent.id;
    agent.mode='voyage';agent.purpose='seaCrossing';agent.target=null;
    agent.waypoints=[];agent.voyage={vesselId:vessel?.id??null,fromSide:side,
      from:{...from},to:{...to},progress:0,started:world.seconds};
    agent.reason=vessel?'Samostatně pluje na '+(vessel.type==='boat'?'lodi.':'voru.'):
      'Pokouší se přeplavat moře vlastními silami.';
    world.addEvent('Výprava přes moře',
      agent.name+' '+(vessel?'vyplul na '+(vessel.type==='boat'?'lodi':'voru'):'se pokusil přeplavat')+
      ' k '+(side==='home'?'druhému ostrovu':'domovu')+'.','≈');
    return true;
  }
  return false;
}
export function coastalComplete(world,agent){
  const purpose=agent.purpose,plan=agent.vesselPlan;
  if(purpose==='experimentingVessel'){
    const c=knowledge(agent);
    const tried=(c.technologyAttempts||0)+1;c.technologyAttempts=tried;
    const score=agent.personality.curiosity+agent.profile.skills.wood*2+tried*9;
    if(score>=91||world.random()*100<score-35){
      c.technologies.raft={origin:'invented',day:world.day,by:agent.id};
      experienceSkill(agent,'craft',3);
      lifeEvent(agent,world.day,'Vynalezl vor','Pokusy se dřevem umožnily sestavit plavidlo.');
      world.addEvent('Nový vynález',agent.name+' samostatně přišel na konstrukci voru.','✧');
    }
    world.idle(agent);return true;
  }
  if(purpose==='assemblingVessel'&&plan){
    const recipe=SHIP_RECIPES[plan.type],ids=[...plan.woodIds,...plan.stoneIds];
    const pieces=ids.map(id=>world.material.items.find(i=>i.id===id));
    if(pieces.length===recipe.wood+recipe.stone&&pieces.every(i=>i&&i.container==='shore-yard'&&i.reservedFor==='vessel-'+agent.id)){
      const remove=new Set(ids);
      world.material.items=world.material.items.filter(i=>!remove.has(i.id));
      const vessel={id:world.islands.nextVesselId++,type:plan.type,side:'home',inUse:null,
        x:HOME_PIER.x,z:HOME_PIER.z,builderId:agent.id,day:world.day};
      world.islands.vessels.push(vessel);
      experienceSkill(agent,'wood',4);experienceSkill(agent,'craft',plan.type==='boat'?7:4);
      lifeEvent(agent,world.day,'Postavil '+(plan.type==='boat'?'loď':'vor'),
        'Materiál byl fyzicky dopraven a spotřebován ('+ids.join(', ')+').');
      world.addEvent('Postavené plavidlo',agent.name+' sestavil '+(plan.type==='boat'?'loď':'vor')+
        ' ze skutečných zásob.','⚒');
    }
    agent.vesselPlan=null;world.syncStock();world.idle(agent);return true;
  }
  return false;
}
/** No instant teleport. Progress, injuries and vessels persist in world saves. */
export function advanceVoyage(world,agent,dt){
  const route=agent.voyage;if(!route||agent.mode!=='voyage')return false;
  const vessel=world.islands.vessels.find(v=>v.id===route.vesselId);
  const recipe=vessel?SHIP_RECIPES[vessel.type]:null;
  const length=distance(route.from,route.to);
  const speed=recipe?.speed??.49;
  route.progress=clamp(route.progress+speed*dt/length,0,1);
  agent.x=route.from.x+(route.to.x-route.from.x)*route.progress;
  agent.z=route.from.z+(route.to.z-route.from.z)*route.progress;
  agent.energy=clamp(agent.energy-dt*(vessel?.type==='boat'?.11:.25:.65),0,100);
  if(vessel){vessel.x=agent.x;vessel.z=agent.z;}
  if(!vessel&&agent.energy<=0){
    agent.health=0;agent.mode='distress';agent.reason='Vyčerpaný v moři čeká na pomoc.';
    world.islands.losses++;world.addEvent('Ztroskotání',
      agent.name+' nezvládl plavání mezi ostrovy.','≈');return true;
  }
  if(route.progress>=1){
    if(vessel){vessel.side=route.fromSide==='home'?'far':'home';vessel.inUse=null;}
    if(route.fromSide==='home'){world.islands.crossings++;agent.lastLandfallDay=world.day;
      agent.profile.settlement='Druhý ostrov';
    }else{world.islands.returns++;agent.profile.settlement='První osada';}
    experienceSkill(agent,'exploration',3);
    agent.profile.skills.navigation=(agent.profile.skills.navigation||0)+(vessel?4:2);
    if(route.fromSide==='home'&&vessel?.type==='raft'&&
      agent.profile.skills.wood>=6&&agent.profile.skills.craft>=4){
      knowledge(agent).technologies.boat={origin:'invented',day:world.day,by:agent.id};
    }
    lifeEvent(agent,world.day,'Doplul '+(route.fromSide==='home'?'na druhý ostrov':'domů'),
      'Přeprava: '+(vessel?.type||'plavání')+'.');
    world.addEvent('Úspěšná plavba',
      agent.name+' '+(route.fromSide==='home'?'objevil pobřeží druhého ostrova':'se vrátil z druhého ostrova')+'.','≈');
    agent.voyage=null;world.idle(agent);
  }
  return true;
}
export function advancePredators(world,dt){
  if(!world.islands)return;
  const sea=world.islands;
  for(const beast of sea.predators){
    beast.hunger=clamp(beast.hunger+dt*.09,0,100);
    beast.x=beast.anchorX+Math.sin(world.seconds*.052+beast.id)*2.6;
    beast.z=beast.anchorZ+Math.cos(world.seconds*.035+beast.id)*2.2;
    const prey=world.agents.find(a=>isLiving(a)&&a.mode==='voyage'&&
      distance(beast,a)<4&&beast.hunger>=61&&world.seconds-beast.lastAttack>15);
    if(prey){
      const vessel=sea.vessels.find(v=>v.id===prey.voyage?.vesselId);
      const resistance=vessel?SHIP_RECIPES[vessel.type].protection:0;
      const damage=Math.round(8+23*(1-resistance)*world.random());
      prey.health=Math.max(0,(prey.health??100)-damage);
      beast.hunger=clamp(beast.hunger-33,0,100);
      beast.lastAttack=world.seconds;sea.attacks++;
      world.addEvent('Útok mořského tvora',
        'Hladový tvor napadl '+prey.name+' při plavbě. Zranění '+damage+' zdraví.','≈');
      lifeEvent(prey,world.day,'Napaden v moři','Ztratil '+damage+' zdraví.');
    }else if(beast.hunger>84&&sea.fish>0&&world.random()<dt*.006){
      sea.fish--;beast.hunger=Math.max(0,beast.hunger-43);
    }
  }
  // A renewable fish stock provides a food web, but it cannot grow unbounded.
  if(world.day%8===0&&Math.floor(world.seconds)%75<dt)
    sea.fish=Math.min(55,sea.fish+1);
}
