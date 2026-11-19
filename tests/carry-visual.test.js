import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MaterialWorld} from '../src/material-world.js';
import {MaterialRenderer} from '../src/material-renderer.js';
import {handPose,cargoClass,loadSpeed} from '../src/carry-poses.js';

const agent=(id=3)=>({id,name:'Adam',x:0,z:0,energy:80});
test('MW-CARRY-001: every real item becomes the moving avatar child, never a floating world-space mesh',()=>{
  const scene=new THREE.Scene(),economy=new MaterialWorld();
  const renderer=new MaterialRenderer(scene,()=>2);
  const avatar=new THREE.Group(),anchor=new THREE.Group();
  anchor.position.set(0,1.03,.46);
  avatar.add(anchor);avatar.userData.cargoAnchor=anchor;
  renderer.bindCarriers([new THREE.Group(),new THREE.Group(),new THREE.Group(),avatar]);
  scene.add(avatar);
  const person=agent();
  const collected=economy.collect(person,'wood',2,{origin:'tree:17',time:10});
  renderer.sync(economy);
  assert.equal(collected.length,2);
  for(const item of collected){
    const visual=renderer.itemMeshes.get(item.id);
    assert.equal(visual.parent,anchor);
    assert.ok(visual.position.y < .7);
    assert.ok(Math.abs(visual.position.x)<.55);
    assert.ok(visual.visible);
  }
  avatar.position.set(12,2,-6);avatar.rotation.y=Math.PI/3;
  anchor.children[1].updateWorldMatrix(true,true);
  const visual=renderer.itemMeshes.get(collected[0].id);
  const before=visual.getWorldPosition(new THREE.Vector3());
  avatar.position.x=15;avatar.updateMatrixWorld(true);
  const after=visual.getWorldPosition(new THREE.Vector3());
  assert.ok(after.x-before.x>2.9,'Attachment follows character movement without resync');
  assert.equal(economy.count('wood'),0);
  economy.deliver(person);
  renderer.sync(economy);
  assert.equal(visual.parent,renderer.group,'Delivery reparents item back to the world');
  assert.equal(economy.count('wood'),2);
  assert.equal(visual.visible,true);
});

test('MW-CARRY-002: apples, berries and stones keep separate real IDs with believable hand poses',()=>{
  const economy=new MaterialWorld(),person=agent(0);
  const pieces=economy.collect(person,'apple',3);
  pieces.push(...economy.collect(person,'stone',1));
  assert.equal(cargoClass(pieces),'heavy');
  const poses=pieces.map((piece,index)=>handPose(piece,index));
  assert.equal(new Set(poses.map(p=>[p.x,p.y,p.z].join(','))).size,4);
  assert.ok(poses.every(p=>Math.abs(p.x)<.6&&p.y<.8&&p.y>-.6));
  assert.ok(loadSpeed(pieces)<1);
  assert.equal(loadSpeed([]),1);
});

test('MW-CARRY-003: interruption deposits exactly the same physical objects on the ground',()=>{
  const economy=new MaterialWorld(),person=agent(2);
  const wood=economy.collect(person,'wood',2,{origin:'tree:9'});
  const dropped=economy.dropCargo(person,'storm');
  assert.equal(dropped.quantity,2);
  assert.equal(economy.countCarried(),0);
  assert.equal(economy.countAll(),16);
  const lost=economy.recoverable();
  assert.equal(lost.source.kind,'drop');
  assert.deepEqual(lost.ids,wood.map(item=>item.id));
  assert.ok(economy.pickupStorage(person,lost.ids));
  assert.equal(economy.countCarried(),2);
  economy.deliver(person);
  assert.equal(economy.count('wood'),2);
  assert.equal(economy.countAll(),16);
});

test('MW-007B-003: dropped goods receive one instanced ground contact shadow draw call',()=>{
  const economy=new MaterialWorld();
  const person=agent(0),scene=new THREE.Scene();
  const render=new MaterialRenderer(scene,()=>2);
  economy.collect(person,'apple',2);
  economy.dropCargo(person,'rest',{x:3,z:4});
  render.sync(economy);
  assert.equal(render.groundShadows.count,2);
  assert.ok(render.groundShadows.isInstancedMesh);
  const center=new THREE.Matrix4();
  render.groundShadows.getMatrixAt(0,center);
  const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
  center.decompose(position,rotation,scale);
  assert.equal(position.y,2.023);
  assert.ok(Math.abs(position.x-3)>.4,'Ground pieces settle around container center');
  economy.pickupStorage(person,economy.recoverable().ids);
  render.sync(economy);
  assert.equal(render.groundShadows.count,0,'No ghosts when goods leave ground');
});
