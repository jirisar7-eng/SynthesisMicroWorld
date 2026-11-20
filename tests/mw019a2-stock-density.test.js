import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutStockItem} from '../src/stockpile-layout.js';
import {chooseVisualItems} from '../src/visual-lod.js';
import {planStockVisuals,stockItemRadius} from '../src/visual-stockyard.js';
import {MaterialWorld} from '../src/material-world.js';
import {terrainHeight} from '../src/simulation-core.js';
import {footprintOverlaps} from '../src/spatial-world.js';

const world=material=>({
  material,trees:[],apples:[],berries:[],stones:[],saplings:[],
  boulders:[],fallenLogs:[],springs:[],
  paths:{trafficAt:()=>0}
});
const yard=(id,x,z,family='food')=>({
  id,kind:'yard',name:'Existing inventory',x,z,capacity:24,
  roof:false,storageFamily:family
});

test('MW-019A2: 24 real fruit remain inside ONE yard pad, not two linear parcels',()=>{
  const c=yard('yard-food',11,13);
  const points=Array.from({length:24},(_,i)=>layoutStockItem({id:1+i,type:'apple'},c,i));
  for(const p of points){
    assert.ok(Math.abs(p.x-c.x)+stockItemRadius('apple')<1.4);
    assert.ok(Math.abs(p.z-c.z)+stockItemRadius('apple')<1.4);
    assert.ok(p.height>0&&p.height<.25);
  }
  assert.equal(new Set(points.map(p=>p.x.toFixed(3)+','+p.z.toFixed(3))).size,24);
  assert.ok(new Set(points.map(p=>Math.round(p.x*3))).size>=5);
  assert.ok(new Set(points.map(p=>Math.round(p.z*3))).size>=5);
});

test('MW-019A2: seed and twig stock never spill outside real yard pads',()=>{
  for(const [type,count,family] of [['seed',24,'seed'],['twig',28,'twig']]){
    const c=yard('yard-'+type,12,14,family);
    for(let i=0;i<count;i++){
      const pos=layoutStockItem({id:i+1,type},c,i),r=stockItemRadius(type);
      assert.ok(Math.abs(pos.x-c.x)+r<1.4,type+' X position '+i);
      assert.ok(Math.abs(pos.z-c.z)+r<1.4,type+' Z position '+i);
      assert.ok(pos.height<.35,type+' cannot form a tower');
    }
  }
});

test('MW-019A2: occupied baskets near observer get real visible items within budget',()=>{
  const containers=new Map(),items=[];
  for(let i=0;i<85;i++){
    const id='distant-'+i;
    containers.set(id,{id,kind:'yard',x:60+i*.05,z:5});
    for(let j=0;j<10;j++)items.push({id:i*10+j+1,type:'berry',container:id});
  }
  containers.set('near-basket',{id:'near-basket',kind:'basket',x:1,z:2});
  for(let i=0;i<12;i++)items.push({id:10000+i,type:'apple',container:'near-basket'});
  const original=items.map(x=>({...x}));
  const options={maxPerGroup:10,maxTotal:52,focus:{x:0,z:0}};
  const drawn=chooseVisualItems(items,containers,options);
  assert.equal(drawn.length,52);
  assert.ok(drawn.filter(i=>i.container==='near-basket').length>=5);
  assert.ok(drawn.some(i=>i.container.startsWith('distant-')));
  assert.equal(new Set(drawn.map(i=>i.id)).size,drawn.length);
  assert.deepEqual(chooseVisualItems(items,containers,options),drawn);
  assert.deepEqual(items,original);
});

test('MW-019A2: mixed berries and apples share distinct in-pad visual positions',()=>{
  const m=new MaterialWorld(),c=yard('mixed-food',12,12);
  m.containers.set(c.id,c);
  const fruit=[...m.add('berry',12,c.id),...m.add('apple',12,c.id)];
  const visuals=chooseVisualItems(m.items,m.containers,
    {maxPerGroup:30,maxTotal:520,focus:{x:12,z:12}});
  const before=fruit.map(item=>({id:item.id,type:item.type,container:item.container}));
  const layout=planStockVisuals(world(m),m,visuals,terrainHeight);
  const positions=fruit.map(item=>layout.itemPositions.get(item.id));
  assert.ok(positions.every(Boolean));
  assert.equal(new Set(positions.map(p=>p.x.toFixed(3)+','+p.z.toFixed(3))).size,24);
  assert.ok(positions.every(p=>Math.abs(p.x-layout.containers.get(c.id).x)<1.3));
  assert.deepEqual(fruit.map(i=>({id:i.id,type:i.type,container:i.container})),before);
});

test('MW-019A2: legacy excess beyond pad gets individual collision checks',()=>{
  const m=new MaterialWorld(),c=yard('legacy-food',13,13);
  m.containers.set(c.id,c);
  const fruit=m.add('apple',30,c.id);
  for(const item of fruit)item.container=c.id;
  const visuals=chooseVisualItems(m.items,m.containers,
    {maxPerGroup:35,maxTotal:520,focus:{x:13,z:13}});
  const layout=planStockVisuals(world(m),m,visuals,terrainHeight);
  const safePad=layout.containers.get(c.id);
  assert.ok(safePad);
  for(const item of fruit.slice(25)){
    const p=layout.itemPositions.get(item.id);
    assert.ok(p,'legacy item must get a safe place');
    assert.equal(footprintOverlaps(p.x,p.z,.24,.24,
      {shape:'box',id:c.id,...safePad,hx:1.4,hz:1.4},.16),false);
  }
  assert.equal(fruit.filter(i=>i.container===c.id).length,30);
});

test('MW-019A2: actual basket fruit protrudes above shallow rim, without tower',()=>{
  const c={id:'basket-1',kind:'basket',x:2,z:2};
  const first=layoutStockItem({id:1,type:'apple'},c,0);
  const last=layoutStockItem({id:12,type:'apple'},c,11);
  assert.ok(first.height+.16>.525);
  assert.ok(last.height>first.height);
  assert.ok(last.height<.5);
});

test('MW-019A2: exact legacy MW-012 overfilled crate becomes two low separated 2D parcels',()=>{
  const m=new MaterialWorld();
  m.items=[];m.nextId=1;
  const stored=m.add('apple',80,'crate-1');
  for(const item of stored)item.container='crate-1'; // old saved world schema
  const original=stored.map(i=>({id:i.id,container:i.container,type:i.type}));
  const shown=chooseVisualItems(m.items,m.containers,
    {maxPerGroup:38,maxTotal:150,focus:{x:2.5,z:2.4}});
  assert.equal(shown.length,38);
  const layout=planStockVisuals(world(m),m,shown,terrainHeight);
  assert.equal(layout.hidden.size,0,'safe locations must exist around the original crate');
  const crate=layout.containers.get('crate-1');
  const pad={shape:'box',id:'crate-1',...crate,hx:.83,hz:.76};
  const overflow=shown.slice(16);
  const parcels=[overflow.slice(0,16),overflow.slice(16,32)];
  const centers=[];
  for(const group of parcels){
    const positions=group.map(i=>layout.itemPositions.get(i.id));
    assert.ok(positions.every(Boolean));
    const xs=positions.map(p=>p.x),zs=positions.map(p=>p.z);
    assert.ok(Math.max(...xs)-Math.min(...xs)<1.5,
      'legacy food must form a compact pad, never an endless straight row');
    assert.ok(Math.max(...zs)-Math.min(...zs)<1.5);
    centers.push({
      x:(Math.max(...xs)+Math.min(...xs))/2,
      z:(Math.max(...zs)+Math.min(...zs))/2
    });
    for(const p of positions){
      assert.equal(footprintOverlaps(p.x,p.z,.24,.24,pad,.12),false,
        'surplus cannot be drawn through the storage crate');
    }
  }
  assert.ok(Math.hypot(centers[0].x-centers[1].x,centers[0].z-centers[1].z)>1.3,
    'two surplus parcels must not overlap each other');
  assert.deepEqual(stored.map(i=>({id:i.id,container:i.container,type:i.type})),original);
});
