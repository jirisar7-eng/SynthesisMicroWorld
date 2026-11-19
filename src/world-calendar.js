/** MW-009: observable calendar and individual chronological aging.
 * The full family/birth/death system is NOT implemented by this module.
 */
export const DAYS_PER_YEAR=365;
export const DAY_SECONDS=75;
export function calendarAt(day){
  const count=Math.max(0,Math.floor(day)-1);
  return {day:count+1,year:Math.floor(count/DAYS_PER_YEAR)+1,
    dayOfYear:count%DAYS_PER_YEAR+1,elapsedYears:Math.floor(count/DAYS_PER_YEAR)};
}
export function ageResidents(agents,day){
  const time=calendarAt(day);
  if(time.dayOfYear!==1||time.elapsedYears===0)return [];
  const changes=[];
  for(const person of agents){
    if(!person.profile)continue;
    const bornYear=person.profile.birthYear??-(person.profile.age??20);
    const age=Math.max(0,time.elapsedYears-bornYear);
    if(age>person.profile.age){
      person.profile.age=age;
      changes.push({id:person.id,age,name:person.name,day});
    }
  }
  return changes;
}
