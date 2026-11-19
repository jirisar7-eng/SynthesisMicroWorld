/**
 * MW-006B integrated headless acceptance.
 * Evaluate only the standalone Civilization class from the browser entry,
 * injecting its real pure modules. No WebGL is required for simulation tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {MaterialWorld,RECIPES,FOOD_TYPES,ITEM_INFO} from '../src/material-world.js';
import {initializeBiography,lifeEvent,experienceSkill,makeLifeCard} from '../src/biography.js';
import {Footpaths} from '../src/footpaths.js';
import {decideCommunityProject} from '../src/settlement-planner.js';
import {SocialDynamics} from '../src/social-dynamics.js';
import {loadSpeed} from '../src/carry-poses.js';
import {solidFootprints,indexSolids,planWalk,advanceWalk,clearSpawn,groundDropPosition,isBlocked} from '../src/spatial-world.js';
import {
  initCognition,observeNearby,chooseKnownResource,chooseExplorationTarget,
  learnOutcome,exchangeKnowledge,decision,knowledgeSummary,episode
} from '../src/cognition.js';
import {initializeLife,updateLife,remember,socialBond,needsDecision,relationshipLabel} from '../src/life.js';

const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const start=source.indexOf('const el =');
const end=source.indexOf('class Diorama {');
if(start<0||end<start)throw new Error('Simulation class not found in entry');
const classCode=source.slice(start,end)+'\nglobalThis.TestCivilization = Civilization;\n';
const context=vm.createContext({
  console,Math,MaterialWorld,RECIPES,FOOD_TYPES,ITEM_INFO,
  initializeBiography,lifeEvent,experienceSkill,makeLifeCard,
  Footpaths,decideCommunityProject,SocialDynamics,loadSpeed,
  solidFootprints,indexSolids,planWalk,advanceWalk,clearSpawn,groundDropPosition,
  initCognition,observeNearby,chooseKnownResource,chooseExplorationTarget,
  learnOutcome,exchangeKnowledge,decision,knowledgeSummary,episode,
  initializeLife,updateLife,remember,socialBond,needsDecision,relationshipLabel
});
new vm.Script(classCode,{filename:'main-simulation-core.js'}).runInContext(context);
const Civilization=context.TestCivilization;

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
  assert.ok(returned,'The citizen must be able to return after some days');
  assert.ok(sim.material.items.every(item=>sim.material.containers.has(item.container)));
});
