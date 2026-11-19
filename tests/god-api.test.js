import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Civilization} from '../src/simulation-core.js';
import {createGodApi} from '../server/god-api.mjs';
import {serializeWorld} from '../src/world-save.js';

test('MW-GOD: private API requires bearer auth, validates, saves and restores',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'mw-god-'));
  const snapshotPath=join(folder,'state','world.json');
  await mkdir(join(folder,'state'),{recursive:true});
  const world=new Civilization();
  const token='M'.repeat(48);
  const god=createGodApi({sim:world,snapshotPath,token,initialSpeed:1,
    persist:()=>writeFile(snapshotPath,serializeWorld(world),{mode:0o600})});
  const server=createServer((req,res)=>void god.handle(req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port;
  let counter=0;
  const send=async(path,body,auth=true)=>{
    const r=await fetch(url+'/api/god/'+path,{method:'POST',
      headers:{'Content-Type':'application/json',Origin:url,
        ...(auth?{Authorization:'Bearer '+token}:{})},
      body:JSON.stringify({requestId:'god-test-'+String(++counter).padStart(22,'0'),...body})});
    return {status:r.status,data:await r.json()};
  };
  try{
    const catalog=await fetch(url+'/api/god/catalog').then(x=>x.json());
    assert.equal(catalog.control.enabled,true);
    assert.equal(catalog.powers.length,13);
    let response=await send('action',{power:'rain',target:{type:'world'},intensity:1},false);
    assert.equal(response.status,401);
    assert.equal(world.weather.kind,'clear');
    response=await send('action',{power:'unknown',target:{type:'world'}});
    assert.equal(response.status,400);
    assert.equal(world.godHistory.length,0);
    response=await send('action',{power:'rain',target:{type:'world'},intensity:2});
    assert.equal(response.status,200);
    assert.equal(world.weather.kind,'rain');
    const checkpointId=response.data.checkpointId;
    assert.match(checkpointId,/^god-[0-9a-f]{24}$/);
    assert.ok((await readFile(snapshotPath,'utf8')).includes('"godHistory"'));
    assert.equal(world.godHistory.length,1);
    response=await send('control',{paused:true,speed:2});
    assert.equal(response.status,200);
    assert.deepEqual(god.getControl().paused,true);
    assert.equal(god.getControl().speed,2);
    response=await send('restore',{checkpointId,confirm:'WRONG'});
    assert.equal(response.status,400);
    assert.equal(world.weather.kind,'rain');
    response=await send('restore',{checkpointId,confirm:'RESTORE_WORLD'});
    assert.equal(response.status,200);
    assert.equal(world.weather.kind,'clear');
    assert.equal(world.godEpoch,1);
    assert.equal(god.getControl().paused,true);
    assert.ok(world.chronicle.some(e=>e.title==='Obnovení historického stavu'));
    const restored=JSON.parse(await readFile(snapshotPath,'utf8'));
    assert.equal(restored.state.godEpoch,1);
  }finally{
    await new Promise(resolve=>server.close(resolve));
    await rm(folder,{recursive:true,force:true});
  }
});
test('MW-GOD: locked server rejects all mutations without a configured token',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'mw-locked-'));
  try{
    const world=new Civilization();
    const api=createGodApi({sim:world,snapshotPath:join(folder,'world.json'),
      token:'too-short',persist:async()=>{throw Error('Must never save');}});
    const srv=createServer((req,res)=>void api.handle(req,res));
    await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));
    try{
      const r=await fetch('http://127.0.0.1:'+srv.address().port+'/api/god/action',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({power:'rain',target:{type:'world'}})});
      assert.equal(r.status,503);
      assert.equal(world.weather.kind,'clear');
    }finally{await new Promise(resolve=>srv.close(resolve));}
  }finally{await rm(folder,{recursive:true,force:true});}
});
