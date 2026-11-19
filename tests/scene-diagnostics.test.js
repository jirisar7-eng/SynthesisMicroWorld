import test from 'node:test';
import assert from 'node:assert/strict';
import {describeSceneFailure} from '../src/scene-diagnostics.js';

test('MW-013: JavaScript exception is NOT incorrectly blamed on WebGL',()=>{
  const info=describeSceneFailure(
    new TypeError("Cannot read properties of undefined (reading 'push')"),'forest');
  assert.equal(info.code,'MW3D-RUNTIME');
  assert.match(info.diagnostic,/forest.*TypeError/);
  assert.match(info.detail,/undefined/);
});
test('MW-013: WebGL initialization failure is accurately classified',()=>{
  const info=describeSceneFailure(new Error('Error creating WebGL context.'),'renderer');
  assert.equal(info.code,'MW3D-WEBGL');
  assert.match(info.title,/grafický kontext/);
});
test('MW-013: errors are bounded and safe for textContent',()=>{
  const info=describeSceneFailure({name:'TypeError<script>',message:'X'.repeat(1000)},'terrain!');
  assert.ok(info.detail.length<=260);
  assert.ok(!info.diagnostic.includes('<script>'));
  assert.match(info.diagnostic,/terrain/);
});
