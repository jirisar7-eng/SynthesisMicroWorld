import {MaterialWorld} from '../src/material-world.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAvatar,selectPlayerMode,advanceAvatar,encounterEffect} from '../src/avatar-modes.js';
test('MW008-P-001: god walks with same hard collision as NPCs, no wall teleport',()=>{
  const avatar=createAvatar();avatar.x=-3;avatar.z=0;avatar.yaw=Math.PI/2;
  selectPlayerMode(avatar,'god');avatar.controls.forward=true;
  const obstacles=[{id:'wall',shape:'box',x:0,z:0,hx:.65,hz:1.1}];
  for(let i=0;i<80;i++)advanceAvatar(avatar,.06,obstacles);
  assert.ok(avatar.x<-.9,'Visitor never crosses the wall');
  assert.ok(Math.abs(avatar.z)<.2);
});
test('MW008-P-002: invisible visitor does not alter NPC life; visible god increases mood with cooldown',()=>{
  const avatar=createAvatar();avatar.x=1;avatar.z=1;
  const person={x:2,z:2,mood:46,socialNeed:55,social:{frustration:27},
    personality:{empathy:80}};
  selectPlayerMode(avatar,'invisible');
  assert.equal(encounterEffect(person,avatar,15),null);
  assert.equal(person.mood,46);
  selectPlayerMode(avatar,'god');
  assert.equal(encounterEffect(person,avatar,15)?.kind,'god');
  assert.equal(person.mood,63);
  assert.equal(encounterEffect(person,avatar,16),null);
  selectPlayerMode(avatar,'poor');
  assert.equal(encounterEffect(person,avatar,120)?.helpful,true);
  assert.ok(person.mood>63);
  selectPlayerMode(avatar,'observer');avatar.controls.forward=true;
  assert.equal(advanceAvatar(avatar,.08,[]),false);
});
test('MW008-P-003: only documented viewer disguises are accepted',()=>{
  const avatar=createAvatar();
  for(const m of ['god','poor','invisible','observer'])selectPlayerMode(avatar,m);
  assert.throws(()=>selectPlayerMode(avatar,'super-admin'));
});

test('MW008-P-004: voluntary food gift moves existing item ID from NPC cargo into visitor cargo',()=>{
  const world=new MaterialWorld(),citizen={id:12,name:'Ema',x:2,z:2};
  const apple=world.add('apple',1)[0],before=world.countAll();
  assert.equal(world.pickupStorage(citizen,[apple.id]),true);
  const recipient={x:3,z:2};
  const gift=world.giveToVisitor(citizen,recipient);
  assert.equal(gift.id,apple.id);
  assert.equal(world.items.find(item=>item.id===apple.id).container,'carry-visitor');
  assert.equal(world.countAll(),before);
  assert.equal(world.cargo(citizen).length,0);
  assert.equal(world.containers.get('carry-visitor').ownerId,'visitor');
});
