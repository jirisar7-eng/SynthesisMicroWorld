/**
 * Early individual-social simulation:
 * frustration arises from observable unmet needs, not a scripted random exile.
 * A person can voluntarily seek distance, build a small camp and later return.
 *
 * This is an early slice, NOT full migration, politics, or tribal warfare.
 */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

export class SocialDynamics {
  constructor(){
    this.lastDeparture=-300;
    this.camps=[{id:'home',name:'První osada',x:0,z:0,status:'settlement'}];
    this.history=[];
  }
  initialize(agent){
    agent.social={frustration:10,habitat:'home',status:'resident',
      leftAt:null,expectedReturn:null,site:null,grievances:[],departures:0};
    return agent;
  }
  tick(agent,dt,{weather='clear',houseCount=0,food=10,day=1}={}){
    const state=agent.social;
    if(!state||state.status==='travelling'||state.status==='preparing'||state.status==='returning')return;
    const hungry=agent.hunger>77||food<3;
    const lonely=agent.socialNeed>82;
    const tired=agent.energy<20;
    const unhappy=agent.mood<37;
    const homeless=houseCount===0;
    let strain=(hungry?2.0:0)+(lonely?.85:0)+(tired?.65:0)+(unhappy?1.15:0)+(homeless?.27:0);
    if(weather==='rain'&&homeless)strain+=.35;
    const baseline=state.status==='resident'?.25:.10;
    const change=dt*(strain*.26-baseline);
    state.frustration=clamp(state.frustration+change,0,100);
    if(state.status==='camping'&&day>0)state.frustration=clamp(state.frustration-dt*.045,0,100);
  }
  canLeave(agent,{day,time,wood,food,height=()=>2}={}){
    const s=agent.social;
    if(!s||s.status!=='resident'||day<3||time-this.lastDeparture<120||s.frustration<70||wood<2||food<2)return null;
    const locations=agent.cognition?.visited||[];
    // A person must have explored a safe distant location personally.
    const sites=locations.filter(p=>dist(p,{x:0,z:0})>=15&&dist(p,{x:0,z:0})<31&&height(p.x,p.z)>.15)
      .sort((a,b)=>Math.abs(dist(a,{x:0,z:0})-22)-Math.abs(dist(b,{x:0,z:0})-22));
    return sites[0]||null;
  }
  beginDeparture(agent,site,time){
    const s=agent.social;
    if(!s||s.status!=='resident')return false;
    s.status='preparing';s.site={x:site.x,z:site.z};
    s.leftAt=time;s.departures++;
    s.grievances.push('Odešel kvůli dlouhodobé nespokojenosti '+Math.round(s.frustration)+' %.');
    s.grievances=s.grievances.slice(-8);
    this.lastDeparture=time;
    this.history.push({time,type:'departure',id:agent.id,place:s.site});
    return true;
  }
  establishCamp(agent,tent,time){
    const s=agent.social;
    if(!s||s.status!=='travelling')return false;
    s.status='camping';s.habitat=tent.id;
    s.expectedReturn=time+125;
    this.camps.push({id:tent.id,name:'Tábor '+agent.name,x:tent.x,z:tent.z,
      status:'temporary',ownerId:agent.id});
    this.history.push({time,type:'tent',id:agent.id,camp:tent.id});
    return true;
  }
  shouldReturn(agent,time){
    const s=agent.social;
    return !!s&&s.status==='camping'&&time>=s.expectedReturn;
  }
  beginReturn(agent,time){
    const s=agent.social;
    if(!s||s.status!=='camping')return false;
    s.status='returning';this.history.push({time,type:'return-trip',id:agent.id});
    return true;
  }
  arrivedHome(agent,time){
    const s=agent.social;
    if(!s||s.status!=='returning')return false;
    s.status='resident';s.habitat='home';s.site=null;
    s.frustration=Math.max(18,s.frustration-38);
    this.history.push({time,type:'homecoming',id:agent.id});
    return true;
  }
  markConflict(a,b,time){
    if(!a.social||!b.social)return false;
    if(a.social.frustration<55&&b.social.frustration<55)return false;
    a.relationships[b.id]=clamp((a.relationships[b.id]||25)-15,0,100);
    b.relationships[a.id]=clamp((b.relationships[a.id]||25)-15,0,100);
    a.social.frustration=clamp(a.social.frustration+7,0,100);
    b.social.frustration=clamp(b.social.frustration+7,0,100);
    this.history.push({time,type:'dispute',a:a.id,b:b.id});
    return true;
  }
  summary(agents){
    const active=agents.filter(a=>a.social?.status==='resident').length;
    const camping=agents.filter(a=>a.social?.status==='camping'||a.social?.status==='travelling').length;
    const avg=agents.length?agents.reduce((n,a)=>n+(a.social?.frustration||0),0)/agents.length:0;
    return {residents:active,away:camping,camps:this.camps.length-1,
      averageTension:Math.round(avg),disputes:this.history.filter(x=>x.type==='dispute').length};
  }
}
