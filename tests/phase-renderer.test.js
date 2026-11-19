import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BuildingRenderer} from '../src/material-renderer.js';

test('MW008-RENDER-001: survey is stakes, not a magically completed house',()=>{
  const scene=new THREE.Scene(),view=new BuildingRenderer(scene,()=>1.5);
  const b=view.makeBuilding('house',12,8,.02);
  view.applyProgress(b,.02,'survey');
  assert.ok(b.surveyStakes.visible);
  assert.ok(!b.platform.visible);
  assert.ok(!b.body.visible);
  assert.ok(!b.roof.visible);
  assert.ok(!b.scaffold.visible);
});
test('MW008-RENDER-002: earthworks, foundation, rough frame and scaffolding are visibly distinct',()=>{
  const scene=new THREE.Scene(),view=new BuildingRenderer(scene,(x,z)=>1+.07*x+.04*z);
  const b=view.makeBuilding('house',12,8,.02);
  view.applyProgress(b,.17,'grading');
  assert.ok(b.preparedSoil.visible);
  assert.ok(!b.platform.visible);
  view.applyProgress(b,.60,'foundation');
  assert.ok(b.platform.visible);
  assert.ok(!b.body.visible);
  assert.ok(!b.scaffold.visible);
  view.applyProgress(b,.77,'frame');
  assert.ok(b.timber.visible);
  assert.ok(b.scaffold.visible);
  assert.ok(b.scaffold.children.length>=14);
  assert.ok(!b.body.visible);
  view.applyProgress(b,.94,'finish');
  assert.ok(b.body.visible);
  assert.ok(b.scaffold.visible);
  view.applyProgress(b,1,'complete');
  assert.ok(b.body.visible);
  assert.ok(b.roof.visible);
  assert.ok(!b.scaffold.visible,'Scaffolding removed only when finished');
});
