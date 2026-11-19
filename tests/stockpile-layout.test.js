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
  assert.ok(boxFruit.slice(0,16).every(p=>Math.abs(p.x-crate.x)<.6&&Math.abs(p.z-crate.z)<.5));
  assert.ok(boxFruit.slice(0,16).every(p=>p.height>.39&&p.height<.42));
  // Overflow must settle beside the box ON THE GROUND, never tower above its rim.
  assert.ok(boxFruit.slice(16).every(p=>Math.hypot(p.x-crate.x,p.z-crate.z)>.95));
  assert.ok(boxFruit.slice(16).every(p=>p.height>=.15&&p.height<=.17));
  const drop=container('drop');
  const dropped=layoutStockItem(apple,drop,0);
  assert.ok(dropped.height>=.15&&dropped.height<=.17);
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


test('MW-STOCK-008: seed trays cannot grow upward with 20,000 pieces',()=>{
  const c=container('tray','seedtray');
  const seed={id:9,type:'seed'};
  const slots=Array.from({length:20000},(_,i)=>layoutStockItem(seed,c,i));
  assert.ok(slots.every(s=>Number.isFinite(s.x)&&Number.isFinite(s.z)&&Number.isFinite(s.height)));
  assert.ok(Math.max(...slots.map(s=>s.height))<=.16,
    'seed overflow must never form a high column');
  assert.ok(slots.slice(20).every(s=>Math.hypot(s.x-c.x,s.z-c.z)>1),
    'overflow must not occupy the already-full tray');
  const overflow=slots.slice(20,80);
  assert.ok(new Set(overflow.map(s=>Math.round(s.x))).size>2,
    'overflow occupies independent areas rather than a single strip');
  assert.ok(new Set(overflow.map(s=>Math.round(s.z))).size>2);
});

test('MW-STOCK-009: basket remains lower than its rim and never grows into a tower',()=>{
  const c=container('basket','basket-1');
  const apple={id:3,type:'apple'};
  const slots=Array.from({length:500},(_,i)=>layoutStockItem(apple,c,i));
  assert.ok(Math.max(...slots.map(s=>s.height))<.5);
  assert.ok(slots.slice(12).every(s=>Math.hypot(s.x-c.x,s.z-c.z)>1));
  const all=new Set(slots.map(s=>`${s.x.toFixed(4)},${s.z.toFixed(4)},${s.height.toFixed(4)}`));
  assert.equal(all.size,slots.length,'each item retains a distinct physical slot');
});

test('MW-STOCK-010: thousands of logs and stones form multiple low 2D piles',()=>{
  for(const [type,id,limit] of [['wood','woodpile',1.1],['stone','stonepile',.7]]){
    const c=container('pile',id),item={id:10,type};
    const positions=Array.from({length:10000},(_,i)=>layoutStockItem(item,c,i));
    assert.ok(Math.max(...positions.map(p=>p.height))<=limit);
    const piles=type==='wood'?36:26;
    const centers=Array.from({length:25},(_,i)=>positions[i*piles]);
    assert.ok(new Set(centers.map(p=>Math.round(p.x))).size>=4);
    assert.ok(new Set(centers.map(p=>Math.round(p.z))).size>=4);
    assert.ok(centers.some(p=>p.x<c.x&&p.z<c.z), '2D piles spread to different quadrants');
    assert.ok(centers.some(p=>p.x>c.x&&p.z>c.z));
  }
});

test('MW-STOCK-011: layout remains stable and deterministic across saved-world redraws',()=>{
  const c=container('tray','seedtray'),item={id:901,type:'seed'};
  for(const i of [0,19,20,21,100,800,2000]){
    assert.deepEqual(layoutStockItem(item,c,i),layoutStockItem(item,c,i));
  }
});


test('MW-STOCK-012: actual material storage has finite slots with real overflow container IDs',()=>{
  const m=new MaterialWorld();
  m.add('seed',102);
  const seeds=m.items.filter(i=>i.type==='seed');
  assert.equal(seeds.length,102);
  assert.equal(seeds.filter(i=>i.container==='seedtray').length,20);
  const yards=[...m.containers.values()].filter(c=>c.kind==='yard'&&c.storageFamily==='seed');
  assert.ok(yards.length>=4);
  assert.ok(yards.every(c=>c.roof===false && m.storageCount(c.id)<=c.capacity));
  assert.ok(seeds.every(i=>m.containers.has(i.container)));
  assert.equal(new Set(seeds.map(i=>i.id)).size,102);
  assert.equal(m.count('seed'),102);
  assert.equal(m.countAll(),14+102);
  const positions=seeds.map(i=>m.itemLayout(i));
  assert.ok(positions.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.height<.5));
});

test('MW-STOCK-013: wood, stone and fruit never overflow their primary physical storage',()=>{
  const m=new MaterialWorld();
  m.add('wood',160);
  m.add('stone',140);
  m.add('apple',84);
  assert.equal(m.storageCount('woodpile'),36);
  assert.equal(m.storageCount('stonepile'),26);
  assert.equal(m.storageCount('crate-1'),20);
  assert.equal(m.count('wood'),160);
  assert.equal(m.count('stone'),140);
  assert.equal(m.count('apple'),84);
  assert.equal(m.countAll(),14+160+140+84);
  for(const c of m.containers.values()){
    if(Number.isFinite(m.storageLimit(c)))
      assert.ok(m.storageCount(c.id)<=m.storageLimit(c),c.id+' cannot exceed storage capacity');
  }
  const woodYards=[...m.containers.values()].filter(c=>c.kind==='yard'&&c.storageFamily==='wood');
  assert.ok(woodYards.length>=4);
  for(const i of m.items.filter(i=>i.type==='wood')){
    const position=m.itemLayout(i);
    assert.ok(position.height<1.1,'stored wood cannot become a skyscraper');
  }
});

test('MW-STOCK-014: warehouse has limited real covered capacity, never claims outdoor overflow is roofed',()=>{
  const m=new MaterialWorld();
  const warehouse=m.addStructure('warehouse',-7,6,0,50);
  const roof=m.containers.get('covered-'+warehouse.id);
  const goods=m.add('wood',107,roof.id);
  const stored=goods.filter(i=>i.container===roof.id);
  const overflow=goods.filter(i=>i.container!==roof.id);
  assert.equal(stored.length,100);
  assert.equal(overflow.length,7);
  assert.ok(stored.every(i=>m.covered(i)));
  assert.ok(overflow.every(i=>!m.covered(i)&&m.containers.get(i.container).kind==='yard'));
  assert.equal(m.planStockTransfer(4),null,'full warehouse cannot accept another material haul');
  assert.equal(m.count('wood'),107);
});

test('MW-STOCK-015: mixed fruit in one overflow yard uses distinct shared slots',()=>{
  const m=new MaterialWorld();
  m.add('berry',36);
  m.add('apple',12);
  const yard=[...m.containers.values()].find(c=>c.kind==='yard'&&c.storageFamily==='food');
  assert.ok(yard);
  const inYard=m.items.filter(i=>i.container===yard.id);
  const slots=inYard.map(i=>m.itemLayout(i));
  assert.equal(new Set(slots.map(p=>
    `${p.x.toFixed(4)},${p.z.toFixed(4)},${p.height.toFixed(4)}`)).size,slots.length);
});

test('MW-STOCK-016: woven basket placement is a 2D yard, not an infinite horizontal strip',()=>{
  const m=new MaterialWorld();
  m.add('twig',75);
  for(let i=0;i<15;i++)assert.ok(m.craftBasket(i));
  assert.equal(m.baskets.length,15);
  assert.ok(new Set(m.baskets.map(c=>c.x)).size>=4);
  assert.ok(new Set(m.baskets.map(c=>c.z)).size>=4);
});
