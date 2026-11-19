import test from 'node:test';
import assert from 'node:assert/strict';
import {Civilization} from '../src/simulation-core.js';
import {serializeWorld,hydrateWorldMirror} from '../src/world-save.js';
import {GOD_POWER_CATALOG,applyGodPower,validateGodCommand,advanceGodHazards} from '../src/god-powers.js';

const create=()=>new Civilization();
test('MW-GOD: catalog contains all 13 requested domain powers',()=>{
  assert.equal(GOD_POWER_CATALOG.length,13);
  for(const id of ['rain','drought','bloom','forest','spring','deposit','heal','mood',
    'inspire','bless','fire','flood','meteor'])
    assert.ok(GOD_POWER_CATALOG.find(p=>p.id===id));
});
test('MW-GOD: commands enforce valid power, target, radius, geofence, and intensity',()=>{
  const w=create(),original=serializeWorld(w);
  for(const c of [
    {power:'__proto__',target:{type:'world'}},
    {power:'rain',target:{type:'point',x:0,z:0}},
    {power:'meteor',target:{type:'point',x:130,z:0}},
    {power:'forest',target:{type:'point',x:0,z:100}},
    {power:'heal',target:{type:'agent',id:-1}},
    {power:'heal',target:{type:'group',x:0,z:0,radius:200}},
    {power:'drought',target:{type:'world'},intensity:1000},
    {power:'fire',target:{type:'point',x:0,z:0},intensity:NaN}
  ])assert.throws(()=>validateGodCommand(w,c),Error);
  assert.equal(w.godHistory.length,0);
  assert.equal(w.weather.kind,'clear');
  assert.ok(original.includes('"godHistory":[]'));
});
test('MW-GOD: rain, drought and bloom modify actual resources, never NPC tasks',()=>{
  const w=create(),before=w.agents.map(a=>a.purpose);
  const a=applyGodPower(w,{power:'rain',intensity:2,target:{type:'world'}});
  assert.equal(w.weather.kind,'rain');
  assert.equal(a.id,1);
  const berries=w.berries.reduce((s,b)=>s+b.stock,0);
  applyGodPower(w,{power:'drought',intensity:2,target:{type:'world'}});
  assert.ok(w.berries.reduce((s,b)=>s+b.stock,0)<berries);
  assert.deepEqual(w.agents.map(a=>a.purpose),before);
  assert.equal(w.godHistory.length,2);
  assert.ok(w.chronicle.some(e=>e.title.includes('Božský zásah')));
});
test('MW-GOD: living target effects are personal, bounded and recorded',()=>{
  const w=create(),person=w.agents[0];
  person.health=32;person.mood=18;person.energy=24;
  const heal=applyGodPower(w,{power:'heal',intensity:3,target:{type:'agent',id:person.id}});
  assert.equal(person.health,92);
  assert.deepEqual(heal.affectedIds,[person.id]);
  const mood=applyGodPower(w,{power:'mood',intensity:5,target:{type:'agent',id:person.id}});
  assert.equal(person.mood,78);
  applyGodPower(w,{power:'bless',intensity:5,target:{type:'agent',id:person.id}});
  assert.equal(person.health,100);
  assert.ok(person.profile.timeline.some(e=>e.event==='Božský zásah'));
  const dead=w.agents[1];dead.alive=false;
  assert.throws(()=>applyGodPower(w,{power:'heal',target:{type:'agent',id:dead.id}}));
});
test('MW-GOD: forest, spring and stone nodes have IDs and exist physically',()=>{
  const w=create(),at={type:'point',x:26,z:0};
  const counts=[w.trees.length,w.springs.length,w.stones.length];
  const forest=applyGodPower(w,{power:'forest',target:at,intensity:3});
  assert.ok(forest.effects.newTrees>0);
  assert.ok(w.trees.length>counts[0]);
  const water=applyGodPower(w,{power:'spring',target:at,intensity:2});
  assert.ok(water.effects.newSprings>0);
  assert.ok(w.springs.length>counts[1]);
  const stone=applyGodPower(w,{power:'deposit',target:at,intensity:2});
  assert.ok(stone.effects.newDeposits>0);
  assert.ok(w.stones.length>counts[2]);
});
test('MW-GOD: catastrophe hazards injure citizens over time and record eventual outcomes',()=>{
  const w=create(),person=w.agents[0],initial=person.health;
  const attack=applyGodPower(w,{power:'fire',target:{type:'point',x:0,z:0},intensity:2});
  assert.equal(w.godHazards.length,1);
  w.seconds+=3;advanceGodHazards(w,3);
  assert.ok(person.health<initial);
  w.seconds=w.godHazards[0].until+1;advanceGodHazards(w,1);
  assert.equal(w.godHazards.length,0);
  assert.ok(w.godHistory.find(e=>e.id===attack.id).effects.totalDamage>0);
  const meteor=applyGodPower(w,{power:'meteor',target:{type:'point',x:0,z:0},intensity:2});
  assert.equal(w.godLandmarks.length,1);
  assert.ok(meteor.affectedIds.includes(person.id));
});
test('MW-GOD: serialization retains provenance, controls and hazards exactly in viewer',()=>{
  const source=create();
  applyGodPower(source,{power:'flood',target:{type:'point',x:0,z:0},intensity:3});
  source.godControl={paused:true,speed:2};
  const mirror=create();
  hydrateWorldMirror(mirror,serializeWorld(source));
  assert.equal(mirror.godHistory.length,1);
  assert.equal(mirror.godHazards[0].kind,'flood');
  assert.deepEqual(mirror.godControl,{paused:true,speed:2});
  assert.equal(mirror.godHistory[0].id,source.godHistory[0].id);
});
