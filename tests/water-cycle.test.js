import test from 'node:test';
import assert from 'node:assert/strict';
import {createSprings,springRefill,drinkFromSpring,waterAvailability} from '../src/water-cycle.js';
import {initializeLife,needsDecision,updateLife} from '../src/life.js';
import {initCognition,observeNearby,chooseKnownResource,learnOutcome} from '../src/cognition.js';

test('MW009-WATER-001: every litre-equivalent is consumed only at the real spring',()=>{
  const springs=createSprings(),s=springs[0],far={id:1,x:0,z:0,thirst:96};
  const base=waterAvailability(springs);
  assert.equal(drinkFromSpring(s,far),false);
  assert.equal(waterAvailability(springs),base);
  far.x=s.x+1.3;far.z=s.z;
  assert.equal(drinkFromSpring(s,far),true);
  assert.ok(far.thirst<30);
  assert.equal(waterAvailability(springs),base-1);
});

test('MW009-WATER-002: drought reduces recharge; springs never exceed finite volume',()=>{
  const dry=createSprings(),rain=createSprings();
  for(const s of dry)s.stock=0;
  for(const s of rain)s.stock=0;
  springRefill(dry,'drought');
  springRefill(rain,'rain');
  assert.ok(waterAvailability(dry)<waterAvailability(rain));
  for(let i=0;i<100;i++)springRefill(rain,'rain');
  assert.equal(waterAvailability(rain),rain.reduce((n,s)=>n+s.maxStock,0));
});

test('MW009-WATER-003: discovering water is personal, not omniscient knowledge',()=>{
  const src=createSprings()[0];
  const person=initCognition(initializeLife({id:2,name:'Karel',x:0,z:0},2));
  assert.equal(chooseKnownResource(person,'spring',1),null);
  person.x=src.x+3;person.z=src.z;
  const discovered=observeNearby(person,{springs:[src]},12);
  assert.equal(discovered.length,1);
  const known=chooseKnownResource(person,'spring',12);
  assert.equal(known?.id,src.id);
  learnOutcome(person,'spring',src,1,18);
  assert.equal(person.cognition.experience.spring.success,1);
});

test('MW009-WATER-004: thirst outranks ordinary work and reacts to drought',()=>{
  const person=initializeLife({id:0,energy:70,mode:'idle',purpose:''},0);
  person.thirst=70;
  assert.equal(needsDecision(person,12),'drink');
  updateLife(person,10,'drought');
  assert.ok(person.thirst>78);
  assert.equal(needsDecision(person,12),'drink');
});
