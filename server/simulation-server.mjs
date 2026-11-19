import http from 'node:http';
import {readFile,writeFile,rename,mkdir,unlink} from 'node:fs/promises';
import {dirname} from 'node:path';
import {Civilization} from '../src/simulation-core.js';
import {populateFounders,livingSummary} from '../src/generations.js';
import {serializeWorld,restoreWorld} from '../src/world-save.js';
import {calendarAt} from '../src/world-calendar.js';
import {createGodApi} from './god-api.mjs';

const bind=process.env.MW_BIND_ADDR||'127.0.0.1';
const port=Number(process.env.MW_PORT||8081);
const snapshotPath=process.env.MW_WORLD_SAVE_PATH||'./data/world.json';
const maxPopulation=Math.min(70,Math.max(6,Number(process.env.MW_START_POPULATION||30)));
const speed=Math.min(20,Math.max(.1,Number(process.env.MW_SIM_SPEED||1)));
const snapshotIntervalMs=60000;
if(!Number.isInteger(port)||port<1024||port>65535||!Number.isInteger(maxPopulation))
  throw new Error('Invalid MicroWorld server configuration');

const sim=new Civilization();
let restored=false;
try{
  const previous=await readFile(snapshotPath,'utf8');
  restoreWorld(sim,previous);
  restored=true;
}catch(err){
  if(err.code!=='ENOENT')throw err; // refuse to overwrite corrupted persisted world
}
if(!restored){
  populateFounders(sim,maxPopulation);
  sim.addEvent('Nepřetržitý svět',
    'Serverová simulace zahájila vlastní čas pro '+maxPopulation+' zakladatelů.','⌛');
}
let last=process.hrtime.bigint(),saveQueue=Promise.resolve(),stopping=false,lastSavedAt=null;
const timeStart=new Date().toISOString();
const godApi=createGodApi({sim,persist:snapshot,snapshotPath,
  token:process.env.MW_GOD_ADMIN_TOKEN,initialSpeed:speed});
const status=()=>({
  service:'SYNTHESIS MicroWorld headless simulation',version:'MW-GOD-001-PREVIEW',
  god:godApi.getControl(),
  mode:'server-authoritative-headless',
  startedAt:timeStart,restored,day:sim.day,year:calendarAt(sim.day).year,
  population:livingSummary(sim.agents),seconds:Math.round(sim.seconds*100)/100,
  structures:sim.material.structures.length,food:sim.material.foodCount(),
  water:sim.springs.reduce((n,s)=>n+s.stock,0),
  events:sim.chronicle.length,snapshotAt:lastSavedAt,
  islands:{count:2,discoveredBy:sim.islands?.discoveredBy.length||0,
    crossings:sim.islands?.crossings||0,returns:sim.islands?.returns||0,
    vessels:sim.islands?.vessels.map(v=>({type:v.type,side:v.side}))||[],
    aquaticPredators:sim.islands?.predators.length||0,
    predatorAttacks:sim.islands?.attacks||0,fish:sim.islands?.fish||0},
  occupations:Object.fromEntries([...new Set(sim.agents.filter(a=>a.alive!==false)
    .map(a=>a.profile?.occupation||'Neurčeno'))].map(role=>[role,
      sim.agents.filter(a=>a.alive!==false&&a.profile?.occupation===role).length])),
  note:'Separate headless world; browser 3D synchronisation is NOT connected yet'
});
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(url.pathname.startsWith('/api/god/')){
    void godApi.handle(req,res);return;
  }
  if(req.method!=='GET'){
    res.writeHead(405,{'Content-Type':'application/json'});
    res.end(JSON.stringify({error:'read_only'}));return;
  }
  if(url.pathname==='/healthz'){res.writeHead(200,{'Content-Type':'text/plain'});res.end('ok');return;}
  if(url.pathname==='/api/world'){
    try{
      const payload=serializeWorld(sim);
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8',
        'X-MW-World-Epoch':String(sim.godEpoch||0)});
      res.end(payload);
    }catch(err){
      console.error('MW_SERVER_WORLD_READ_FAIL',err.message);
      res.writeHead(503,{'Content-Type':'application/json'});
      res.end(JSON.stringify({error:'world_not_available'}));
    }
    return;
  }
  if(url.pathname==='/api/status'){
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify(status()));return;
  }
  if(url.pathname==='/api/events'){
    const limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit')||30)));
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify(sim.chronicle.slice(-limit)));return;
  }
  res.writeHead(404,{'Content-Type':'application/json'});
  res.end(JSON.stringify({error:'not_found'}));
});
async function snapshot(){
  // Queue distinct writes. A god mutation must not acknowledge an older autosave.
  const task=saveQueue.then(async()=>{
    const tmp=snapshotPath+'.tmp';
    try{
      await mkdir(dirname(snapshotPath),{recursive:true});
      await writeFile(tmp,serializeWorld(sim),{mode:0o600});
      await rename(tmp,snapshotPath);
      lastSavedAt=new Date().toISOString();
    }catch(e){await unlink(tmp).catch(()=>{});throw e;}
  });
  saveQueue=task.catch(()=>{});
  return task;
}
let loopTimer=null,saveTimer=null;
async function stop(signal){
  if(stopping)return;
  stopping=true;clearInterval(loopTimer);clearInterval(saveTimer);
  server.close();
  try{await snapshot();console.log('MW_SERVER_SAVED signal='+signal+' day='+sim.day);}
  catch(err){console.error('MW_SERVER_SNAPSHOT_FAIL',err);process.exitCode=1;}
  process.exit();
}
server.listen(port,bind,()=>{
  console.log('MW_SERVER_STARTED bind='+bind+' port='+port+' restored='+restored+
    ' population='+livingSummary(sim.agents).living);
  loopTimer=setInterval(()=>{
    if(stopping)return;
    const now=process.hrtime.bigint();
    const elapsed=Math.min(2,Math.max(0,Number(now-last)/1e9));
    last=now;
    // Bounded catch-up is deliberate; the server never jumps decades because
    // its process was asleep for hours. State survives process restarts.
    if(godApi.isBusy())return; // no clock advances during a snapshot transaction
    const control=godApi.getControl();
    if(!control.paused)sim.update(elapsed*control.speed);
  },250);
  saveTimer=setInterval(()=>snapshot().catch(err=>console.error('MW_SERVER_SAVE_FAIL',err)),snapshotIntervalMs);
});
process.on('SIGINT',()=>stop('SIGINT'));
process.on('SIGTERM',()=>stop('SIGTERM'));
