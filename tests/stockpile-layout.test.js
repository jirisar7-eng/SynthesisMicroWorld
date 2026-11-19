import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutStockItem,stockSlotGroup} from '../src/stockpile-layout.js';
import {MaterialWorld} from '../src/material-world.js';

const container=(kind,id='test')=>({kind,id,x:3,z:-2,roof:false});

test('MW-STOCK-001: logs form stacked compact alternating courses, not an endless single row',()=>{
  const c=container('pile','woodpile'),wood={id:4,type:'wood',container:c.id};
  const first=Array.from({length:36},(_,i)=>layoutStockItem(wood,c,i));
  const firstLayer=first.slice(0,9),second=first.slice(9,18);
  assert.equal(new Set(firstLayer.map(p=>p.height)).size,1);
  assert.ok(second.every(p=>p.height>firstLayer[0].height));
  assert.ok(Math.abs(firstLayer[0].yaw-second[0].yaw)>1.3);
  assert.ok(first.every(p=>Math.abs(p.x-c.x)<1.5&&Math.abs(p.z-c.z)<1.5));
  assert.ok(first.every(p=>Number.isFinite(p.height)&&p.height>.12));
  assert.ok(new Set(firstLayer.map(p=>p.x.toFixed(1))).size>=3);
  assert.ok(new Set(firstLayer.map(p=>p.z.toFixed(1))).size>=3);
  const nextStack=layoutStockItem(wood,c,36);
  assert.ok(nextStack.x-c.x>2.0 && nextStack.x-c.x<4.4);
});

test('MW-STOCK-002: stones create a rising irregular mound, not a straight stone strip',()=>{
  const c=container('pile','stonepile'),item={id:44,type:'stone'};
  const slots=Array.from({length:26},(_,i)=>layoutStockItem(item,c,i));
  assert.ok(new Set(slots.map(p=>p.height)).size===3);
  assert.ok(slots.slice(14,23).every(p=>p.height>slots[0].height));
  assert.ok(slots.slice(23).every(p=>p.height>slots[14].height));
  assert.ok(slots.every(p=>Math.hypot(p.x-c.x,p.z-c.z)<1.2));
  assert.ok(new Set(slots.map(p=>p.x.toFixed(1))).size>8);
  assert.ok(new Set(slots.map(p=>p.z.toFixed(1))).size>8);
});

test('MW-STOCK-003: fruit is contained within real basket/crate edges and stacks upward',()=>{
  const basket=container('basket'),crate=container('crate');
  const apple={id:5,type:'apple'};
  const fruit=Array.from({length:12},(_,i)=>layoutStockItem(apple,basket,i));
  assert.ok(fruit.every(p=>Math.hypot(p.x-basket.x,p.z-basket.z)<.42));
  assert.ok(fruit[7].height>fruit[0].height);
  const boxFruit=Array.from({length:24},(_,i)=>layoutStockItem(apple,crate,i));
  assert.ok(boxFruit.every(p=>Math.abs(p.x-crate.x)<.6&&Math.abs(p.z-crate.z)<.45));
  assert.ok(boxFruit[12].height>boxFruit[0].height);
});

test('MW-STOCK-004: hand-carried items have distinct slots near their owner',()=>{
  const carrying=container('carry');
  const items=[{id:1,type:'wood'},{id:2,type:'wood'},{id:3,type:'berry'},{id:4,type:'stone'}];
  assert.ok(items.every(item=>stockSlotGroup(item,carrying)==='all'));
  const positions=items.map((item,i)=>layoutStockItem(item,carrying,i));
  assert.equal(new Set(positions.map(p=>p.x.toFixed(2)+','+p.z.toFixed(2))).size,4);
  assert.ok(positions.every(p=>Math.abs(p.x-carrying.x)<.3&&p.height>=1));
});

test('MW-STOCK-005: basket capacity is finite and overflow stays accountable',()=>{
  const world=new MaterialWorld();
  world.add('twig',5);
  const basket=world.craftBasket(0);
  world.add('apple',15);
  assert.equal(world.items.filter(i=>i.container===basket.id).length,12);
  assert.equal(world.items.filter(i=>i.type==='apple'&&i.container==='crate-1').length,3);
  assert.equal(world.count('apple'),15);
  assert.equal(world.countAll(),14+15);
});

test('MW-STOCK-006: site stacks sit outside the building footprint',()=>{
  const c={...container('site'),buildingWidth:5};
  for(const type of ['wood','stone']){
    const points=Array.from({length:9},(_,i)=>layoutStockItem({id:i,type},c,i));
    assert.ok(points.every(p=>Math.abs(p.x-c.x)>2.6));
  }
});

test('MW-STOCK-007: allocating mixed goods shares positions within one crate',()=>{
  const world=new MaterialWorld();
  world.add('apple',1,'crate-1');
  const apple=world.items.at(-1);
  const firstBerry=world.items.find(x=>x.type==='berry');
  const locationA=world.itemLayout(firstBerry);
  const locationB=world.itemLayout(apple);
  assert.notEqual(locationA.x.toFixed(2)+','+locationA.z.toFixed(2)+','+locationA.height.toFixed(2),
    locationB.x.toFixed(2)+','+locationB.z.toFixed(2)+','+locationB.height.toFixed(2));
});
