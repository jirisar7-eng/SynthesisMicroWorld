/** Autonomous specializations grow from actual work and learned techniques.
 * Citizens do not receive player-assigned jobs. Combinations form hybrid roles.
 */
import {isLiving,isDependent} from './generations.js';
import {lifeEvent} from './biography.js';

export const ROLE_RULES=Object.freeze([
  {id:'forester',title:'Lesník',needs:{wood:5},rank:1},
  {id:'mason',title:'Kameník',needs:{stone:4},rank:1},
  {id:'farmer',title:'Zemědělec',needs:{farm:4},rank:1},
  {id:'artisan',title:'Řemeslník',needs:{craft:4},rank:1},
  {id:'scout',title:'Průzkumník',needs:{exploration:5},rank:1},
  {id:'builder',title:'Stavitel',needs:{wood:7,stone:3},rank:2},
  {id:'survivalist',title:'Zálesák',needs:{wood:6,exploration:6},rank:2},
  {id:'woodfarmer',title:'Lesní hospodář',needs:{farm:5,wood:5},rank:2},
  {id:'navigator',title:'Mořeplavec',needs:{navigation:5,exploration:5},rank:2},
  {id:'shipwright',title:'Loďař',needs:{wood:8,craft:6,navigation:4},rank:3},
  {id:'mentor',title:'Učitel řemesel',needs:{social:5,mentoring:5},rank:3}
]);
const value=(person,key)=>person.profile?.skills?.[key]||0;
export function evaluateProfession(person){
  if(!isLiving(person)||isDependent(person))return null;
  const eligible=ROLE_RULES.filter(role=>Object.entries(role.needs)
    .every(([key,needed])=>value(person,key)>=needed));
  eligible.sort((a,b)=>b.rank-a.rank||
    Object.entries(b.needs).reduce((sum,[k])=>sum+value(person,k),0)-
    Object.entries(a.needs).reduce((sum,[k])=>sum+value(person,k),0)||
    a.id.localeCompare(b.id));
  return eligible[0]||null;
}
export function updateProfessions(world){
  const changes=[];
  for(const person of world.agents){
    if(!isLiving(person)||isDependent(person))continue;
    const profile=person.profile;
    if(!profile.skills)continue;
    const role=evaluateProfession(person);
    if(!role)continue;
    if(!profile.professions)profile.professions=[];
    if(!profile.professions.includes(role.id)){
      profile.professions.push(role.id);
      lifeEvent(person,world.day,'Naučil se profesi '+role.title,
        'Postupně získal dovednosti '+Object.entries(role.needs)
          .map(([key,count])=>key+' '+count).join(', ')+'.');
      changes.push({id:person.id,role:role.title});
    }
    if(profile.occupation!==role.title)profile.occupation=role.title;
  }
  return changes;
}
/** Teaching transfers limited, attributed practice, not a perfect skill copy.
 * It only occurs in the existing physical conversation resolution.
 */
export function mentorAtMeeting(teacher,student,world){
  if(!isLiving(teacher)||!isLiving(student)||isDependent(teacher)||isDependent(student))
    return [];
  if((teacher.relationships?.[student.id]||0)<28)return [];
  const skills=teacher.profile?.skills||{},learner=student.profile?.skills||{};
  const candidates=Object.keys(skills).filter(k=>
    skills[k]>=5&&skills[k]-(learner[k]||0)>=3);
  candidates.sort((a,b)=>(skills[b]-(learner[b]||0))-(skills[a]-(learner[a]||0)));
  const taught=[];
  const pairKey=teacher.id+'>'+student.id;
  if(!student.cognition.mentoring)student.cognition.mentoring={};
  if(world.day-(student.cognition.mentoring[pairKey]??-100)<6)return taught;
  const key=candidates[0];
  if(key){
    learner[key]=Math.min(100,(learner[key]||0)+1);
    teacher.profile.skills.mentoring=(teacher.profile.skills.mentoring||0)+1;
    student.cognition.mentoring[pairKey]=world.day;
    taught.push({skill:key,teacher:teacher.id,student:student.id});
    lifeEvent(student,world.day,'Učil se od '+teacher.name,
      'Procvičoval dovednost '+key+' na základě osobního rozhovoru.');
  }
  const designs=teacher.cognition?.technologies||{};
  if(!student.cognition.technologies)student.cognition.technologies={};
  for(const [type,proof] of Object.entries(designs)){
    if(student.cognition.technologies[type])continue;
    student.cognition.technologies[type]={
      origin:'taught',by:teacher.id,day:world.day,learnedFrom:proof.by??teacher.id
    };
    taught.push({technology:type,teacher:teacher.id,student:student.id});
    lifeEvent(student,world.day,'Naučil se návrh '+type,
      'Znalost mu osobně předal '+teacher.name+'.');
    break;
  }
  return taught;
}
