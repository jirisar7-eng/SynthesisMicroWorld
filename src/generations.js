/**
 * MW-009B: autonomous, deterministic first demographic layer.
 * Game mechanics, not a claim of biological or psychological realism.
 * IDs remain stable forever; deceased people are never spliced from the registry.
 * No minor becomes a worker before adulthood.
 */
import {initializeBiography,lifeEvent} from './biography.js';
import {initializeLife,remember} from './life.js';
import {initCognition} from './cognition.js';
import {calendarAt} from './world-calendar.js';
import {clearSpawn,solidFootprints} from './spatial-world.js';
const CHILD_NAMES=['Jana','David','Sofie','Lukáš','Anna','Daniel','Eliška','Oliver','Nela','Filip','Julie','Viktor'];
export const ADULT_AGE=18;
export const GESTATION_DAYS=270;
export const MAX_PEOPLE=70;
const between=(v,a,b)=>Number.isFinite(v)&&v>=a&&v<=b;
export const isLiving=a=>a&&a.alive!==false;
export const isDependent=a=>isLiving(a)&&(a.profile?.age??0)<ADULT_AGE;

export function familyOf(person,people){
  const ids=person.profile?.genealogy??{parentIds:[],partnerId:null,childIds:[]};
  return {parents:ids.parentIds.map(id=>people[id]).filter(Boolean),
    partner:people[ids.partnerId]||null,
    children:ids.childIds.map(id=>people[id]).filter(Boolean)};
}
const closeKin=(a,b)=>{
  const aa=a.profile.genealogy,bb=b.profile.genealogy;
  return aa.parentIds.includes(b.id)||bb.parentIds.includes(a.id)||
    aa.parentIds.some(id=>bb.parentIds.includes(id));
};
const eligiblePair=(a,b)=>{
  if(!isLiving(a)||!isLiving(b)||a.id===b.id||closeKin(a,b))return false;
  if(a.profile.genealogy.partnerId!==null||b.profile.genealogy.partnerId!==null)return false;
  if(!between(a.profile.age,18,65)||!between(b.profile.age,18,65))return false;
  if((a.relationships[b.id]??0)<60||(b.relationships[a.id]??0)<60)return false;
  if(Math.hypot(a.x-b.x,a.z-b.z)>12)return false;
  if(a.social?.status!=='resident'||b.social?.status!=='resident')return false;
  return true;
};
function couple(a,b,day){
  a.profile.genealogy.partnerId=b.id;
  b.profile.genealogy.partnerId=a.id;
  a.familySince=day;b.familySince=day;
  lifeEvent(a,day,'Vzniklo partnerství','S '+b.profile.fullName+' na základě vzájemného vztahu.');
  lifeEvent(b,day,'Vzniklo partnerství','S '+a.profile.fullName+' na základě vzájemného vztahu.');
  remember(a,'Rozhodl se žít s '+b.name);
  remember(b,'Rozhodl se žít s '+a.name);
  return {kind:'partnership',day,first:a.id,second:b.id};
}
function newborn(world,parentA,parentB,day){
  const id=world.agents.length,year=calendarAt(day).elapsedYears;
  const childName=CHILD_NAMES[id%CHILD_NAMES.length];
  const home=parentA.profile.home||parentB.profile.home||null;
  const x=(parentA.x+parentB.x)/2,z=(parentA.z+parentB.z)/2;
  const person=initializeBiography(initCognition(initializeLife({
    id,name:childName,x,z,energy:85,mode:'dependent',purpose:'childhood',
    reason:'Potřebuje každodenní péči rodičů',target:null,resource:null,
    carry:0,carryType:null,waypoints:[],workRemaining:0,workTotal:0,
    choiceAt:Infinity,speed:1.2,color:parentA.color
  },id)),id);
  person.alive=true;person.sex=id%2===0?'female':'male';person.health=100;
  person.profile.age=0;
  person.profile.birthYear=year;
  person.profile.bornDay=day;
  person.profile.origin='Narozen v MicroWorldu';
  person.profile.home=home;person.profile.occupation='Dítě';
  person.profile.genealogy={parentIds:[parentA.id,parentB.id],partnerId:null,childIds:[]};
  person.profile.timeline=[{day,event:'Narození',detail:'Rodiče: '+parentA.name+' a '+parentB.name}];
  person.hunger=20;person.thirst=20;person.socialNeed=15;
  world.social.initialize(person);
  parentA.profile.genealogy.childIds.push(id);
  parentB.profile.genealogy.childIds.push(id);
  world.agents.push(person);
  lifeEvent(parentA,day,'Narodilo se dítě',childName);
  lifeEvent(parentB,day,'Narodilo se dítě',childName);
  return {kind:'birth',day,id,parents:[parentA.id,parentB.id],name:childName};
}

/** One physically meaningful daily update; no random forced pregnancies.
 * Food aid spends a real unique inventory object. Water supply/carrying for
 * toddlers still requires a later physical logistics sub-system, so hydration
 * is marked as outstanding rather than magically resetting to full.
 */
export function populationDay(world,day){
  const people=world.agents,events=[];
  for(const a of people){
    if(!isLiving(a))continue;
    if(a.health==null)a.health=100;
    if(a.sex==null)a.sex=a.id%2===0?'female':'male';
    if(a.pregnancyDueDay&&day>=a.pregnancyDueDay){
      const partner=people[a.profile.genealogy.partnerId];
      if(isLiving(partner)&&people.length<MAX_PEOPLE){
        events.push(newborn(world,a,partner,day));
      }
      a.pregnancyDueDay=null;a.lastBirthDay=day;
    }
    if(!isDependent(a)){
      const starvation=(a.hunger??0)>98?3:0;
      const dehydration=(a.thirst??0)>99?5:0;
      const old=(a.profile.age>=85?Math.min(8,(a.profile.age-84)*.4):0);
      a.health=Math.max(0,a.health-starvation-dehydration-old);
    }else{
      // Dependency is explicit: children need adults, not independent jobs.
      const caretakers=familyOf(a,people).parents.filter(isLiving);
      const availableFood=world.material.findFoodSource();
      // Food is actually consumed; not teleported into a second inventory.
      if(caretakers.length&&availableFood&&a.hunger>=45&&
         caretakers.some(parent=>Math.hypot(parent.x-a.x,parent.z-a.z)<=8)){
        const consumed=world.material.consumeFoodFrom(availableFood.container.id);
        if(consumed){
          a.hunger=Math.max(0,a.hunger-62);
          a.health=Math.min(100,a.health+2);
          events.push({kind:'care',day,id:a.id,resourceId:consumed.id,caregivers:caretakers.map(p=>p.id)});
        }
      }
      if(a.hunger>96||a.thirst>99)a.health=Math.max(0,a.health-3);
    }
    if(a.health<=0){
      a.alive=false;a.mode='deceased';a.purpose='';a.waypoints=[];a.target=null;
      a.diedDay=day;lifeEvent(a,day,'Úmrtí','Dlouhodobé ohrožení zdraví nebo věk.');
      const partner=people[a.profile.genealogy.partnerId];
      if(partner){
        partner.profile.genealogy.partnerId=null;
        lifeEvent(partner,day,'Ztratil partnera',a.profile.fullName);
      }
      events.push({kind:'death',day,id:a.id,name:a.name});
      continue;
    }
  }
  if(day%7===0){
    const adults=people.filter(a=>isLiving(a)&&a.profile.age>=18);
    for(const a of adults){
      if(a.profile.genealogy.partnerId!==null)continue;
      const possible=adults.find(b=>b.id>a.id&&eligiblePair(a,b));
      if(possible)events.push(couple(a,possible,day));
    }
  }
  if(day%30===0){
    const housing=world.material.structures.filter(b=>b.type==='house').length;
    const viable=world.material.foodCount()>=10&&
      (world.springs||[]).some(s=>s.stock>=8)&&housing>=1&&
      people.filter(isLiving).length<MAX_PEOPLE;
    if(viable)for(const a of people){
      if(!isLiving(a)||a.sex!=='female'||a.pregnancyDueDay)continue;
      if(!between(a.profile.age,18,43))continue;
      const partner=people[a.profile.genealogy.partnerId];
      if(!isLiving(partner)||a.familySince==null||day-a.familySince<45)continue;
      if(a.lastBirthDay&&day-a.lastBirthDay<365)continue;
      // deterministic variation, no forced birth in every eligible household
      if((a.id*17+partner.id*13+Math.floor(day/30))%4!==0)continue;
      a.pregnancyDueDay=day+GESTATION_DAYS;
      events.push({kind:'pregnancy',day,id:a.id,partner:partner.id,dueDay:a.pregnancyDueDay});
    }
  }
  return events;
}

/** Always index-stable: adults still may die, children remain in registry. */
export function livingSummary(people){
  return {living:people.filter(isLiving).length,children:people.filter(isDependent).length,
    adults:people.filter(a=>isLiving(a)&&!isDependent(a)).length,
    deceased:people.filter(a=>!isLiving(a)).length,
    couples:people.filter(a=>isLiving(a)&&a.profile?.genealogy?.partnerId!==null).length/2,
    born:people.filter(a=>a.profile?.bornDay>1).length};
}

/** Independent test scenario: REAL 30 living founders, not fake dashboard count.
 * Existing six remain intact; newcomers are added with legal 3D positions,
 * separate memories, needs and identities. Max scenario 70 for bounded cost.
 */
export function populateFounders(world,count=30){
  if(!Number.isInteger(count)||count<world.agents.length||count>MAX_PEOPLE)
    throw new Error('Scenario population is outside the supported range');
  const surnames=['Novotný','Králová','Dvořák','Svoboda','Malá','Veselý'];
  const arrivals=['Karolína','Petr','Marta','Ondřej','Tereza','Milan','Zora',
    'Pavel','Irena','Martin','Lucie','Jakub','Aneta','Roman','Petra','Vojtěch',
    'Adéla','Bohumil','Hana','Tomáš','Simona','Josef','Alena','Samuel'];
  while(world.agents.length<count){
    const id=world.agents.length,n=id-6;
    const angle=n*2.399963229728;
    const radius=5.7+(n%4)*1.2;
    const candidate={x:Math.cos(angle)*radius,z:Math.sin(angle)*radius};
    const blockers=[...solidFootprints(world),
      ...world.agents.filter(isLiving).map(a=>({shape:'circle',x:a.x,z:a.z,r:.48}))];
    const position=clearSpawn(candidate,blockers);
    const name=arrivals[n%arrivals.length];
    const person=initializeBiography(initCognition(initializeLife({
      id,name,x:position.x,z:position.z,
      energy:75+(id%7)*3,mode:'idle',purpose:'',reason:'Přišel hledat nový domov.',
      target:null,resource:null,carry:0,carryType:null,workRemaining:0,
      workTotal:0,choiceAt:0,waypoints:[],speed:2+(id%5)*.1,
      color:[0xb17b59,0x9baf74,0x637f9b,0xca9d75,0x8e798d,0x81ad9f][id%6]
    },id)),id);
    person.profile.age=18+(id*7)%34;
    person.profile.birthYear=-person.profile.age;
    person.profile.fullName=name+' '+surnames[id%6];
    person.profile.origin='Příchozí zakladatel';
    person.profile.timeline=[{day:world.day,event:'Připojil se k zakladatelům',
      detail:'Do prázdné krajiny přišel nezávisle, se svými vlastními potřebami.'}];
    person.sex=id%2===0?'female':'male';
    person.alive=true;person.health=100;
    world.social.initialize(person);
    world.agents.push(person);
  }
  return livingSummary(world.agents);
}
