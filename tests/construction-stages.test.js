import test from 'node:test';
import assert from 'node:assert/strict';
import {MaterialWorld,RECIPES} from '../src/material-world.js';
import {
  initializeBuildSite,clearNextObject,beginPhase,validStage,phaseProgress,
  CONSTRUCTION_LABELS
} from '../src/construction-stages.js';
const world=()=>{
  const material=new MaterialWorld();
  return {seconds:14,material,
    boulders:[{id:10,x:9,z:8,r:.6}],
    berries:[{id:2,x:10,z:8,stock:7}],
    saplings:[{id:4,x:8,z:9}],fallenLogs:[],
    trees:[{id:6,x:21,z:20}],stones:[]};
};
const site=()=>({id:'project-1',type:'house',x:9,z:8,agentId:0,total:18,delivered:0});
test('MW008-C-001: site work starts before foundation, and target boulder/bush remain until actual NPC clearing',()=>{
  const w=world(),p=initializeBuildSite(w,site());
  assert.equal(p.phase,'survey');assert.equal(p.progress,0);
  assert.equal(p.clearables.length,3);
  assert.equal(w.boulders.length,1);assert.equal(w.berries.length,1);
  assert.equal(validStage(p,true),true); // staging is permitted, construction is not yet active
  beginPhase(p,'clear',24,2);
  assert.equal(validStage(p,true),true);
  const first=clearNextObject(w,p);
  assert.equal(first.type,'boulder');
  assert.equal(w.boulders.length,0);
  assert.equal(w.material.items.filter(i=>i.type==='stone').length,2);
  while(p.clearables.length)clearNextObject(w,p);
  assert.equal(p.cleared,3);
  assert.equal(w.berries.length,0);assert.equal(w.saplings.length,0);
  assert.ok(w.material.items.some(i=>i.type==='twig'));
  assert.ok(w.material.containers.has('cleared-project-1'));
  assert.equal(p.stageHistory.length,2);
});
test('MW008-C-002: foundation cannot start before survey, earthworks and full material delivery',()=>{
  const w=world(),p=initializeBuildSite(w,site());
  beginPhase(p,'foundation',22,0);
  assert.equal(validStage(p,true),false);
  p.surveyed=true;p.graded=true;
  assert.equal(validStage(p,true),false);
  while(p.clearables.length)clearNextObject(w,p);
  assert.equal(validStage(p,false),false);
  assert.equal(validStage(p,true),true);
  beginPhase(p,'frame',32,0);
  assert.equal(p.scaffoldInstalled,true);
  beginPhase(p,'finish',41,0);
  assert.equal(p.scaffoldInstalled,true);
  beginPhase(p,'complete',50,0);
  assert.equal(p.scaffoldInstalled,false);
  assert.equal(p.progress,1);
  assert.equal(CONSTRUCTION_LABELS.frame,'Hrubá stavba a lešení');
});
test('MW008-C-003: phased project progress is monotonic and haul numbers are genuine',()=>{
  const w=world(),p=initializeBuildSite(w,site());
  p.surveyed=true;beginPhase(p,'grading',20,0);
  p.graded=true;beginPhase(p,'hauling',28,0);
  p.delivered=9;assert.ok(phaseProgress(p)>.3&&phaseProgress(p)<.5);
  p.delivered=18;assert.ok(Math.abs(phaseProgress(p)-.52)<.001);
  beginPhase(p,'foundation',40,0);
  assert.ok(p.progress>=.52);
});
