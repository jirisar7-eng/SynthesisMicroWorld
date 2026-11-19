/** MW-009A — finite, geographically grounded fresh water sources.
 * One drop is consumed only when the person physically reaches a known spring.
 * This is not a groundwater/geological fluid simulation; those are future tasks.
 */
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export const SPRING_SITES=Object.freeze([
  {id:'spring-1',x:9.2,z:-7.1,name:'Lesní pramen',stock:24,maxStock:28},
  {id:'spring-2',x:-12.4,z:9.7,name:'Severní pramen',stock:18,maxStock:22}
]);
export function createSprings(){
  return SPRING_SITES.map(source=>({...source}));
}
export function springRefill(springs,weather){
  const rate=weather==='rain'?10:weather==='drought'?1:5;
  for(const source of springs)source.stock=clamp(source.stock+rate,0,source.maxStock);
}
export function drinkFromSpring(source,agent){
  if(!source||source.stock<1)return false;
  if(Math.hypot(source.x-agent.x,source.z-agent.z)>2.1)return false;
  if(!Number.isFinite(agent.thirst))return false;
  source.stock--;
  agent.thirst=clamp(agent.thirst-72,0,100);
  return true;
}
export function waterAvailability(springs){
  return springs.reduce((n,s)=>n+s.stock,0);
}

/** A caregiver draws one portable ration at the physical spring. It is added
 * to the MaterialWorld carrier only after this operation returns true.
 */
export function collectSpringWater(source,carrier){
  if(!source||source.stock<1||!Number.isFinite(carrier?.x)||!Number.isFinite(carrier?.z))return false;
  if(Math.hypot(source.x-carrier.x,source.z-carrier.z)>2.1)return false;
  source.stock--;return true;
}
