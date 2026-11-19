/**
 * MW-GOD-001 — pure, server-authoritative god powers.
 * God powers change state/conditions; NPC choices stay in Civilization.decide().
 * All functions are intentionally independent of DOM, Node and Three.js.
 */
import {remember} from './life.js';
import {lifeEvent} from './biography.js';
import {terrainHeight} from './simulation-core.js';

const between=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const near=(a,b,r)=>Math.hypot(a.x-b.x,a.z-b.z)<=r;
const locationValid=p=>between(p.x,-49,112)&&between(p.z,-49,49)&&terrainHeight(p.x,p.z)>-.25;
const categories=Object.freeze({
  rain:{label:'Déšť',target:'world',category:'Počasí',description:'Déšť na 50 herních sekund, částečná obnova bobulí.'},
  drought:{label:'Sucho',target:'world',category:'Počasí',description:'Sucho na 50 herních sekund a snížení úrody.'},
  bloom:{label:'Bohatá úroda',target:'point',category:'Zdroje',description:'Doplní dostupné plody v označeném okolí.'},
  forest:{label:'Nový les',target:'point',category:'Zdroje',description:'Založí reálné stromy, které NPC nejprve musí objevit.'},
  spring:{label:'Nový pramen',target:'point',category:'Zdroje',description:'Vytvoří dostupný zdroj pitné vody.'},
  deposit:{label:'Kamenité naleziště',target:'point',category:'Zdroje',description:'Vytvoří vytěžitelné ložisko kamene.'},
  heal:{label:'Uzdravení',target:'living',category:'Život',description:'Obnoví zdraví živého člověka či zvolené skupiny.'},
  mood:{label:'Dobrá nálada',target:'living',category:'Život',description:'Zvýší aktuální náladu bez přímého řízení.'},
  inspire:{label:'Inspirace',target:'living',category:'Život',description:'Dodá energii a motivující vzpomínku.'},
  bless:{label:'Požehnání',target:'living',category:'Život',description:'Zlepší několik potřeb a zanechá osobní vzpomínku.'},
  fire:{label:'Požár',target:'point',category:'Katastrofy',description:'Lokální požár s postupným rizikem zranění a ztrát.'},
  flood:{label:'Povodeň',target:'point',category:'Katastrofy',description:'Dočasné záplavy s únavou, zraněním a ztrátou plodů.'},
  meteor:{label:'Meteorit',target:'point',category:'Katastrofy',description:'Jednorázový dopad, zranění, zničené zdroje a naleziště.'}
});
export const GOD_POWERS=categories;
export const GOD_POWER_CATALOG=Object.entries(categories).map(([id,entry])=>({id,...entry,maxIntensity:5}));
export class GodPowerError extends Error {
  constructor(code,message){super(message);this.name='GodPowerError';this.code=code;}
}
function invalid(message){throw new GodPowerError('invalid_command',message);}
export function validateGodCommand(world,raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid('Neplatný formát příkazu.');
  const power=raw.power;
  if(typeof power!=='string'||!Object.hasOwn(categories,power))invalid('Neznámá božská schopnost.');
  const spec=categories[power];
  const intensity=raw.intensity===undefined?1:raw.intensity;
  if(!Number.isInteger(intensity)||intensity<1||intensity>5)invalid('Intenzita musí být celé číslo 1–5.');
  const input=raw.target;
  if(!input||typeof input!=='object'||Array.isArray(input))invalid('Chybí cíl zásahu.');
  let target;
  if(spec.target==='world'){
    if(input.type!=='world')invalid('Tato schopnost vyžaduje svět jako cíl.');
    target={type:'world'};
  }else if(spec.target==='point'){
    if(input.type!=='point'||!between(input.x,-49,112)||!between(input.z,-49,49)||
       !locationValid(input))invalid('Cíl musí být bezpečně na souši existujících ostrovů.');
    target={type:'point',x:Math.round(input.x*100)/100,z:Math.round(input.z*100)/100};
  }else if(input.type==='agent'){
    if(!Number.isInteger(input.id))invalid('Neplatné ID obyvatele.');
    const person=world.agents.find(a=>a.id===input.id);
    if(!person||person.alive===false)invalid('Cílový obyvatel nežije nebo neexistuje.');
    target={type:'agent',id:input.id};
  }else if(input.type==='group'){
    if(!between(input.x,-49,112)||!between(input.z,-49,49)||
       !between(input.radius,2,25)||!locationValid(input))invalid('Neplatná oblast skupiny.');
    target={type:'group',x:input.x,z:input.z,radius:input.radius};
    if(!world.agents.some(a=>a.alive!==false&&near(a,target,target.radius)))
      invalid('V označené oblasti není žádný žijící obyvatel.');
  }else invalid('Schopnost vyžaduje jednotlivce nebo skupinu.');
  return {power,target,intensity};
}
function peopleFor(world,target){
  if(target.type==='agent')return world.agents.filter(a=>a.id===target.id&&a.alive!==false);
  return world.agents.filter(a=>a.alive!==false&&near(a,target,target.radius));
}
function takeStockAt(list,point,radius,decrease){
  let changed=0;
  for(const source of list)if(near(source,point,radius)){
    const next=clamp(source.stock+decrease,0,source.maxStock);
    if(next!==source.stock){source.stock=next;changed++;}
  }
  return changed;
}
function seedResources(world,type,target,intensity){
  const coll=type==='tree'?world.trees:type==='stone'?world.stones:world.springs;
  const count=type==='tree'?intensity*3:type==='stone'?intensity:1;
  let placed=0;
  for(let i=0;i<count*20 && placed<count;i++){
    const angle=world.random()*Math.PI*2,range=type==='tree'?2+world.random()*(3+intensity*1.5):
      1+world.random()*(2+intensity);
    const pos={x:Math.round((target.x+Math.cos(angle)*range)*100)/100,
      z:Math.round((target.z+Math.sin(angle)*range)*100)/100};
    if(!locationValid(pos)||coll.some(r=>near(r,pos,type==='spring'?6:2.5))||
       world.material.structures.some(s=>near(s,pos,5)))continue;
    if(type==='spring'){
      coll.push({id:'god-spring-'+world.godNextId,x:pos.x,z:pos.z,
        name:'Nový pramen',stock:15+intensity*5,maxStock:15+intensity*5});
    }else{
      coll.push({id:Math.max(-1,...coll.map(s=>typeof s.id==='number'?s.id:-1))+1,
        x:pos.x,z:pos.z,stock:type==='tree'?9:10,maxStock:type==='tree'?9:10});
    }
    placed++;
  }
  return placed;
}
function initGodState(world){
  if(!Array.isArray(world.godHistory))world.godHistory=[];
  if(!Array.isArray(world.godHazards))world.godHazards=[];
  if(!Array.isArray(world.godLandmarks))world.godLandmarks=[];
  if(!Number.isInteger(world.godNextId)||world.godNextId<1)world.godNextId=1;
}
export function applyGodPower(world,raw){
  initGodState(world);
  const cmd=validateGodCommand(world,raw);
  const {power,target,intensity}=cmd;
  if(world.godHazards.filter(h=>h.until>world.seconds).length>=12)
    throw new GodPowerError('too_many_hazards','Ve světě je příliš mnoho aktivních nebezpečí.');
  const id=world.godNextId++;
  const result={id,power,target,intensity,day:world.day,seconds:world.seconds,
    result:'',affectedIds:[],effects:{},origin:'GOD'};
  const radius=4+intensity*3;
  const beings=(target.type==='agent'||target.type==='group')?peopleFor(world,target):[];
  switch(power){
    case 'rain':
      world.weather={kind:'rain',until:world.seconds+50+intensity*10};
      result.effects.berrySites=takeStockAt(world.berries,{x:0,z:0},Infinity,2*intensity);
      result.result='Déšť přinesl vláhu a další plody.';break;
    case 'drought':
      world.weather={kind:'drought',until:world.seconds+50+intensity*10};
      result.effects.berrySites=takeStockAt(world.berries,{x:0,z:0},Infinity,-3*intensity);
      result.result='Sucho omezilo dostupné plody a pití.';break;
    case 'bloom':
      result.effects.berrySites=takeStockAt(world.berries,target,radius,4*intensity);
      result.effects.appleSites=takeStockAt(world.apples,target,radius,2*intensity);
      result.result='Úroda se v okolí obnovila.';break;
    case 'forest':
      result.effects.newTrees=seedResources(world,'tree',target,intensity);
      if(!result.effects.newTrees)throw new GodPowerError('no_space','Pro nový les není volné místo.');
      result.result='V krajině vznikly nové stromy.';break;
    case 'spring':
      result.effects.newSprings=seedResources(world,'spring',target,intensity);
      if(!result.effects.newSprings)throw new GodPowerError('no_space','Pramen nelze umístit do již obsazené oblasti.');
      result.result='V krajině vytryskl nový pramen.';break;
    case 'deposit':
      result.effects.newDeposits=seedResources(world,'stone',target,intensity);
      if(!result.effects.newDeposits)throw new GodPowerError('no_space','Pro kamenité naleziště není místo.');
      result.result='Vzniklo nové ložisko kamene.';break;
    case 'heal':case 'mood':case 'inspire':case 'bless':
      for(const p of beings){
        if(power==='heal'||power==='bless')p.health=clamp((p.health??100)+(power==='heal'?20:10)*intensity,0,100);
        if(power==='mood'||power==='bless')p.mood=clamp((p.mood??50)+intensity*(power==='mood'?12:6),0,100);
        if(power==='inspire'||power==='bless')p.energy=clamp((p.energy??50)+intensity*8,0,100);
        if(power==='inspire')p.inspiredUntil=world.seconds+60+intensity*15;
        remember(p,power==='heal'?'Božské uzdravení':power==='mood'?'Nevysvětlitelná radost':
          power==='inspire'?'Náhlá inspirace':'Božské požehnání');
        lifeEvent(p,world.day,'Božský zásah',categories[power].label+' · síla '+intensity);
        result.affectedIds.push(p.id);
      }
      result.effects.people=result.affectedIds.length;
      result.result='Zásah ovlivnil '+beings.length+' žijících obyvatel.';break;
    case 'fire':case 'flood': {
      const hazard={id,kind:power,x:target.x,z:target.z,radius,
        intensity,until:world.seconds+intensity*12+20,lastReportAt:world.seconds,
        totalInjuries:0,affectedIds:[]};
      world.godHazards.push(hazard);
      if(power==='fire')result.effects.burnedTrees=takeStockAt(world.trees,target,radius,-intensity*3);
      else result.effects.damagedFruitSites=takeStockAt(world.berries,target,radius,-intensity*2);
      result.effects.hazardDuration=hazard.until-world.seconds;
      result.result=power==='fire'?'Rozšířil se požár.':'Oblast zasáhla povodeň.';break;
    }
    case 'meteor': {
      result.effects.destroyedTrees=takeStockAt(world.trees,target,radius,-99);
      result.effects.destroyedFruit=takeStockAt(world.berries,target,radius,-99);
      for(const p of world.agents.filter(a=>a.alive!==false&&near(a,target,radius))){
        p.health=clamp((p.health??100)-intensity*12,1,100);
        p.mood=clamp(p.mood-12*intensity,0,100);
        remember(p,'Přežil dopad meteoritu');
        result.affectedIds.push(p.id);
      }
      world.godLandmarks.push({id,kind:'crater',x:target.x,z:target.z,radius,day:world.day});
      result.effects.injured=result.affectedIds.length;
      result.result='Meteorit poškodil krajinu a ohrozil životy.';break;
    }
  }
  world.godHistory.push(result);
  if(world.godHistory.length>500)world.godHistory.shift();
  world.addEvent('Božský zásah · '+categories[power].label,
    result.result+' Intenzita '+intensity+'; zásah #'+id+'.','✦');
  return result;
}
/** Apply gameplay hazard effects as ordinary simulation time advances.
 * Causal totals refer to the original event; no NPC is ordered to move.
 */
export function advanceGodHazards(world,dt){
  if(!Array.isArray(world.godHazards)||!world.godHazards.length)return;
  for(const hazard of world.godHazards){
    if(world.seconds>hazard.until)continue;
    for(const p of world.agents){
      if(p.alive===false||!near(p,hazard,hazard.radius))continue;
      const exposure=Math.max(.2,1-Math.hypot(p.x-hazard.x,p.z-hazard.z)/hazard.radius);
      const harm=dt*hazard.intensity*exposure*(hazard.kind==='fire'?.32:.14);
      p.health=clamp((p.health??100)-harm,1,100);
      p.energy=clamp((p.energy??50)-dt*.3*hazard.intensity,0,100);
      if(!hazard.affectedIds.includes(p.id))hazard.affectedIds.push(p.id);
      hazard.totalInjuries=Math.round((hazard.totalInjuries+harm)*1000)/1000;
    }
  }
  const expired=world.godHazards.filter(h=>world.seconds>h.until);
  for(const hazard of expired){
    const record=world.godHistory?.find(r=>r.id===hazard.id);
    if(record){
      record.affectedIds=[...new Set([...record.affectedIds,...hazard.affectedIds])];
      record.effects.totalDamage=Math.round(hazard.totalInjuries*100)/100;
      record.effects.exposedPeople=record.affectedIds.length;
      record.effects.finishedDay=world.day;
    }
    world.addEvent(hazard.kind==='fire'?'Požár uhasl':'Voda opadla',
      'Následky zásahu #'+hazard.id+': '+hazard.affectedIds.length+
      ' vystavených lidí, '+Math.round(hazard.totalInjuries)+' bodů poškození zdraví.','◈');
  }
  world.godHazards=world.godHazards.filter(h=>world.seconds<=h.until);
}
