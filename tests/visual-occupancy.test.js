import test from 'node:test';
import assert from 'node:assert/strict';
import {VisualOccupancy,physicalIntersects,inflatedFootprint,
  visualFixedFootprints} from '../src/visual-occupancy.js';
const circle=(id,x,z,r)=>({id,shape:'circle',x,z,r});
const box=(id,x,z,hx,hz)=>({id,shape:'box',x,z,hx,hz});
const blank=()=>({material:{
  containers:new Map(),structures:[],projects:new Map(),tents:[],fields:[]
},trees:[],apples:[],berries:[],stones:[],saplings:[],
  boulders:[],fallenLogs:[],springs:[]});

test('MW-020A: circles may touch but never intersect another circle or box',()=>{
  assert.equal(physicalIntersects(circle('stone',0,0,1),
    circle('grass',2,0,1)),false);
  assert.equal(physicalIntersects(circle('stone',0,0,1),
    circle('grass',1.9,0,1)),true);
  assert.equal(physicalIntersects(box('house',0,0,2,2),
    circle('flower',2.5,0,.6)),true);
  assert.equal(physicalIntersects(box('house',0,0,2,2),
    circle('flower',2.8,0,.6)),false);
  assert.equal(physicalIntersects(box('one',0,0,1,1),
    box('two',1.9,0,1,1)),true);
});

test('MW-020A: grass and flowers cannot intersect an existing basket, tree, boulder, building or spring',()=>{
  const world=blank();
  world.material.containers.set('basket',{
    id:'basket',kind:'basket',x:1,z:1
  });
  world.material.structures.push({id:'building-1',type:'house',x:4,z:0});
  world.trees.push({id:3,x:-5,z:2});
  world.boulders.push({id:2,x:-2,z:-3,r:1});
  world.springs.push({id:'spring-1',x:8,z:0});
  const fixed=visualFixedFootprints(world);
  const registry=new VisualOccupancy(fixed);
  const points=[[1,1],[4,0],[-5,2],[-2,-3],[8,0]];
  for(const [x,z] of points){
    assert.equal(registry.reserveCircle('grass',x,z,.18),false);
    assert.equal(registry.reserveCircle('flower',x+.3,z,.20),false);
  }
  assert.equal(registry.reserveCircle('flower-distant',17,17,.25),true);
  assert.equal(registry.reserveCircle('grass-same',17.08,17,.1),false);
  assert.equal(registry.reserveCircle('grass-far',19,19,.1),true);
});

test('MW-020A: visible tree crown gets more clearance than narrow NPC trunk radius',()=>{
  const p=inflatedFootprint(circle('tree-17',4,4,.3));
  assert.ok(p.r>=1.4);
  const registry=new VisualOccupancy([p]);
  assert.equal(registry.reserveCircle('grass-within-crown',5.2,4,.1),false);
  assert.equal(registry.reserveCircle('grass-outside-crown',6.2,4,.1),true);
});

test('MW-020A: newly added structures invalidate decorative positions',()=>{
  const world=blank();
  const initial=new VisualOccupancy(visualFixedFootprints(world));
  assert.equal(initial.reserveCircle('grass-10',10,12,.21),true);
  const entry={shape:'circle',id:'grass-10',x:10,z:12,r:.21};
  world.material.structures.push({id:'building-1',type:'house',x:10,z:12});
  const rebuilt=new VisualOccupancy(visualFixedFootprints(world));
  assert.equal(rebuilt.free(entry),false);
  world.material.structures=[];
  assert.equal(new VisualOccupancy(visualFixedFootprints(world)).free(entry),true);
});

test('MW-020A: no invented substitute position if decorative object is rejected',()=>{
  const occupancy=new VisualOccupancy([box('house',0,0,5,5)]);
  const before=occupancy.objects.length;
  assert.equal(occupancy.reserveCircle('grass',0,0,.2),false);
  assert.equal(occupancy.objects.length,before);
});

test('MW-020A: fixed preexisting overlaps are reported rather than silently moving saved buildings and trees',()=>{
  const reg=new VisualOccupancy([circle('tree-1',0,0,.8),
    box('building-1',.4,0,2,2),circle('stone',15,15,.6)]);
  assert.deepEqual(reg.fixedConflicts(),[['building-1','tree-1']]);
  assert.equal(reg.objects[0].x,0);
  assert.equal(reg.objects[1].x,.4);
});

test('MW-020A: thousands of compact decorations retain distinct non-overlapping slots',()=>{
  const registry=new VisualOccupancy([box('house',0,0,3,3)]);
  const accepted=[];
  for(let i=0;i<2800;i++){
    const theta=i*2.399963229728,rad=Math.sqrt(i)*.32;
    const x=Math.cos(theta)*rad,z=Math.sin(theta)*rad;
    if(registry.reserveCircle('tuft-'+i,x,z,.11))accepted.push({x,z});
  }
  assert.ok(accepted.length>60);
  for(const p of accepted){
    assert.ok(!physicalIntersects(circle('tuft',p.x,p.z,.11),
      box('house',0,0,3,3)));
  }
});

test('MW-020A: malformed nonfinite coordinates cannot enter collision registry',()=>{
  const r=new VisualOccupancy();
  assert.equal(r.reserveCircle('broken',NaN,2,.2),false);
  assert.equal(r.reserveCircle('broken',1,Infinity,.2),false);
  assert.throws(()=>r.add(circle('bad',0,0,-2)),/Invalid footprint extent/);
});
