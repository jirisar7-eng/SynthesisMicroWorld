import assert from 'node:assert/strict';
import {Civilization} from '../src/simulation-core.js';
import {populateFounders,livingSummary} from '../src/generations.js';
import {calendarAt} from '../src/world-calendar.js';

const days=Number(process.env.MW_TEST_DAYS||730);
const step=Number(process.env.MW_TEST_STEP||1.5);
if(!Number.isInteger(days)||days<2||days>3650||!Number.isFinite(step)||step<.2||step>2)
  throw new Error('Invalid test scenario limits');
const sim=new Civilization();
populateFounders(sim,30);
assert.equal(livingSummary(sim.agents).living,30);
const baseline=sim.material.countAll(),start=process.hrtime.bigint();
const endSeconds=days*75;
while(sim.seconds<endSeconds){
  sim.update(Math.min(step,endSeconds-sim.seconds));
  if([2,5,10,20,30].includes(sim.day)&&Math.abs(sim.seconds%75)<step){
    const persons=sim.agents.filter(a=>a.alive!==false);
    const sample=persons.slice(0,4).map(a=>({id:a.id,
      x:Math.round(a.x),z:Math.round(a.z),h:Math.round(a.hunger),
      t:Math.round(a.thirst),hp:Math.round(a.health),
      mode:a.mode,task:a.purpose,reason:a.reason,
      waterKnown:Object.values(a.cognition.resources).filter(x=>x.type==='spring').length}));
    console.log('MW_LIFE_DIAGNOSTIC',JSON.stringify({day:sim.day,
      alive:persons.length,food:sim.food,water:sim.springs.map(x=>x.stock),sample}));
  }
  if(sim.day%50===0&&Math.abs(sim.seconds%75)<step){
    const summary=livingSummary(sim.agents);
    console.log('MW_LIFE_PROGRESS',JSON.stringify({day:sim.day,summary,
      buildings:sim.material.structures.length,chronicle:sim.chronicle.length}));
  }
  if(!sim.material.items.every(x=>sim.material.containers.has(x.container)))
    throw new Error('Physical object missing container');
  if(sim.agents.some(a=>!Number.isFinite(a.x)||!Number.isFinite(a.z)))
    throw new Error('Non-finite NPC location');
}
const results={
  test:'MW-LIFE-001',durationDays:days,initialLiving:30,
  final:livingSummary(sim.agents),
  mortality:Object.fromEntries([...new Set(sim.agents.filter(p=>!p.alive)
    .map(p=>p.deathCause||'neuvedeno'))].map(cause=>[cause,
      sim.agents.filter(p=>!p.alive&&(p.deathCause||'neuvedeno')===cause).length])),
  structures:sim.material.structures.length,
  builtWithPhases:sim.material.structures.filter(s=>s.groundPrepared&&s.scaffoldingDismantled).length,
  inventory:sim.material.countAll(),initialInventory:baseline,
  trail:sim.paths.summary(),water:sim.springs.reduce((n,s)=>n+s.stock,0),
  year:calendarAt(sim.day).year,events:sim.chronicle.length,
  materialTransport:sim.material.logistics.transported,
  maritime:{islands:2,discoveredBy:sim.islands.discoveredBy.length,
    crossings:sim.islands.crossings,returns:sim.islands.returns,
    vessels:sim.islands.vessels.length,predatorAttacks:sim.islands.attacks,
    fish:sim.islands.fish},
  professions:[...new Set(sim.agents.filter(a=>a.alive!==false)
    .map(a=>a.profile.occupation))].sort(),
  runtimeSeconds:Number((Number(process.hrtime.bigint()-start)/1e9).toFixed(2))
};
console.log('MW_LIFE_001_REPORT',JSON.stringify(results));
assert.ok(sim.day>=days,'World must advance all requested days');
assert.ok(results.events>0&&results.materialTransport>0,'Life decisions need real causal events and material movement');
assert.ok(results.final.living+results.final.deceased===sim.agents.length);
assert.ok(sim.agents.every(p=>p.profile&&p.cognition&&p.relationships));
