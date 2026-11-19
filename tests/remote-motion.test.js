import test from 'node:test';
import assert from 'node:assert/strict';
import {interpolateRemotePose,remoteSnapshotMovement} from '../src/remote-motion.js';

test('MW-015: a server citizen moves gradually between real snapshots',()=>{
  const start={x:1,z:3},end={x:11,z:5};
  assert.deepEqual(interpolateRemotePose(start,end,0),start);
  assert.deepEqual(interpolateRemotePose(start,end,0.5),{x:6,z:4});
  assert.deepEqual(interpolateRemotePose(start,end,1),end);
  assert.deepEqual(start,{x:1,z:3});
  assert.deepEqual(end,{x:11,z:5});
});
test('MW-015: large server discontinuities snap, never glide through the sea',()=>{
  assert.deepEqual(interpolateRemotePose({x:1,z:0},{x:86,z:0},.3),{x:86,z:0});
});
test('MW-015: render position cannot overrun the latest authoritative location',()=>{
  assert.deepEqual(interpolateRemotePose({x:0,z:0},{x:10,z:0},2),{x:10,z:0});
  assert.deepEqual(interpolateRemotePose({x:0,z:0},{x:10,z:0},-.2),{x:0,z:0});
  assert.equal(interpolateRemotePose({x:NaN,z:0},{x:3,z:4},.5).x,3);
});
test('MW-015: movement is measured by stable ID, ignoring deaths and array reordering',()=>{
  const old=[{id:10,x:2,z:2},{id:0,x:0,z:0},{id:2,x:4,z:5}];
  const fresh=[{id:2,x:4,z:5,alive:true},{id:0,x:5,z:0,alive:true},{id:10,x:2,z:2,alive:false}];
  assert.deepEqual(remoteSnapshotMovement(old,fresh),{moved:1,checked:2});
});
