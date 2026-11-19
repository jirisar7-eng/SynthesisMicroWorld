import {MaterialWorld} from './material-world.js';
import {Footpaths} from './footpaths.js';
import {SocialDynamics} from './social-dynamics.js';

/** MW-009 — versioned single-device world persistence.
 * This stores true simulation state, not just visible UI summaries.
 * It is deliberately local and does NOT claim a 24/7 VPS simulation.
 */
export const WORLD_SAVE_VERSION=1;
export const WORLD_SAVE_KEY='synthesis-microworld-world-v1';
const SAVE_LIMIT=8_000_000;

function encode(key,value){
  // VM/headless tests and embedded workers may produce Map/Set from another realm.
  const kind=Object.prototype.toString.call(value);
  if(kind==='[object Map]')return {$type:'Map',entries:[...value.entries()]};
  if(kind==='[object Set]')return {$type:'Set',values:[...value.values()]};
  if(typeof value==='number'&&!Number.isFinite(value))
    return {$type:'Number',value:String(value)};
  return value;
}
function decode(key,value){
  if(!value||typeof value!=='object')return value;
  if(value.$type==='Map')return new Map(value.entries);
  if(value.$type==='Set')return new Set(value.values);
  if(value.$type==='Number')return Number(value.value);
  return value;
}
export function serializeWorld(sim){
  const state={};
  for(const key of Object.keys(sim)){
    if(key==='listeners')continue; // callbacks must remain bound to this page
    state[key]=sim[key];
  }
  const json=JSON.stringify({
    version:WORLD_SAVE_VERSION,savedAt:new Date().toISOString(),state
  },encode);
  if(json.length>SAVE_LIMIT)throw new Error('World save exceeds 8 MB safe slot capacity');
  return json;
}
function validate(parsed){
  if(!parsed||parsed.version!==WORLD_SAVE_VERSION)
    throw new Error('Unsupported world save version');
  const state=parsed.state;
  if(!state||!Array.isArray(state.agents)||state.agents.length<1||
     state.agents.length>2000||!state.agents.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z))||
     !state.material||!Array.isArray(state.material.items)||
     !(state.material.containers instanceof Map)||
     !(state.material.projects instanceof Map)||
     !state.paths||!(state.paths.cells instanceof Map)||
     !state.social||!(state.meetings instanceof Map)||
     !Number.isFinite(state.seconds)||state.seconds<0||!Array.isArray(state.springs))
    throw new Error('Incomplete or malformed world save');
  return state;
}
export function restoreWorld(sim,json){
  if(typeof json!=='string'||json.length>SAVE_LIMIT)
    throw new Error('World save is absent or too large');
  const parsed=JSON.parse(json,decode);
  const state=validate(parsed);
  const listeners=sim.listeners; // reattach existing event handlers, not JSON clones
  const material=Object.assign(new MaterialWorld(),state.material);
  const social=Object.assign(new SocialDynamics(),state.social);
  const paths=Object.assign(new Footpaths(),state.paths);
  Object.assign(sim,state);
  sim.material=material;sim.social=social;sim.paths=paths;
  sim.listeners=listeners;
  // A paused journey cannot be resumed using copied stale object references.
  // Place carried goods on physical ground and let each citizen replan.
  sim.meetings=new Map();
  for(const agent of sim.agents){
    agent.conversation=null;
    if(agent.alive===false){
      agent.mode='deceased';agent.purpose='';agent.target=null;agent.waypoints=[];
    }else if((agent.profile?.age??18)<18){
      agent.mode='dependent';agent.purpose='childhood';
      agent.target=null;agent.waypoints=[];agent.choiceAt=Infinity;
    }else{
      sim.idle(agent);
      agent.choiceAt=sim.seconds+.5;
    }
    if(agent.cognition&&!Number.isFinite(agent.cognition.lastScan))
      agent.cognition.lastScan=-100;
  }
  if(sim.avatar?.controls)for(const key of Object.keys(sim.avatar.controls))
    sim.avatar.controls[key]=false;
  sim.externalWeatherEnabled=false;
  sim.externalWeather=null;
  sim.addEvent('Návrat do světa',
    'Pokračuje uložený svět: práce přerušená zavřením hry se bezpečně znovu plánuje.','⌑');
  return {version:parsed.version,savedAt:parsed.savedAt,
    agents:sim.agents.length,day:sim.day,seconds:sim.seconds};
}
