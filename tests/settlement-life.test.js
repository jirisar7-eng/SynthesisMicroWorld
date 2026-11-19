import test from 'node:test';
import assert from 'node:assert/strict';
import {Footpaths} from '../src/footpaths.js';
import {MaterialWorld,RECIPES} from '../src/material-world.js';
import {chooseSettlementSite,decideCommunityProject} from '../src/settlement-planner.js';

test('MW-PATH-001: a footpath is worn by physical movement, never created by player commands',()=>{
  const paths=new Footpaths();
  assert.equal(paths.summary().trails,0);
  for(let i=0;i<12;i++)paths.recordMotion({x:0,z:0},{x:12,z:2},'clear');
  assert.ok(paths.summary().trails>4);
  assert.ok(paths.trafficAt(6,1)>0);
  assert.equal(paths.trafficAt(-25,25),0);
});

test('MW-PATH-002: rain and drought modify ground compaction, and travel has finite bounds',()=>{
  const wet=new Footpaths(),dry=new Footpaths();
  wet.recordMotion({x:0,z:0},{x:8,z:0},'rain');
  dry.recordMotion({x:0,z:0},{x:8,z:0},'drought');
  assert.ok(wet.trafficAt(4,0)<dry.trafficAt(4,0));
  const start=wet.summary().usedCells;
  wet.recordMotion({x:0,z:0},{x:600,z:0},'clear');
  assert.ok(wet.summary().usedCells<=wet.maxCells);
  assert.ok(wet.summary().usedCells>=start);
});

test('MW-MOVE-001: a gathered item exists in real cargo before it reaches the warehouse',()=>{
  const materials=new MaterialWorld();
  const a={id:1,name:'Adam',x:-14,z:8};
  materials.collect(a,'wood',3,{origin:'tree:12',time:8});
  assert.equal(materials.count('wood'),0,'Cargo may not be spent in the village before delivery');
  assert.equal(materials.countCarried(),3);
  const item=materials.cargo(a)[0];
  assert.equal(item.origin,'tree:12');
  assert.ok(Math.abs(materials.itemLayout(item).x-(-14))<1);
  a.x=-4;a.z=2;materials.moveCarrier(a);
  assert.ok(Math.abs(materials.itemLayout(item).x-(-4))<1);
  materials.deliver(a);
  assert.equal(materials.count('wood'),3);
  assert.equal(materials.countCarried(),0);
});

test('MW-MOVE-002: reserved materials are carried in batches, are visible at the site and consumed only on completion',()=>{
  const m=new MaterialWorld(),a={id:0,name:'Adam',x:-3,z:2};
  m.add('wood',12);
  const p=m.createProject(RECIPES.house,{type:'house',x:9,z:7,builderId:0,time:4});
  assert.ok(p);
  assert.equal(m.count('wood'),0,'Reserved goods cannot be double-spent');
  assert.equal(m.countAll(),26,'All material stays physically present until construction completes');
  for(let i=0;i<3;i++){
    const pending=m.pendingProject(p.id,4);
    assert.equal(pending.length,4);
    const ids=pending.map(x=>x.id);
    assert.ok(m.pickProjectLoad(a,p.id,ids));
    assert.equal(m.cargo(a).length,4);
    assert.equal(m.countAll(),26);
    m.depositProjectLoad(a,p.id);
    assert.equal(m.cargo(a).length,0);
  }
  assert.ok(m.projectReady(p.id));
  assert.equal(m.projects.get(p.id).delivered,12);
  assert.equal(m.countAll(),26);
  assert.equal(m.finalizeProject(p.id),true);
  assert.equal(m.countAll(),14);
});

test('MW-MOVE-003: stored items move only after being physically picked up and carried',()=>{
  const m=new MaterialWorld();
  m.add('wood',5);m.addStructure('warehouse',-7,6,0,50);
  const roof=m.nearestRoofedStore();
  const a={id:2,name:'Tobiáš',x:-4,z:2};
  assert.ok(roof);
  const batch=m.planStockTransfer(3);
  assert.equal(batch.ids.length,3);
  assert.equal(m.covered(m.items.find(i=>i.id===batch.ids[0])),false);
  assert.ok(m.pickupStorage(a,batch.ids));
  assert.equal(m.countCarried(),3);
  m.deliver(a,roof.id);
  assert.equal(m.countCarried(),0);
  assert.equal(m.items.filter(i=>i.container===roof.id).length,3);
  assert.ok(m.items.filter(i=>i.container===roof.id).every(i=>m.covered(i)));
});

test('MW-PLACE-001: NPCs select an available site from terrain and explored locations, not a fixed location',()=>{
  const context={height:(x,z)=>1.7+Math.sin(x*.07)*.15,known:[],
    buildings:[{type:'house',x:7,z:0}],obstacles:[{x:-8,z:5}]};
  const site=chooseSettlementSite('farm',context);
  assert.ok(site);
  assert.notEqual(site.x,8.6);
  assert.ok(Math.hypot(site.x,site.z)>5);
  assert.ok(Math.hypot(site.x,site.z)<33);
  assert.ok(Math.abs(site.x-7)>2||Math.abs(site.z)>2);
  const forbidden=chooseSettlementSite('house',{height:()=>-1});
  assert.equal(forbidden,null);
});

test('MW-PLACE-002: a community selects its next useful building only when resources exist',()=>{
  const material=new MaterialWorld();
  assert.equal(decideCommunityProject(material,{height:()=>2}),null);
  material.add('wood',12);
  const next=decideCommunityProject(material,{height:()=>2,known:[{x:8,z:0}]});
  assert.equal(next?.type,'house');
  assert.ok(next?.recipe.wood===12);
});
