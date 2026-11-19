import test from 'node:test';
import assert from 'node:assert/strict';
import {terrainHeight} from '../src/simulation-core.js';
import {findShoreRadius,buildShoreGeometry} from '../src/shore-visuals.js';

test('MW-017 shoreline follows real home island heightfield, never a fake circular edge',()=>{
  const shape=buildShoreGeometry(terrainHeight,0);
  assert.ok(shape);
  assert.equal(shape.coast.length,193);
  for(const pt of shape.coast){
    const x=pt.radius*Math.cos(pt.angle),z=pt.radius*Math.sin(pt.angle);
    assert.ok(Math.abs(terrainHeight(x,z)+.58)<.001);
  }
  assert.ok(new Set(shape.coast.map(p=>Math.round(p.radius*20))).size>4);
});
test('MW-017 second island uses its existing heightfield at x=86',()=>{
  const shape=buildShoreGeometry(terrainHeight,86);
  assert.ok(shape);
  for(const pt of shape.coast){
    const x=86+pt.radius*Math.cos(pt.angle),z=pt.radius*Math.sin(pt.angle);
    assert.ok(Math.abs(terrainHeight(x,z)+.58)<.001);
  }
});
test('MW-017 shoreline visuals contain finite coordinates and bounded number of vertices',()=>{
  for(const center of [0,86]){
    const sh=buildShoreGeometry(terrainHeight,center);
    for(const layer of [sh.shallows,sh.foam]){
      assert.equal(layer.positions.length,2*193*3);
      assert.equal(layer.indices.length,192*6);
      assert.ok(layer.positions.every(Number.isFinite));
    }
  }
});
test('MW-017 invalid crossing cannot silently create fake coast',()=>{
  assert.equal(findShoreRadius(()=>1,0,0),null);
  assert.throws(()=>buildShoreGeometry(terrainHeight,0,-.58,2),/segments/);
});
