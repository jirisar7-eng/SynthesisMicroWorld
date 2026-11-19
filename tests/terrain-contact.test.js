import test from 'node:test';
import assert from 'node:assert/strict';
import {terrainPose,foundationContact} from '../src/terrain-contact.js';

test('MW-007B-001: small object follows true ground height and surface inclination',()=>{
  const h=(x,z)=>1+x*.18-z*.08;
  const pose=terrainPose(h,4,-2,{clearance:.06,maxTilt:.12});
  assert.ok(Math.abs(pose.y-h(4,-2)-.06)<1e-10);
  assert.ok(pose.tiltZ>0);
  assert.ok(pose.tiltX>0);
  assert.ok(Math.abs(pose.tiltZ)<=.12);
  assert.ok(Math.abs(pose.tiltX)<=.12);
});
test('MW-007B-002: foundations sit over the highest corner and support all lower corners',()=>{
  const h=(x,z)=>3+x*.12-z*.07;
  const f=foundationContact(h,8,-3,5,4);
  assert.equal(f.corners.length,4);
  assert.ok(f.corners.every(p=>f.top>p.y));
  assert.ok(f.top>f.low);
  assert.ok(f.top-h(8,-3)>.2);
});
