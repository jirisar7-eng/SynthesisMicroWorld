import test from 'node:test';
import assert from 'node:assert/strict';
import {SocialDynamics} from '../src/social-dynamics.js';
import {MaterialWorld} from '../src/material-world.js';

const makePerson=(id,name)=>({id,name,x:0,z:0,mood:26,hunger:88,energy:16,
  socialNeed:94,relationships:{},cognition:{visited:[{x:0,z:0},{x:18,z:2},{x:22,z:4}]}});
test('MW-SOC-001: real unmet individual needs accumulate tension; adequate needs recover',()=>{
 const social=new SocialDynamics(),person=makePerson(0,'Adam');social.initialize(person);
 for(let i=0;i<160;i++)social.tick(person,.5,{weather:'rain',food:0,houseCount:0,day:4});
 assert.ok(person.social.frustration>45);
 const before=person.social.frustration;
 person.hunger=12;person.energy=89;person.socialNeed=10;person.mood=78;
 for(let i=0;i<100;i++)social.tick(person,.5,{weather:'clear',food:25,houseCount:2,day:5});
 assert.ok(person.social.frustration<before);
});

test('MW-SOC-002: individual cannot leave without personally discovering a safe camp site',()=>{
 const social=new SocialDynamics(),person=makePerson(0,'Adam');social.initialize(person);
 person.social.frustration=89;
 assert.ok(social.canLeave(person,{day:4,time:300,wood:4,food:5,height:()=>2}));
 person.cognition.visited=[{x:0,z:0},{x:4,z:3}];
 assert.equal(social.canLeave(person,{day:4,time:300,wood:4,food:5,height:()=>2}),null);
 assert.equal(social.canLeave(person,{day:4,time:300,wood:1,food:5,height:()=>2}),null);
});

test('MW-SOC-003: departure is a physical sequence, each material remains accounted',()=>{
 const social=new SocialDynamics(),stock=new MaterialWorld(),person=makePerson(1,'Ema');
 stock.add('wood',5);social.initialize(person);
 const site=social.canLeave(person,{day:5,time:350,wood:5,food:stock.foodCount(),height:()=>2});
 person.social.frustration=91;
 const destination=social.canLeave(person,{day:5,time:350,wood:5,food:stock.foodCount(),height:()=>2});
 assert.ok(destination);
 assert.ok(social.beginDeparture(person,destination,350));
 assert.equal(person.social.status,'preparing');
 assert.ok(stock.packDepartureWood(person));
 assert.equal(stock.countCarried(),2);
 assert.equal(stock.count('wood'),3);
 assert.ok(stock.packDepartureFood(person));
 assert.equal(stock.countCarried(),4);
 const allBefore=stock.countAll();
 person.social.status='travelling';
 person.x=destination.x;person.z=destination.z;stock.moveCarrier(person);
 const tent=stock.pitchTent(person,destination,400);
 assert.ok(tent);
 assert.equal(stock.countAll(),allBefore-2,'Exactly two real logs became the tent');
 assert.equal(stock.foodAtTent(tent.id),2);
 assert.equal(stock.countCarried(),0);
 assert.ok(social.establishCamp(person,tent,400));
 assert.equal(social.summary([person]).away,1);
 assert.equal(social.shouldReturn(person,450),false);
 assert.equal(social.shouldReturn(person,530),true);
 assert.ok(stock.eatAtTent(person,tent.id));
 assert.equal(stock.foodAtTent(tent.id),1);
 assert.equal(stock.packTentReturn(person,tent.id),1);
 assert.ok(social.beginReturn(person,530));
 assert.equal(stock.deliver(person),1);
 assert.ok(social.arrivedHome(person,550));
 assert.equal(social.summary([person]).residents,1);
});

test('MW-SOC-004: interpersonal dispute is possible only when frustration exists and damages reciprocal trust',()=>{
 const world=new SocialDynamics(),a=makePerson(1,'Adam'),b=makePerson(2,'Ema');
 world.initialize(a);world.initialize(b);
 a.relationships[b.id]=70;b.relationships[a.id]=70;
 assert.equal(world.markConflict(a,b,4),false);
 a.social.frustration=70;
 assert.equal(world.markConflict(a,b,5),true);
 assert.equal(a.relationships[b.id],55);
 assert.equal(b.relationships[a.id],55);
 assert.equal(world.summary([a,b]).disputes,1);
});
