import test from 'node:test';
import assert from 'node:assert/strict';
import {Civilization,terrainHeight} from '../src/simulation-core.js';
import {initializeIslands,islandOf,forbidsWalkingAcrossSea,discoverFarShore,
  coastalArrival,coastalComplete,advanceVoyage,advancePredators,considerCoast} from '../src/island-life.js';
import {evaluateProfession,updateProfessions,mentorAtMeeting} from '../src/professions.js';
import {serializeWorld,restoreWorld} from '../src/world-save.js';
import {observeNearby} from '../src/cognition.js';
import {drinkFromSpring} from '../src/water-cycle.js';

test('second island is part of the simulation, not just an invented number in a UI',()=>{
  const sim=new Civilization();
  assert.equal(sim.islands.predators.length,3);
  assert.ok(sim.trees.some(t=>t.x>70&&t.id>=1000));
  assert.ok(sim.springs.some(t=>t.id==='spring-far'));
  assert.ok(sim.material.containers.has('far-cache'));
  assert.ok(terrainHeight(86,0)>.2);
  assert.ok(terrainHeight(55,0)<-.58);
  const count=sim.trees.length;
  initializeIslands(sim);
  assert.equal(sim.trees.length,count,'Idempotent world setup');
});
test('footpaths cannot cross ocean and a distant island is not known by magic',()=>{
  const sim=new Civilization(),a=sim.agents[0];
  assert.ok(forbidsWalkingAcrossSea({x:0,z:0},{x:86,z:0}));
  assert.equal(islandOf({x:86,z:0}),'far');
  assert.equal(sim.go(a,'explore',{x:86,z:0},'Try illegal water crossing'),false);
  assert.notEqual(a.mode,'walk');
  assert.notEqual(a.cognition.islands?.far?.seen,true);
  assert.equal(discoverFarShore(sim,a),false);
  a.x=39;a.z=0;
  assert.equal(discoverFarShore(sim,a),true);
  assert.equal(discoverFarShore(sim,a),false,'One first-hand discovery only');
  assert.equal(a.cognition.islands.far.origin,'seen');
});
test('vessel is built using five existing wood IDs physically transported to coast',()=>{
  const sim=new Civilization(),a=sim.agents[0];
  const initial=sim.material.count('wood');
  sim.material.add('wood',5,'woodpile');
  a.vesselPlan={type:'raft',woodIds:[],stoneIds:[]};
  a.purpose='collectVesselWood';a.x=-1.8;a.z=2.1; // reachable edge of woodpile
  assert.equal(coastalArrival(sim,a),true);
  assert.equal(a.vesselPlan.woodIds.length,5);
  assert.equal(sim.material.cargo(a).filter(i=>i.type==='wood').length,5);
  a.x=39;a.z=0;a.purpose='deliverVesselWood';
  assert.equal(coastalArrival(sim,a),true);
  assert.equal(a.purpose,'assemblingVessel');
  assert.equal(sim.material.count('wood'),initial,'Wood is reserved while under construction');
  const consumed=[...a.vesselPlan.woodIds];
  assert.equal(coastalComplete(sim,a),true);
  assert.equal(sim.islands.vessels.length,1);
  assert.equal(sim.islands.vessels[0].type,'raft');
  assert.equal(sim.material.items.filter(i=>consumed.includes(i.id)).length,0);
  assert.equal(sim.material.count('wood'),initial);
  assert.equal(sim.islands.vessels[0].side,'home');
});
test('boats move continuously, are exclusive and their return is an actual voyage',()=>{
  const sim=new Civilization(),a=sim.agents[0];
  const v={id:1,type:'boat',side:'home',inUse:null,x:39,z:0,builderId:0,day:sim.day};
  sim.islands.vessels.push(v);
  a.x=39;a.z=0;a.energy=100;a.resource={side:'home',vesselId:v.id};a.purpose='boardVoyage';
  assert.equal(coastalArrival(sim,a),true);
  assert.equal(a.mode,'voyage');assert.equal(v.inUse,0);
  advanceVoyage(sim,a,3);
  assert.ok(a.x>39&&a.x<70,'Crossing moves through intervening water');
  assert.equal(v.x,a.x);
  advanceVoyage(sim,a,20);
  assert.equal(a.x,70);assert.equal(a.mode,'idle');assert.equal(v.side,'far');
  assert.equal(v.inUse,null);assert.equal(sim.islands.crossings,1);
  assert.equal(sim.go(a,'eat',{x:0,z:0},'Walk home across water'),false);
  a.resource={side:'far',vesselId:1};a.purpose='boardVoyage';a.energy=100;
  assert.equal(coastalArrival(sim,a),true);
  advanceVoyage(sim,a,20);
  assert.equal(a.x,39);assert.equal(v.side,'home');
  assert.equal(sim.islands.returns,1);
});
test('hungry sea creatures hunt a physical swimmer and have a finite fish supply',()=>{
  const sim=new Civilization(),a=sim.agents[0];
  const beast=sim.islands.predators[0];
  beast.hunger=100;beast.lastAttack=-100;
  a.x=beast.anchorX;a.z=beast.anchorZ;a.health=100;
  a.mode='voyage';a.voyage={vesselId:null,fromSide:'home',from:{x:39,z:0},
    to:{x:70,z:0},progress:.3,started:0};
  advancePredators(sim,1);
  assert.ok(a.health<100,'An attack causes a measurable injury');
  assert.ok(beast.hunger<100);
  assert.ok(sim.islands.attacks>=1);
});
test('new professions emerge from practiced combinations and mentorship requires a meeting',()=>{
  const sim=new Civilization(),first=sim.agents[0],second=sim.agents[1];
  first.profile.skills.wood=10;first.profile.skills.farm=7;
  first.profile.skills.craft=9;first.profile.skills.navigation=5;
  first.profile.skills.exploration=9;
  assert.equal(evaluateProfession(first).id,'shipwright');
  const roles=updateProfessions(sim);
  assert.ok(roles.some(r=>r.id===first.id&&r.role==='Loďař'));
  const earlier=second.profile.skills.craft;
  assert.deepEqual(mentorAtMeeting(first,second,sim),[],'No skills through remote telepathy');
  first.relationships[second.id]=50;
  const taught=mentorAtMeeting(first,second,sim);
  assert.ok(taught.length>=1);assert.ok(second.profile.skills.craft>=earlier);
  const repeated=mentorAtMeeting(first,second,sim);
  assert.equal(repeated.length,0,'Knowledge copying is limited per encounter');
});
test('snapshot keeps an in-progress voyage, exact vessel reservation and world state',()=>{
  const sim=new Civilization(),a=sim.agents[0];
  sim.islands.vessels.push({id:17,type:'raft',side:'home',inUse:0,x:52,z:0});
  a.x=52;a.z=0;a.mode='voyage';a.purpose='seaCrossing';
  a.voyage={vesselId:17,fromSide:'home',from:{x:39,z:0},to:{x:70,z:0},
    progress:13/31,started:sim.seconds};
  const loaded=new Civilization();
  restoreWorld(loaded,serializeWorld(sim));
  assert.equal(loaded.agents[0].mode,'voyage');
  assert.equal(loaded.agents[0].x,52);
  assert.equal(loaded.islands.vessels[0].inUse,0);
  advanceVoyage(loaded,loaded.agents[0],3);
  assert.ok(loaded.agents[0].x>52);
});
test('deterministic world with island life evolves equally under matching steps',()=>{
  const a=new Civilization(),b=new Civilization();
  for(let i=0;i<70;i++){a.update(1);b.update(1);}
  assert.equal(a.seconds,b.seconds);
  assert.deepEqual(a.islands,b.islands);
  assert.deepEqual(a.agents.map(p=>[p.x,p.z,p.health,p.mode]),
    b.agents.map(p=>[p.x,p.z,p.health,p.mode]));
});

test('curious founder autonomously chooses a walk to the coastline without knowing the island',()=>{
  const sim=new Civilization(),a=sim.agents[5]; // independently curious personality
  assert.ok(a.personality.curiosity>=80);
  sim.day=3;sim.seconds=155;
  a.energy=100;a.health=100;a.hunger=0;a.thirst=0;
  a.social.status='resident';a.choiceAt=0;
  const previous=sim.random;sim.random=()=>0;
  try{
    assert.equal(considerCoast(sim,a),true);
    assert.equal(a.purpose,'scoutCoast');
    assert.ok(a.waypoints.length>0,'Actual traversable walking route required');
  }finally{sim.random=previous;}
});
test('the far-side food cache cannot magically feed the mainland',()=>{
  const sim=new Civilization();
  const initial=sim.material.foodCount();
  sim.material.add('berry',3,'far-cache');
  assert.equal(sim.material.foodCount(),initial);
  assert.equal(sim.material.countStored('berry'),initial+3);
  const source=sim.material.findFoodSource();
  assert.notEqual(source?.container.id,'far-cache');
  assert.ok(sim.material.consumeFoodFrom('far-cache'),'A local agent can consume local stock');
  assert.equal(sim.material.foodCount(),initial);
});

test('founders can visibly spot drinking water, but must physically approach to drink',()=>{
  const sim=new Civilization(),a=sim.agents[0];
  a.x=0;a.z=0;a.thirst=75;
  const source=sim.springs.find(s=>s.id==='spring-1');
  assert.ok(Math.hypot(source.x-a.x,source.z-a.z)>7.5);
  observeNearby(a,{springs:sim.springs},sim.seconds,7.5);
  assert.ok(a.cognition.resources['spring:spring-1']);
  assert.equal(drinkFromSpring(source,a),false);
});

test('a missing conversation partner cannot freeze a citizen until starvation',()=>{
  const sim=new Civilization(),first=sim.agents[0],second=sim.agents[1];
  for(const agent of [first,second]){
    agent.mode='waiting';agent.purpose='waiting';agent.conversation=99;
    agent.choiceAt=Infinity;agent.hunger=80;agent.thirst=85;
  }
  sim.meetings.set(99,{first:first.id,second:second.id,
    ready:new Set([first.id]),done:false,startedAt:sim.seconds-60});
  sim.update(1);
  assert.equal(sim.meetings.has(99),false);
  assert.equal(first.conversation,null);assert.equal(second.conversation,null);
  assert.equal(first.mode,'idle');assert.equal(second.mode,'idle');
  assert.ok(Number.isFinite(first.choiceAt));
});
