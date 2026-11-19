import test from 'node:test';
import assert from 'node:assert/strict';
import {Civilization} from '../src/simulation-core.js';
import {serializeWorld,hydrateWorldMirror} from '../src/world-save.js';
import {populateFounders} from '../src/generations.js';

test('MW-012: read-only browser mirror keeps exact moving server state',()=>{
  const authoritative=new Civilization();
  populateFounders(authoritative,30);
  authoritative.agents[0].mode='voyage';
  authoritative.agents[0].purpose='seaCrossing';
  authoritative.agents[0].x=49;
  authoritative.agents[0].z=0;
  authoritative.agents[0].voyage={vesselId:4,fromSide:'home',
    from:{x:39,z:0},to:{x:70,z:0},progress:10/31,started:12};
  authoritative.islands.vessels.push({id:4,type:'raft',side:'home',inUse:0,x:49,z:0});
  authoritative.seconds=120;
  authoritative.day=2;

  const viewer=new Civilization();
  const originalEvents=authoritative.chronicle.length;
  const originalMaterials=authoritative.material.countAll();
  const originalListeners=viewer.listeners;
  const view=hydrateWorldMirror(viewer,serializeWorld(authoritative));
  assert.equal(view.day,2);
  assert.equal(view.people,30);
  assert.equal(viewer.agents[0].mode,'voyage');
  assert.equal(viewer.agents[0].x,49);
  assert.equal(viewer.agents[0].voyage.progress,10/31);
  assert.equal(viewer.islands.vessels[0].inUse,0);
  assert.equal(viewer.chronicle.length,originalEvents,'No invented reload events');
  assert.equal(viewer.material.countAll(),originalMaterials,'No ghost inventory changes');
  assert.equal(viewer.listeners,originalListeners,'Current UI listeners stay attached');
  assert.equal(typeof viewer.material.count,'function','Material methods remain operational');
  assert.ok(viewer.material.containers instanceof Map);
});
test('MW-012: malformed server payload is rejected before a mirror changes',()=>{
  const viewer=new Civilization(),first=viewer.agents[0].name;
  assert.throws(()=>hydrateWorldMirror(viewer,'{"version":1,"state":{}}'),/Incomplete/);
  assert.equal(viewer.agents[0].name,first);
});
