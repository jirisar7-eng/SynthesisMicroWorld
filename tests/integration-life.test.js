/**
 * MW-006B integrated headless acceptance.
 * Evaluate only the standalone Civilization class from the browser entry,
 * injecting its real pure modules. No WebGL is required for simulation tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {MaterialWorld,RECIPES,FOOD_TYPES,ITEM_INFO} from '../src/material-world.js';
import {initializeBiography,lifeEvent,experienceSkill,makeLifeCard} from '../src/biography.js';
import {Footpaths} from '../src/footpaths.js';
import {decideCommunityProject} from '../src/settlement-planner.js';
import {SocialDynamics} from '../src/social-dynamics.js';
import {loadSpeed} from '../src/carry-poses.js';
import {createSprings,springRefill,drinkFromSpring,waterAvailability} from '../src/water-cycle.js';
import {calendarAt,ageResidents} from '../src/world-calendar.js';
import {serializeWorld,restoreWorld,WORLD_SAVE_KEY} from '../src/world-save.js';
import {populationDay,livingSummary,isDependent,isLiving} from '../src/generations.js';
import {initializeBuildSite,beginPhase,clearNextObject,phaseProgress,validStage,CONSTRUCTION_LABELS} from '../src/construction-stages.js';
import {createAvatar,selectPlayerMode,advanceAvatar,encounterEffect,PLAYER_LABELS} from '../src/avatar-modes.js';
import {solidFootprints,indexSolids,planWalk,advanceWalk,clearSpawn,groundDropPosition,chooseCampPlot,isBlocked} from '../src/spatial-world.js';
import {
  initCognition,observeNearby,chooseKnownResource,chooseExplorationTarget,
  learnOutcome,exchangeKnowledge,decision,knowledgeSummary,episode
} from '../src/cognition.js';
import {initializeLife,updateLife,remember,socialBond,needsDecision,relationshipLabel} from '../src/life.js';

// Shared source of truth for both browser rendering and headless simulation.
import {Civilization} from '../src/simulation-core.js';

test('MW-INTEGRATION-001: six autonomous citizens run for several days with physical inventory and real trails',()=>{
  const sim=new Civilization();
  assert.equal(sim.agents.length,6);
  const baseline=sim.material.countAll();
  assert.equal(baseline,14);
  for(let i=0;i<3000;i++){
    sim.update(.2);
  }
  const movement=sim.paths.summary();
  console.log('MW006B_LIVE_METRICS',JSON.stringify({
    day:sim.day,buildings:sim.material.structures.length,
    activeProject:sim.construction?.type||null,
    constructionDelivered:sim.material.logistics.constructionDeliveries,
    materialPicked:sim.material.logistics.collected,
    materialDelivered:sim.material.logistics.delivered,
    trails:movement.trails,footprints:movement.footprints,
    camps:sim.material.tents.length,worldEvents:sim.messages.length
  }));
  assert.ok(sim.day>=8,'Several game days must pass');
  assert.ok(movement.footprints>10,'Citizens must actually walk');
  assert.ok(movement.trails>2,'Traffic must leave visible worn ground');
  assert.ok(sim.agents.every(a=>Number.isFinite(a.x)&&Number.isFinite(a.z)));
  assert.ok(sim.agents.every(a=>a.cognition&&a.social&&a.profile),'All agents keep their cognitive and life records');
  assert.ok(sim.material.items.every(i=>sim.material.containers.has(i.container)),'Every physical item is at a real storage/carrier/site');
  assert.ok(sim.material.countAll()>=0,'Inventory never becomes negative');
  assert.ok(sim.material.logistics.collected>0,'NPCs gather their resources autonomously');
  assert.ok(sim.material.logistics.delivered>0,'NPCs physically deliver gathered resources');
});

test('MW-INTEGRATION-002: every construction completion corresponds to a funded, hauled project',()=>{
  const sim=new Civilization();
  const initial=sim.material.countAll();
  for(let i=0;i<3500;i++)sim.update(.2);
  for(const building of sim.material.structures){
    assert.ok(building.type in RECIPES);
    assert.ok(building.builderId>=0 && building.builderId<sim.agents.length);
    assert.ok(building.builtAt>0);
  }
  if(sim.material.structures.length){
    assert.ok(sim.material.logistics.constructionDeliveries>=RECIPES.house.wood);
  }
  if(sim.construction){
    assert.ok(sim.material.projects.has(sim.construction.id));
    assert.ok(sim.construction.delivered>=0);
    assert.ok(sim.construction.delivered<=sim.construction.total);
  }
  assert.ok(sim.material.countAll()>=0);
});


test('MW-INTEGRATION-003: an unhappy adult autonomously packs, walks, pitches a tent and returns',()=>{
  const sim=new Civilization();
  const a=sim.agents[0];
  sim.seconds=300;sim.day=5;
  a.cognition.visited.push({x:20,z:2,time:260});
  a.social.frustration=92;
  sim.material.add('wood',3);
  sim.syncStock();
  sim.decide(a);
  assert.equal(a.purpose,'departWood');
  let sawCamp=false;
  for(let i=0;i<600;i++){
    sim.update(.2);
    if(sim.material.tents.length){sawCamp=true;break;}
  }
  assert.ok(sawCamp,'Discontent person must physically reach the camp and pitch a tent');
  assert.equal(a.profile.departures,1);
  assert.equal(a.social.status,'camping');
  assert.ok(sim.material.tents[0].x>=15);
  assert.ok(a.profile.timeline.some(event=>event.event==='Postavil si stan'));
  let returned=false;
  for(let i=0;i<1300;i++){
    sim.update(.2);
    if(a.social.status==='resident'&&a.profile.timeline.some(event=>event.event==='Vrátil se do osady')){
      returned=true;break;
    }
  }
  if(!returned){
    console.error('MW007_RETURN_DEBUG',JSON.stringify({
      now:sim.seconds,expectedReturn:a.social.expectedReturn,
      status:a.social.status,mode:a.mode,purpose:a.purpose,
      position:{x:a.x,z:a.z},target:a.target,
      routeNodes:a.waypoints?.length,reason:a.reason,carried:sim.material.cargo(a).length,
      tents:sim.material.tents.map(t=>({x:t.x,z:t.z})),
      pathHome:planWalk(a,{x:0,z:0},solidFootprints(sim))?.length??null
    }));
  }
  assert.ok(returned,'The citizen must be able to return after some days');
  assert.ok(sim.material.items.every(item=>sim.material.containers.has(item.container)));
});

test('MW008-INTEGRATION-004: a real autonomous completed house passes surveyed, graded, hauled, foundation, scaffold and finishing phases',()=>{
  const sim=new Civilization();
  sim.material.add('wood',32);
  sim.material.add('stone',16);
  sim.syncStock();
  for(let i=0;i<2800&&sim.material.structures.length===0;i++)sim.update(.2);
  const house=sim.material.structures.find(s=>s.type==='house');
  assert.ok(house,'Builders should autonomously finish at least one structure with available materials');
  assert.equal(house.groundPrepared,true);
  assert.equal(house.scaffoldingDismantled,true);
  const order=house.stages.map(step=>step.phase);
  for(const phase of ['survey','grading','hauling','foundation','frame','finish','complete']){
    assert.ok(order.includes(phase),'Missing real work phase '+phase);
  }
  for(let i=1;i<order.length;i++){
    const phases=['survey','clear','grading','hauling','foundation','frame','finish','complete'];
    assert.ok(phases.indexOf(order[i])>phases.indexOf(order[i-1]),'Construction stages must advance in order');
  }
  assert.ok(house.clearedCount>=0);
  assert.ok(sim.material.logistics.constructionDeliveries>=RECIPES.house.wood,
    'Each material was truly carried to the site');
});

test('MW009-INTEGRATION-001: thirsty citizen must discover, travel and drink at actual finite spring',()=>{
  const sim=new Civilization(),agent=sim.agents[0];
  const spring=sim.springs[0];
  // The citizen learns the spring by personally approaching it, not from an oracle.
  agent.x=spring.x+2.1;agent.z=spring.z+2.4;
  agent.thirst=90;agent.mode='idle';
  agent.cognition.lastScan=-100;
  for(let i=0;i<800&&agent.thirst>40;i++)sim.update(.2);
  assert.ok(agent.cognition.resources['spring:'+spring.id],'Real perception creates individual source knowledge');
  assert.ok(agent.thirst<40,'They actually drank from the spring at its coordinates');
  assert.ok(spring.stock<spring.maxStock);
  assert.ok(agent.memories.some(m=>m.includes('pramene')),'The drink was remembered');
});

test('MW009-INTEGRATION-002: a year actually ages living residents and adds a causally dated event',()=>{
  const sim=new Civilization(),person=sim.agents[0];
  const age=person.profile.age;
  // Advance chronology at the boundary; movement is NOT claimed to simulate 365 days.
  sim.nextMeal=365*75;
  sim.seconds=365*75-.2;
  sim.update(.2);
  assert.equal(person.profile.age,age+1);
  assert.ok(sim.chronicle.some(entry=>entry.title==='Nový rok světa'));
  assert.ok(person.profile.timeline.some(event=>event.event==='Narozeniny'));
});

test('MW009-SAVE-INTEGRATION-001: real world state survives reload without losing material identities or history',()=>{
  const original=new Civilization();
  original.material.add('wood',5);
  original.springs[0].stock=9;
  original.paths.record(7,4,2);
  const actor=original.agents[0];
  const id=original.material.items.find(i=>i.type==='wood'&&original.material.isAvailable(i)).id;
  assert.equal(original.material.pickupStorage(actor,[id]),true);
  original.meetings.set(999,{first:0,second:1,ready:new Set([0]),done:false});
  original.addEvent('Skutečná událost','Zapsaná historie světa.','⌛');
  const baseline=original.material.countAll();
  const json=serializeWorld(original);
  assert.ok(json.includes('Skutečná událost'));
  const restored=new Civilization();
  const info=restoreWorld(restored,json);
  assert.equal(info.day,original.day);
  assert.equal(restored.material.countAll(),baseline,'A saved cargo piece may be dropped, never deleted or duplicated');
  assert.equal(restored.springs[0].stock,9);
  assert.ok(restored.paths.cells instanceof Map);
  assert.ok(restored.paths.trafficAt(7,4)>0);
  assert.ok(restored.chronicle.some(e=>e.title==='Skutečná událost'));
  assert.ok(restored.agents.every(p=>p.mode==='idle'&&p.waypoints.length===0));
  assert.ok(restored.material.items.every(item=>restored.material.containers.has(item.container)));
  assert.equal(restored.meetings.size,0,'Interrupted conversations restart, not resume stale pointers');
  assert.ok(restored.chronicle.some(e=>e.title==='Návrat do světa'));
  restored.update(.2);
  assert.ok(restored.agents.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)));
});

test('MW009-SAVE-INTEGRATION-002: refuses corrupt save and leaves current world unchanged',()=>{
  const sim=new Civilization(),age=sim.agents[0].profile.age;
  assert.throws(()=>restoreWorld(sim,'{"version":0,"state":{}}'),/Unsupported/);
  assert.throws(()=>restoreWorld(sim,'invalid'),/Unexpected|JSON|position|token/i);
  assert.equal(sim.agents[0].profile.age,age);
});

test('MW009B-LIFE-001: dependent children never mine/build or appear as autonomous adults',()=>{
  const sim=new Civilization(),[a,b]=sim.agents;
  a.relationships[b.id]=95;b.relationships[a.id]=95;
  a.x=1;a.z=1;b.x=1.5;b.z=1;
  for(let day=7;day<=420;day++){
    if(day===7){
      const events=populationDay(sim,day);
      assert.ok(events.some(e=>e.kind==='partnership'));
    }
    if(day===45){
      sim.material.add('wood',30);
      sim.material.add('stone',20);
      sim.material.addStructure('house',5,8,a.id,1);
    }
    if(day%30===0||day>=315)populationDay(sim,day);
  }
  const children=sim.agents.filter(person=>person.profile.bornDay>1);
  assert.ok(children.length>=1,'Life cycle can autonomously create genuine children given support');
  for(const child of children){
    assert.equal(child.profile.age,0);
    assert.equal(child.mode,'dependent');
    assert.equal(child.purpose,'childhood');
    assert.ok(child.profile.genealogy.parentIds.length===2);
    assert.ok(sim.agents[child.profile.genealogy.parentIds[0]].profile.genealogy.childIds.includes(child.id));
  }
  for(let i=0;i<100;i++)sim.update(.15);
  for(const child of children)assert.ok(child.purpose!=='building'&&child.purpose!=='harvest');
  assert.ok(livingSummary(sim.agents).children>=1);
});
