import test from 'node:test';
import assert from 'node:assert/strict';
import {MaterialWorld} from '../src/material-world.js';
import {terrainHeight} from '../src/simulation-core.js';
import {footprintOverlaps,solidFootprints} from '../src/spatial-world.js';
import {planStockVisuals,stockItemRadius} from '../src/visual-stockyard.js';
import {chooseVisualItems} from '../src/visual-lod.js';

const testWorld=material=>({
  material,trees:[],apples:[],berries:[],stones:[],saplings:[],
  boulders:[],fallenLogs:[],springs:[],
  paths:{trafficAt:()=>0}
});
const visible=m=>chooseVisualItems(m.items,m.containers,
  {maxPerGroup:38,maxTotal:520});
const visual=(m,world=testWorld(m),prev=new Map())=>
  planStockVisuals(world,m,visible(m),terrainHeight,{previousAnchors:prev});
const obstacleList=(m,world=testWorld(m))=>
  solidFootprints(world).filter(s=>!
    [...m.containers.keys()].includes(s.id) && !String(s.id).startsWith('drop-'));

test('MW-019A-001: overlapping baskets and crates get different render-only footprints',()=>{
  const m=new MaterialWorld();
  m.containers.set('basket-test',{
    id:'basket-test',kind:'basket',name:'Koš',x:2.5,z:2.4,roof:false
  });
  m.add('apple',7,'basket-test');
  const before=m.items.map(i=>({...i}));
  const old=[...m.containers.values()].map(c=>({...c}));
  const result=visual(m),crate=result.containers.get('crate-1');
  const basket=result.containers.get('basket-test');
  assert.ok(crate&&basket);
  assert.equal(footprintOverlaps(basket.x,basket.z,.64,.64,
    {shape:'box',...crate,hx:.83,hz:.76},.16),false);
  assert.deepEqual(m.items,before);
  assert.deepEqual([...m.containers.values()],old);
  assert.ok(result.stats.relocatedContainers>=1);
});

test('MW-019A-002: stock container cannot be drawn through an existing house',()=>{
  const m=new MaterialWorld();
  const c=m.containers.get('crate-1');
  m.addStructure('house',c.x,c.z,0,0);
  const house=obstacleList(m).find(s=>s.id==='building-1');
  assert.ok(house);
  const result=visual(m),p=result.containers.get(c.id);
  assert.ok(p,'nearest safe container spot must exist');
  assert.equal(footprintOverlaps(p.x,p.z,.83,.76,house,.16),false);
  assert.equal(c.x,2.5,'authoritative container coordinates must not move');
  assert.equal(c.z,2.4);
});

test('MW-019A-003: fire and trees are respected without touching simulation coordinates',()=>{
  const m=new MaterialWorld();
  const wood=m.containers.get('woodpile');
  wood.x=0;wood.z=0;
  const world=testWorld(m);
  world.trees.push({id:9,x:3,z:0});
  const layout=visual(m,world);
  const p=layout.containers.get('woodpile');
  assert.ok(p);
  for(const o of obstacleList(m,world)){
    assert.equal(footprintOverlaps(p.x,p.z,1.56,1.44,o,.16),false,
      'Woodpile must avoid '+o.id);
  }
  assert.deepEqual([wood.x,wood.z],[0,0]);
});

test('MW-019A-004: construction stages stay outside project foundations and each other',()=>{
  const m=new MaterialWorld();
  m.projects.set('project-test',{id:'project-test',x:5.1,z:4.9,
    type:'house',complete:false});
  m.containers.set('site-test',{id:'site-test',kind:'site',x:5.1,z:4.9,
    buildingWidth:3.6,name:'Staveniště',roof:false});
  const wood=m.add('wood',8,'site-test');
  const stone=m.add('stone',8,'site-test');
  const result=visual(m);
  const stagePositions=[...wood,...stone].map(i=>({
    id:i.id,type:i.type,pose:result.itemPositions.get(i.id)
  }));
  assert.ok(stagePositions.every(p=>p.pose),'Every staging item must have a render location');
  const foundation=obstacleList(m).find(s=>s.id==='project-test');
  for(const {pose,type} of stagePositions){
    assert.equal(footprintOverlaps(pose.x,pose.z,
      stockItemRadius(type),stockItemRadius(type),foundation,.05),false,
      'No log or stone may be drawn through the foundation');
  }
  const woodPos=stagePositions.filter(x=>x.type==='wood');
  const stonePos=stagePositions.filter(x=>x.type==='stone');
  for(const a of woodPos)for(const b of stonePos)
    assert.ok(Math.hypot(a.pose.x-b.pose.x,a.pose.z-b.pose.z)>.4,
      'Different materials must have separated staging zones');
  assert.equal(m.items.filter(i=>i.container==='site-test').length,16);
});

test('MW-019A-005: ground drops do not overlap a campfire, each other or nearby buildings',()=>{
  const m=new MaterialWorld();
  m.containers.set('drop-999',{id:'drop-999',kind:'drop',x:0,z:0});
  m.add('apple',7,'drop-999');
  m.add('stone',7,'drop-999');
  const items=m.items.filter(i=>i.container==='drop-999');
  const result=visual(m);
  const p=items.map(i=>({type:i.type,pos:result.itemPositions.get(i.id)}));
  assert.ok(p.every(x=>x.pos),'all dropped items have safe positions');
  const blocks=obstacleList(m);
  for(let i=0;i<p.length;i++){
    const a=p[i];
    assert.ok(a.pos.height>0);
    for(const o of blocks){
      assert.equal(footprintOverlaps(a.pos.x,a.pos.z,
        stockItemRadius(a.type),stockItemRadius(a.type),o,.07),false,
        'dropped cargo cannot overlap '+o.id);
    }
    for(let j=i+1;j<p.length;j++){
      const b=p[j];
      const d=Math.hypot(a.pos.x-b.pos.x,a.pos.z-b.pos.z);
      assert.ok(d>stockItemRadius(a.type)+stockItemRadius(b.type),
        'separate dropped objects must not intersect each other');
    }
  }
});

test('MW-019A-006: old saves with an overfilled crate and basket do not form a line through buildings',()=>{
  const m=new MaterialWorld();
  // Treat these real item IDs as legacy data; never rebalance the actual stock.
  m.add('apple',24,'crate-1');
  m.containers.set('basket-old',{id:'basket-old',kind:'basket',
    x:2.5,z:3.1,name:'Starý koš'});
  m.add('apple',24,'basket-old');
  const old=m.items.map(i=>({id:i.id,container:i.container}));
  const result=visual(m);
  for(const id of ['crate-1','basket-old']){
    const c=m.containers.get(id);
    const n=m.items.filter(i=>i.container===id);
    const rendered=n.filter(i=>result.itemPositions.has(i.id));
    const overflow=rendered.slice(c.kind==='crate'?16:12);
    assert.ok(overflow.length,'must exercise legacy overflow');
    const anchor=result.containers.get(id);
    const e=c.kind==='crate'?[.83,.76]:[.64,.64];
    for(const item of overflow){
      const pos=result.itemPositions.get(item.id);
      assert.equal(footprintOverlaps(pos.x,pos.z,
        stockItemRadius(item.type),stockItemRadius(item.type),
        {id,shape:'box',...anchor,hx:e[0],hz:e[1]},.08),false,
        'overflow visually clears the original container');
    }
  }
  assert.deepEqual(m.items.map(i=>({id:i.id,container:i.container})),old);
});

test('MW-019A-007: repeated and reordered snapshots retain stable id-position mapping',()=>{
  const m=new MaterialWorld();
  m.add('apple',18,'crate-1');
  m.add('stone',18,'stonepile');
  const a=visual(m);
  const b=visual(m,testWorld(m),a.containers);
  assert.deepEqual([...a.itemPositions],[...b.itemPositions]);
  assert.deepEqual([...a.containers],[...b.containers]);
  assert.equal(a.stats.unplaced,0);
});

test('MW-019A-008: no mutation on a massive saved inventory, graphical budget remains bounded',()=>{
  const m=new MaterialWorld();
  const goods=m.add('berry',1700,'crate-1');
  const before=goods.map(i=>({id:i.id,container:i.container,wet:i.wet}));
  const result=visual(m);
  assert.ok(result.itemPositions.size<=520);
  assert.equal(m.items.length,1714);
  assert.deepEqual(goods.map(i=>({id:i.id,container:i.container,wet:i.wet})),before);
});

test('MW-019A-009: unsafe terrain is not used as a visual fallback',()=>{
  const m=new MaterialWorld();
  m.containers.set('remote-danger',{id:'remote-danger',kind:'basket',
    x:500,z:500});
  const result=planStockVisuals(testWorld(m),m,visible(m),terrainHeight);
  assert.ok(!result.containers.has('remote-danger'));
  assert.ok(result.stats.unplaced>=0);
});
