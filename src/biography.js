/**
 * MW-006: a life card contains actual simulation state and recorded events.
 * The biography describes observed actions only, not fabricated hidden lives.
 */
const familyNames=['Novotný','Veselá','Dvořák','Malá','Král','Svobodová'];
const origins=['Příchozí zakladatel','Cestovatelka skupiny','Člen výpravy','Přistěhovalkyně','Původní osadník','Průzkumnice'];
const descriptions=[
 'Zvídavý cestovatel, který rád objevuje nová místa a obvykle zkouší neznámé možnosti.',
 'Společenská obyvatelka s výrazným zájmem o ostatní lidi a vztahy.',
 'Prakticky založený člověk, který upřednostňuje dokončení započaté práce.',
 'Empatická obyvatelka, jež vnímá potřeby ostatních a vyhledává spolupráci.',
 'Opatrný osadník, který se při práci rád spoléhá na ověřené postupy.',
 'Samostatná průzkumnice, která má ráda nové zkušenosti a nezávislost.'
];
const skillLabels={wood:'Práce se dřevem',stone:'Kamenictví',farm:'Zemědělství',craft:'Výroba',social:'Vyjednávání',exploration:'Průzkum'};
export function initializeBiography(agent,index){
  agent.profile={
    fullName:agent.name+' '+familyNames[index%familyNames.length],
    age:20+index*3,
    origin:origins[index%origins.length],
    description:descriptions[index%descriptions.length],
    bornDay:0,settlement:'První osada',home:null,
    occupation:'Neurčeno',
    belongings:[],
    achievements:[],
    timeline:[{day:1,event:'Příchod do MicroWorldu',detail:'Dorazil mezi zakladatele nové osady.'}],
    skills:{wood:0,stone:0,farm:0,craft:0,social:0,exploration:0},
    relationships:[],
    departures:0
  };
  return agent;
}
export function lifeEvent(agent,day,event,detail=''){
  if(!agent.profile)return;
  const entry={day:Math.max(1,Math.floor(day)),event,detail};
  if(agent.profile.timeline.at(-1)?.event===event&&agent.profile.timeline.at(-1)?.day===entry.day)return;
  agent.profile.timeline.push(entry);
  agent.profile.timeline=agent.profile.timeline.slice(-80);
}
export function experienceSkill(agent,key,amount=1){
  if(agent.profile&&Object.hasOwn(agent.profile.skills,key)){
    agent.profile.skills[key]=Math.min(100,agent.profile.skills[key]+amount);
  }
}
export function biography(agent,world){
  const p=agent.profile;
  const parts=[
    p.fullName+' patří mezi první obyvatele světa MicroWorld.',
    p.description,
    'Na začátku svého příběhu se připojil ke skupině, která se snaží vybudovat soběstačnou osadu.'
  ];
  const important=p.timeline.filter(x=>x.event!=='Příchod do MicroWorldu').slice(-5);
  if(important.length){
    parts.push('V jeho dosavadním životě se stalo: '+important.map(x=>'dne '+x.day+' '+x.event.toLowerCase()).join('; ')+'.');
  }else{
    parts.push('Jeho další osobní historie teprve vzniká podle skutečných událostí simulace.');
  }
  if(p.settlement!=='První osada')parts.push('Nyní žije v komunitě '+p.settlement+'.');
  if(agent.social?.departures>0)parts.push('Během svého života se '+agent.social.departures+
    '× rozhodl opustit původní komunitu. Každý odchod i návrat je zaznamenán v časové ose.');
  return parts.join(' ');
}
export function makeLifeCard(agent,sim){
  const p=agent.profile;
  if(!p)return null;
  const relationList=sim.agents.filter(a=>a.id!==agent.id)
    .map(other=>({id:other.id,name:other.profile?.fullName||other.name,trust:agent.relationships[other.id]||0}))
    .sort((a,b)=>b.trust-a.trust);
  const skills=Object.entries(p.skills)
    .map(([name,level])=>({name:skillLabels[name],level}))
    .sort((a,b)=>b.level-a.level);
  const home=sim.material?.structures.find(b=>b.id===p.home);
  return {
    id:agent.id,fullName:p.fullName,age:p.age,origin:p.origin,
    description:p.description,biography:biography(agent,sim),
    livingState:agent.mode,action:agent.purpose,reason:agent.reason,
    colony:p.settlement,home:home?home.id:(p.home||'Žádné trvalé bydlení'),
    role:p.occupation,health:'Zdravotní systém zatím není simulován',
    hunger:Math.round(agent.hunger),energy:Math.round(agent.energy),
    loneliness:Math.round(agent.socialNeed),mood:Math.round(agent.mood),
    personality:{...agent.personality},skills,relationships:relationList,
    inventory:(p.belongings||[]).slice(),carried:agent.carry||0,
    knowledge:agent.cognition?Object.keys(agent.cognition.resources).length:0,
    timeline:p.timeline.slice().reverse(),memories:(agent.memories||[]).slice(),
    socialStatus:agent.social?.status||'resident',
    frustration:Math.round(agent.social?.frustration||0),
    socialHistory:agent.social?.grievances?.slice()||[],
    departures:p.departures,day:sim.day
  };
}
