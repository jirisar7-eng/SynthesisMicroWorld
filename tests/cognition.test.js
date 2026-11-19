import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initCognition, observeNearby, chooseKnownResource, exchangeKnowledge,
  learnOutcome, chooseExplorationTarget, knowledgeSummary, decision, episode
} from '../src/cognition.js';

const agent = (id, name, x=0, z=0) => initCognition({id,name,x,z});

test('MW-KNOW-001: unknown remote sources cannot be targeted omnisciently', () => {
  const a=agent(1,'Adam');
  const tree={id:12,x:25,z:4,stock:9};
  observeNearby(a,{trees:[tree]},0,7);
  assert.equal(chooseKnownResource(a,'tree',1),null);
  assert.equal(knowledgeSummary(a).trees,0);
});

test('MW-KNOW-002: direct sighting becomes individual knowledge only', () => {
  const a=agent(1,'Adam'),b=agent(2,'Ema');
  const tree={id:4,x:6,z:0,stock:9};
  const discovered=observeNearby(a,{trees:[tree]},1,7);
  assert.equal(discovered.length,1);
  assert.equal(chooseKnownResource(a,'tree',2).id,4);
  assert.equal(chooseKnownResource(b,'tree',2),null);
  assert.equal(a.cognition.resources['tree:4'].origin,'seen');
});

test('MW-KNOW-003: communication transfers dated hearsay not omniscient live data', () => {
  const a=agent(1,'Adam'),b=agent(2,'Ema');
  const berry={id:1,x:3,z:2,stock:10};
  observeNearby(a,{berries:[berry]},1);
  const shared=exchangeKnowledge(a,b,5,2);
  assert.equal(shared.length,1);
  assert.equal(b.cognition.resources['berry:1'].origin,'heard');
  assert.equal(b.cognition.resources['berry:1'].from,'Adam');
  assert.equal(b.cognition.resources['berry:1'].lastSeen,1);
  assert.equal(chooseKnownResource(b,'berry',6).id,1);
  berry.stock=0;
  assert.equal(b.cognition.resources['berry:1'].estimatedStock,10,'Rumor must not update magically');
  assert.equal(knowledgeSummary(b).received,1);
});

test('MW-KNOW-004: seeing real depletion overrides hearsay, not vice versa', () => {
  const a=agent(1,'Adam'),b=agent(2,'Ema');
  const tree={id:2,x:1,z:1,stock:6};
  observeNearby(a,{trees:[tree]},1);
  observeNearby(b,{trees:[tree]},2);
  tree.stock=0;
  learnOutcome(b,'tree',tree,0,3);
  const heard=exchangeKnowledge(a,b,5,3);
  assert.equal(heard.length,0);
  assert.equal(b.cognition.resources['tree:2'].estimatedStock,0);
  assert.equal(chooseKnownResource(b,'tree',12),null);
});

test('MW-KNOW-005: a failed trip modifies future selection and leaves an episode', () => {
  const a=agent(1,'Adam');
  const first={id:1,x:3,z:0,stock:4};
  const other={id:2,x:4,z:0,stock:7};
  observeNearby(a,{trees:[first,other]},1);
  assert.equal(chooseKnownResource(a,'tree',2).id,1);
  first.stock=0;
  learnOutcome(a,'tree',first,0,4);
  assert.equal(chooseKnownResource(a,'tree',5).id,2);
  assert.equal(a.cognition.experience.tree.failed,1);
  assert.match(knowledgeSummary(a).lastEpisode.outcome,/nebude důvěřovat/);
});

test('MW-KNOW-006: exploration chooses a new area without examining resource locations', () => {
  const a=agent(1,'Adam');
  const target=chooseExplorationTarget(a,1,()=>.42);
  assert.ok(Number.isFinite(target.x) && Number.isFinite(target.z));
  assert.ok(Math.hypot(target.x,target.z)<=32.8);
  assert.ok(Math.hypot(target.x,target.z)>5);
});

test('MW-KNOW-007: plans, reasons and consequences retain bounded readable history', () => {
  const a=agent(1,'Adam');
  decision(a,10,'Prozkoumat údolí','Neví o známém zdroji');
  for(let i=0;i<30;i++) episode(a,{time:i,title:'Událost '+i,cause:'Vlastní pokus',outcome:'Poznal okolí'});
  const summary=knowledgeSummary(a);
  assert.equal(summary.lastDecision.goal,'Prozkoumat údolí');
  assert.equal(a.cognition.episodes.length,14);
  assert.equal(summary.lastEpisode.title,'Událost 29');
});
