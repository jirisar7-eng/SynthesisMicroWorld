import {segmentClear,isBlocked} from './spatial-world.js';
export const PLAYER_MODES=Object.freeze(['observer','god','poor','invisible']);
export const PLAYER_LABELS=Object.freeze({
  observer:'Pozorovatel',god:'Zjevení boha',poor:'Převlek chudáka',invisible:'Neviditelný'
});
export function createAvatar(){return {mode:'observer',x:4.6,z:6.8,yaw:Math.PI,
  controls:{forward:false,back:false,left:false,right:false},encounters:0};}
export function selectPlayerMode(avatar,mode){
  if(!PLAYER_MODES.includes(mode))throw new Error('Unknown avatar mode');
  avatar.mode=mode;
  return avatar;
}
/** Same circle sweep as actual citizens, including lateral sliding along obstacles. */
export function advanceAvatar(avatar,dt,solids){
  if(avatar.mode==='observer')return false;
  const keys=avatar.controls,turn=(Number(keys.left)-Number(keys.right));
  avatar.yaw+=turn*dt*2.15;
  const move=Number(keys.forward)-Number(keys.back);
  if(!move)return false;
  const speed=avatar.mode==='god'?3.4:2.6;
  const stride=move*Math.min(dt,.08)*speed;
  const dx=Math.sin(avatar.yaw)*stride,dz=Math.cos(avatar.yaw)*stride;
  const start={x:avatar.x,z:avatar.z};
  const destination={x:start.x+dx,z:start.z+dz};
  if(segmentClear(start,destination,solids,.31)){
    avatar.x=destination.x;avatar.z=destination.z;return true;
  }
  const xOnly={x:start.x+dx,z:start.z};
  if(!isBlocked(xOnly,solids,.31)&&segmentClear(start,xOnly,solids,.31)){
    avatar.x=xOnly.x;return true;
  }
  const zOnly={x:start.x,z:start.z+dz};
  if(!isBlocked(zOnly,solids,.31)&&segmentClear(start,zOnly,solids,.31)){
    avatar.z=zOnly.z;return true;
  }
  return false;
}
/** Each NPC has its own encounter cooldown, no global forced happiness. */
export function encounterEffect(person,avatar,seconds){
  if(avatar.mode==='observer'||avatar.mode==='invisible')return null;
  if(Math.hypot(person.x-avatar.x,person.z-avatar.z)>6.3)return null;
  if(seconds-(person.lastAvatarEncounter??-999)<95)return null;
  person.lastAvatarEncounter=seconds;
  if(avatar.mode==='god'){
    person.mood=Math.min(100,person.mood+17);
    person.socialNeed=Math.max(0,(person.socialNeed||0)-14);
    if(person.social)person.social.frustration=Math.max(0,person.social.frustration-12);
    return {kind:'god',text:'Spatřil boha, má radost a získal naději.'};
  }
  const empathy=(person.personality?.empathy??person.personality?.agreeableness??50);
  person.mood=Math.min(100,person.mood+2);
  return {kind:'poor',text:empathy>=55?
    'Zpozoroval chudého poutníka a přemýšlí, jak mu pomoci.':
    'Zpozoroval neznámého chudého poutníka a zachovává odstup.',
    helpful:empathy>=55};
}
