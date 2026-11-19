import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeLife, updateLife, remember, socialBond, needsDecision, relationshipLabel} from '../src/life.js';

function person(id,name='Osoba') {
  return initializeLife({id,name,energy:80,mode:'idle',purpose:'',relationships:{}},id);
}

test('each individual gets a separate personality, needs, relationships and memory', () => {
  const a=person(0,'Adam'),b=person(1,'Ema');
  assert.notEqual(a.personality.name,b.personality.name);
  assert.notStrictEqual(a.relationships,b.relationships);
  assert.equal(a.memories.length,1);
  assert.ok(a.hunger>0 && a.hunger<100);
});

test('hunger grows with time and mood responds to rain', () => {
  const a=person(0);
  const h=a.hunger,m=a.mood;
  updateLife(a,30,'rain');
  assert.ok(a.hunger>h);
  assert.ok(a.mood<m);
});

test('hungry individual chooses food from real shared stock', () => {
  const a=person(0);a.hunger=90;
  assert.equal(needsDecision(a,12),'eat');
  assert.notEqual(needsDecision(a,0),'eat');
});

test('autonomous person prioritizes exhaustion over a casual social need', () => {
  const a=person(0);a.energy=10;a.socialNeed=90;
  assert.equal(needsDecision(a,5),'rest');
  a.energy=90;
  assert.equal(needsDecision(a,5),'social');
});

test('conversation creates reciprocal friendship and shared memory', () => {
  const a=person(0,'Adam'),b=person(1,'Ema');
  const mood=a.mood;
  socialBond(a,b);
  assert.equal(a.relationships[b.id],b.relationships[a.id]);
  assert.equal(relationshipLabel(a.relationships[b.id]),'Známí');
  assert.ok(a.mood>mood);
  assert.ok(a.memories.at(-1).includes('Ema'));
  assert.ok(b.memories.at(-1).includes('Adam'));
});

test('memory is bounded and latest experiences stay available', () => {
  const a=person(0);
  for(let i=0;i<15;i++) remember(a,'Zkušenost '+i);
  assert.equal(a.memories.length,5);
  assert.equal(a.memories.at(-1),'Zkušenost 14');
});

test('sociable individuals initiate contact sooner than independent ones', () => {
  const reserved=person(0,'Adam');const sociable=person(1,'Ema');
  reserved.socialNeed=65;sociable.socialNeed=65;
  assert.equal(needsDecision(reserved,10),'work');
  assert.equal(needsDecision(sociable,10),'social');
});

test('physical activity consumes more energy from food needs than idling', () => {
  const worker=person(2),observer=person(2);
  worker.purpose='harvest';observer.purpose='resting';
  updateLife(worker,30,'clear');updateLife(observer,30,'clear');
  assert.ok(worker.hunger>observer.hunger);
});
