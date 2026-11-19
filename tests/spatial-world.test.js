import test from 'node:test';
import assert from 'node:assert/strict';
import {MaterialWorld} from '../src/material-world.js';
import {
  CITIZEN_RADIUS,solidFootprints,isBlocked,collides,segmentClear,
  planWalk,advanceWalk,approachPoint,clearSpawn,groundDropPosition,footprintOverlaps
} from '../src/spatial-world.js';

const box=(x,z,hx,hz)=>({shape:'box',x,z,hx,hz,id:'building'});
const circle=(x,z,r)=>({shape:'circle',x,z,r,id:'solid'});
const eq=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)<.02;

test('MW-007A-001: every solid has explicit clearance, including fire, crates, pallets and houses',()=>{
  const material=new MaterialWorld();
  material.addStructure('house',12,2,0,10);
  const obstacles=solidFootprints({material,trees:[{id:1,x:9,z:-9}]});
  assert.ok(obstacles.some(o=>o.id==='camp-fire'));
  assert.ok(obstacles.some(o=>o.id==='crate-1'));
  assert.ok(obstacles.some(o=>o.id==='woodpile'));
  assert.ok(obstacles.some(o=>o.id==='building-1'));
  assert.ok(isBlocked({x:12,z:2},obstacles));
  assert.ok(isBlocked({x:0,z:0},obstacles));
  assert.ok(isBlocked({x:2.5,z:2.4},obstacles));
  assert.ok(isBlocked({x:9,z:-9},obstacles));
  assert.ok(!isBlocked({x:8,z:8},obstacles));
});

test('MW-007A-002: direct sweep detects a wall even when both endpoints are clear',()=>{
  const obstacles=[box(0,0,1.6,1.2)];
  assert.equal(isBlocked({x:-3,z:0},obstacles),false);
  assert.equal(segmentClear({x:-3,z:0},{x:3,z:0},obstacles),false);
  assert.equal(segmentClear({x:-3,z:3},{x:3,z:3},obstacles),true);
});

test('MW-007A-003: A* avoids a house and every route segment is physically clear',()=>{
  const start={x:-5,z:0},finish={x:5,z:0},obstacles=[box(0,0,2,2)];
  const path=planWalk(start,finish,obstacles);
  assert.ok(path?.length>1,'Need a real detour, not a straight line through the house');
  let previous=start;
  for(const p of path){
    assert.equal(segmentClear(previous,p,obstacles),true,'Never cut corners');
    previous=p;
  }
  assert.ok(eq(path.at(-1),finish));
});

test('MW-007A-004: going to an occupied storage position stops outside its footprint',()=>{
  const start={x:5,z:0},target={x:0,z:0},obstacles=[box(0,0,1.4,1.2)];
  const p=approachPoint(start,target,obstacles);
  assert.ok(p);
  assert.ok(!isBlocked(p,obstacles));
  const path=planWalk(start,target,obstacles);
  assert.ok(path);
  assert.ok(eq(path.at(-1),p));
  assert.ok(Math.hypot(p.x,p.z)>1.6);
});

test('MW-007A-005: NPC cannot tunnel through wall on a large timestep',()=>{
  const a={x:-2,z:0,waypoints:[{x:2,z:0}]};
  const blocked=advanceWalk(a,5,[box(0,0,.6,.8)]);
  assert.equal(blocked.blocked,true);
  assert.equal(a.x,-2);
  assert.equal(a.z,0);
});

test('MW-007A-006: a planned detour can be walked without penetration or teleportation',()=>{
  const a={x:-5,z:0},target={x:5,z:0},solids=[box(0,0,2,2)];
  a.waypoints=planWalk(a,target,solids);
  let distance=0,steps=0;
  while(a.waypoints.length&&steps++<350){
    const last={x:a.x,z:a.z};
    const progress=advanceWalk(a,.18,solids);
    assert.equal(progress.blocked,false);
    assert.ok(segmentClear(last,a,solids));
    distance+=Math.hypot(a.x-last.x,a.z-last.z);
    assert.ok(!isBlocked(a,solids,CITIZEN_RADIUS));
  }
  assert.ok(steps<350);
  assert.ok(eq(a,target));
  assert.ok(distance>10,'Path detours around the large building');
});

test('MW-007A-007: spawned NPC and dropped loads remain on separate walkable ground',()=>{
  const obstacles=[circle(0,0,1.35),box(3,2,.7,.7)];
  const spawned=clearSpawn({x:0,z:0},obstacles);
  assert.ok(!isBlocked(spawned,obstacles));
  const dropped=groundDropPosition(spawned,obstacles);
  assert.ok(dropped);
  assert.ok(!isBlocked(dropped,obstacles,.59));
  assert.ok(Math.hypot(dropped.x-spawned.x,dropped.z-spawned.z)>.9);
});

test('MW-007A-008: occupied building footprint rejects overlapping proposed construction',()=>{
  const building=box(8,-4,2.6,2.1);
  assert.ok(footprintOverlaps(10,-4,2,2,building,.7));
  assert.ok(!footprintOverlaps(-8,-4,2,2,building,.7));
  assert.ok(collides({x:9,z:-4},building,.29));
});

test('MW-007A-009: dynamic new obstacle invalidates old route instead of letting NPC cross',()=>{
  const actor={x:-4,z:0,waypoints:[{x:4,z:0}]};
  const obstacles=[];
  assert.equal(advanceWalk(actor,.75,obstacles).blocked,false);
  const newBuilding=[box(0,0,.65,.65)];
  const blocked=advanceWalk(actor,4,newBuilding);
  assert.equal(blocked.blocked,true);
  assert.ok(actor.x<-.9);
  const newPath=planWalk(actor,{x:4,z:0},newBuilding);
  assert.ok(newPath?.length>1);
});
