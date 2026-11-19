import test from 'node:test';
import assert from 'node:assert/strict';
import {MaterialWorld} from '../src/material-world.js';
import {SocialDynamics} from '../src/social-dynamics.js';
import {initializeLife} from '../src/life.js';
import {initializeBiography} from '../src/biography.js';
import {initCognition} from '../src/cognition.js';
import {populationDay,isDependent,isLiving,livingSummary,familyOf} from '../src/generations.js';
const adult=(id,sex,age=26)=>{
 const p=initializeBiography(initCognition(initializeLife({
  id,name:id===0?'Ema':'Adam',x:id*0.8,z:0,energy:80,
  mode:'idle',purpose:'',waypoints:[],target:null,resource:null,choiceAt:0
 },id)),id);
 p.sex=sex;p.health=100;p.alive=true;
 p.profile.age=age;p.profile.birthYear=-age;
 return p;
};
const world=()=>{
 const a=adult(0,'female'),b=adult(1,'male');
 a.relationships[b.id]=90;b.relationships[a.id]=90;
 const material=new MaterialWorld();material.add('wood',24);
 material.addStructure('house',2,2,0,1);
 const social=new SocialDynamics();
 social.initialize(a);social.initialize(b);
 return {agents:[a,b],material,social,springs:[{id:'spring',x:6,z:0,stock:21,maxStock:25}]};
};
test('MW009B-001: mutual trust and proximity create symmetric partnership, not a forced player command',()=>{
 const w=world(),events=populationDay(w,7);
 assert.equal(events.filter(e=>e.kind==='partnership').length,1);
 assert.equal(w.agents[0].profile.genealogy.partnerId,1);
 assert.equal(w.agents[1].profile.genealogy.partnerId,0);
 assert.equal(w.agents[0].profile.timeline.at(-1).event,'Vzniklo partnerství');
});
test('MW009B-002: no pregnancy without food, housing or viable adult relationship',()=>{
 const w=world();
 const a=w.agents[0],b=w.agents[1];
 populationDay(w,7);
 w.material.consume('berry',w.material.count('berry'));
 for(let day=30;day<400;day+=30)assert.equal(populationDay(w,day).filter(e=>e.kind==='pregnancy').length,0);
 assert.equal(a.pregnancyDueDay,undefined);
 b.profile.genealogy.partnerId=null;
 assert.equal(populationDay(w,427).filter(e=>e.kind==='partnership').length,0);
});
test('MW009B-003: successful pregnancy creates child with stable id, parent links and no work',()=>{
 const w=world();populationDay(w,7);
 let conception=null;
 for(let day=60;day<420;day+=30){
  const events=populationDay(w,day);
  conception??=events.find(e=>e.kind==='pregnancy');
  if(conception)break;
 }
 assert.ok(conception);
 const birth=populationDay(w,conception.dueDay).find(e=>e.kind==='birth');
 assert.ok(birth);assert.equal(birth.id,2);
 const baby=w.agents[birth.id];
 assert.equal(baby.profile.age,0);
 assert.deepEqual(baby.profile.genealogy.parentIds,[0,1]);
 assert.equal(isDependent(baby),true);
 assert.equal(baby.mode,'dependent');
 assert.ok(familyOf(w.agents[0],w.agents).children.includes(baby));
 assert.equal(livingSummary(w.agents).living,3);
 assert.equal(livingSummary(w.agents).children,1);
});
test('MW009B-004: a real food item is consumed by family care, never cloned',()=>{
 const w=world();populationDay(w,7);
 let due=null;
 for(let d=60;d<420;d+=30){due??=populationDay(w,d).find(e=>e.kind==='pregnancy')?.dueDay;if(due)break;}
 const kid=populationDay(w,due).find(e=>e.kind==='birth');
 const before=w.material.countAll();
 const baby=w.agents[kid.id];baby.hunger=88;
 const events=populationDay(w,due+1);
 const care=events.find(e=>e.kind==='care'&&e.id===baby.id);
 assert.ok(care);
 assert.equal(w.material.countAll(),before-1);
 assert.ok(!w.material.items.some(i=>i.id===care.resourceId));
});
test('MW009B-005: death preserves immutable ID and genealogical history, unlinks partner',()=>{
 const w=world();populationDay(w,7);
 const person=w.agents[1];person.hunger=100;person.thirst=100;person.health=4;
 const events=populationDay(w,8);
 assert.ok(events.some(e=>e.kind==='death'&&e.id===1));
 assert.equal(person.alive,false);
 assert.equal(w.agents[1],person);
 assert.equal(w.agents[0].profile.genealogy.partnerId,null);
 assert.equal(person.profile.timeline.at(-1).event,'Úmrtí');
 assert.equal(livingSummary(w.agents).deceased,1);
});
