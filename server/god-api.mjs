/**
 * MW-GOD-001 private control API. Disabled unless a strong server-side token exists.
 * No token is embedded in the browser bundle or written into world snapshots.
 */
import {createHash,timingSafeEqual,randomBytes} from 'node:crypto';
import {readFile,writeFile,rename,mkdir,readdir,unlink} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {applyGodPower,GOD_POWER_CATALOG,GodPowerError} from '../src/god-powers.js';
import {serializeWorld,hydrateWorldMirror} from '../src/world-save.js';

const MAX_BODY=4096,MAX_CHECKPOINTS=10;
const SPEEDS=[.25,1,2,4];
const json=(res,status,data)=>{
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(data));
};
const hash=s=>createHash('sha256').update(s).digest();
const validToken=t=>typeof t==='string'&&t.length>=32&&t.length<=256&&!/\s/.test(t);
const idOk=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(id);
const apiError=(status,code,message)=>({status,code,message});
const compare=(given,secret)=>{
  if(!validToken(secret)||typeof given!=='string'||!given.startsWith('Bearer '))return false;
  const supplied=given.slice(7);
  return validToken(supplied)&&timingSafeEqual(hash(supplied),hash(secret));
};
function checkOrigin(req){
  const origin=req.headers.origin,host=req.headers.host;
  if(req.headers['sec-fetch-site']==='cross-site')return false;
  if(!origin)return true; // non-browser clients still need a full bearer token
  try{
    const parsed=new URL(origin);
    return (parsed.protocol==='http:'||parsed.protocol==='https:')&&parsed.host===host;
  }catch{return false;}
}
async function readJson(req){
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))
    throw apiError(415,'content_type','Očekávám application/json.');
  let size=0,body='';
  for await(const chunk of req){
    size+=chunk.byteLength;
    if(size>MAX_BODY)throw apiError(413,'payload_too_large','Příkaz je příliš dlouhý.');
    body+=chunk.toString('utf8');
  }
  try{
    const obj=JSON.parse(body);
    if(!obj||typeof obj!=='object'||Array.isArray(obj))
      throw Error('not object');
    return obj;
  }catch{throw apiError(400,'invalid_json','Neplatný JSON příkaz.');}
}
function toError(err){
  if(err instanceof GodPowerError)return apiError(400,err.code,err.message);
  return err&&typeof err.status==='number'?err:
    apiError(500,'internal_error','Operaci se nepodařilo bezpečně dokončit.');
}
async function atomicSave(path,data){
  await mkdir(dirname(path),{recursive:true});
  const tmp=path+'.tmp-'+randomBytes(5).toString('hex');
  try{
    await writeFile(tmp,data,{mode:0o600,flag:'wx'});
    await rename(tmp,path);
  }catch(err){await unlink(tmp).catch(()=>{});throw err;}
}
export function createGodApi({sim,persist,snapshotPath,token,initialSpeed=1}){
  if(!sim||typeof persist!=='function'||!snapshotPath)throw Error('God API configuration invalid');
  const enabled=validToken(token);
  const checkpointFolder=join(dirname(snapshotPath),'god-checkpoints');
  let busy=false,windowAt=0,actionCount=0;
  let paused=sim.godControl?.paused===true;
  let speed=SPEEDS.includes(sim.godControl?.speed)?sim.godControl.speed:initialSpeed;
  if(!SPEEDS.includes(speed))speed=1;
  sim.godControl={paused,speed};
  const info=()=>({enabled,paused,speed,epoch:sim.godEpoch||0,
    day:sim.day,seconds:sim.seconds});
  async function listCheckpoints(){
    const filenames=await readdir(checkpointFolder).catch(e=>{
      if(e.code==='ENOENT')return [];throw e;
    });
    return filenames.filter(n=>/^god-[a-f0-9]{24}\.json$/.test(n)).sort().reverse();
  }
  async function checkpoint(source){
    const id='god-'+Date.now().toString(16).padStart(12,'0')+randomBytes(6).toString('hex');
    // Opaque filename: never accept client-supplied filesystem paths.
    await atomicSave(join(checkpointFolder,id+'.json'),source);
    const list=await listCheckpoints();
    for(const old of list.slice(MAX_CHECKPOINTS))
      await unlink(join(checkpointFolder,old)).catch(()=>{});
    return id;
  }
  async function mutation(body,operation){
    if(busy)throw apiError(409,'busy','Předchozí změna se ještě ukládá.');
    const now=Date.now();
    if(now-windowAt>60000){windowAt=now;actionCount=0;}
    if(++actionCount>20)throw apiError(429,'rate_limit','Limit 20 změn za minutu.');
    if(!idOk(body.requestId))throw apiError(400,'request_id','Příkaz potřebuje platné requestId.');
    if(!Array.isArray(sim.godRequests))sim.godRequests=[];
    const requestHash=hash(JSON.stringify(body)).toString('hex');
    const seen=sim.godRequests.find(x=>x.id===body.requestId);
    if(seen){
      if(seen.requestHash!==requestHash)
        throw apiError(409,'idempotency_conflict','Toto requestId již patří jinému příkazu.');
      return {duplicate:true,...seen.response};
    }
    busy=true;
    let before;
    try{before=serializeWorld(sim);}catch(e){busy=false;throw e;}
    const oldPaused=paused,oldSpeed=speed;
    let newCheckpoint;
    try{
      newCheckpoint=await checkpoint(before);
      const response=await operation(newCheckpoint);
      sim.godRequests.push({id:body.requestId,requestHash,response});
      sim.godRequests=sim.godRequests.slice(-80);
      await persist();
      return response;
    }catch(e){
      hydrateWorldMirror(sim,before);
      paused=oldPaused;speed=oldSpeed;
      throw e;
    }finally{busy=false;}
  }
  const handle=async(req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    try{
      if(path==='/api/god/catalog'&&req.method==='GET'){
        json(res,200,{powers:GOD_POWER_CATALOG,control:info()});return;
      }
      if(!enabled){
        json(res,503,{error:'god_api_locked',
          message:'Božské zásahy jsou zamčené: nastav MW_GOD_ADMIN_TOKEN na serveru.'});return;
      }
      if(!compare(req.headers.authorization,token)){
        json(res,401,{error:'unauthorized',message:'Neplatný administrátorský token.'});return;
      }
      if(!checkOrigin(req)){
        json(res,403,{error:'origin',message:'Požadavek musí pocházet ze stejného původu.'});return;
      }
      if(path==='/api/god/history'&&req.method==='GET'){
        json(res,200,{entries:(sim.godHistory||[]).slice(-100).reverse(),control:info()});return;
      }
      if(path==='/api/god/checkpoints'&&req.method==='GET'){
        const files=await listCheckpoints();
        json(res,200,{checkpoints:files.map(n=>({id:n.slice(0,-5)}))});return;
      }
      if(req.method!=='POST'){
        json(res,405,{error:'method_not_allowed'});return;
      }
      const body=await readJson(req);
      let result;
      if(path==='/api/god/action'){
        result=await mutation(body,async(checkpointId)=>({
          event:applyGodPower(sim,body),checkpointId,control:info()
        }));
      }else if(path==='/api/god/control'){
        result=await mutation(body,async(checkpointId)=>{
          if(typeof body.paused!=='boolean'||!SPEEDS.includes(body.speed))
            throw apiError(400,'invalid_control','Pozastavení a rychlost musí mít povolené hodnoty.');
          paused=body.paused;speed=body.speed;
          sim.godControl={paused,speed};
          sim.addEvent('Božská kontrola času',
            (paused?'Pozastavení':'Běh')+' · rychlost '+speed+'×','⌛');
          return {checkpointId,control:info()};
        });
      }else if(path==='/api/god/restore'){
        result=await mutation(body,async(checkpointId)=>{
          if(body.confirm!=='RESTORE_WORLD'||typeof body.checkpointId!=='string'||
             !/^god-[a-f0-9]{24}$/.test(body.checkpointId))
            throw apiError(400,'confirmation','Obnovení vyžaduje přesné ID a potvrzení.');
          const candidate=await readFile(join(checkpointFolder,body.checkpointId+'.json'),'utf8');
          const currentEpoch=sim.godEpoch||0;
          hydrateWorldMirror(sim,candidate); // validated before changing the live state
          sim.godEpoch=currentEpoch+1;
          paused=true;speed=sim.godControl?.speed??1;
          if(!SPEEDS.includes(speed))speed=1;
          sim.godControl={paused,speed};
          sim.addEvent('Obnovení historického stavu',
            'Svět byl vědomě vrácen k uloženému bodu '+body.checkpointId+'.','⌛');
          sim.godHistory??=[];
          const record={id:sim.godNextId||1,power:'restore',target:{type:'world'},
            intensity:1,day:sim.day,seconds:sim.seconds,result:'Obnoven uložený stav.',
            affectedIds:[],effects:{checkpointId:body.checkpointId},origin:'GOD'};
          sim.godHistory.push(record);
          sim.godNextId=record.id+1;
          return {restored:true,checkpointId,restoredFrom:body.checkpointId,control:info()};
        });
      }else{json(res,404,{error:'not_found'});return;}
      json(res,200,result);
    }catch(e){
      const err=toError(e);
      if(err.status>=500)console.error('MW_GOD_API_FAILURE',e?.code||e?.message||'unknown');
      json(res,err.status,{error:err.code,message:err.message});
    }
  };
  return {handle,isBusy:()=>busy,getControl:info,enabled};
}
