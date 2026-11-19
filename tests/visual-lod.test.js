import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseVisualItems} from '../src/visual-lod.js';

test('MW-016: 8500 units stay accounted for, no 8500 mobile draw calls',()=>{
  const items=Array.from({length:8500},(_,id)=>({id,type:'berry',container:'crate-1'}));
  const containers=new Map([['crate-1',{kind:'crate'}]]);
  const chosen=chooseVisualItems(items,containers,{maxPerGroup:38,maxTotal:600});
  assert.equal(chosen.length,38);
  assert.equal(items.length,8500);
  assert.equal(new Set(chosen.map(x=>x.id)).size,chosen.length);
});
test('MW-016: physically carried and construction cargo always remain visible',()=>{
  const items=[
    ...Array.from({length:1800},(_,id)=>({id,type:'grain',container:'crate-1'})),
    {id:9001,type:'wood',container:'carry-2'},
    {id:9002,type:'stone',container:'site-4'},
    {id:9003,type:'berry',container:'drop-7'}
  ];
  const containers=new Map([['crate-1',{kind:'crate'}],
    ['carry-2',{kind:'carry'}],['site-4',{kind:'site'}],['drop-7',{kind:'drop'}]]);
  const visible=chooseVisualItems(items,containers,{maxPerGroup:10,maxTotal:13});
  assert.equal(visible.length,13);
  for(const id of [9001,9002,9003])assert.ok(visible.some(x=>x.id===id));
  assert.equal(items.length,1803);
});
test('MW-016: different stock types each get representative render slots',()=>{
  const c=new Map([['a',{kind:'pile'}]]);
  const items=['wood','stone','grain'].flatMap((type,kind)=>
    Array.from({length:100},(_,n)=>({id:kind*100+n,type,container:'a'})));
  const vis=chooseVisualItems(items,c,{maxPerGroup:8,maxTotal:70});
  assert.deepEqual(Object.fromEntries(['wood','stone','grain'].map(type=>
    [type,vis.filter(x=>x.type===type).length])),{wood:8,stone:8,grain:8});
});
