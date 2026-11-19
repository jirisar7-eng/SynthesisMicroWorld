import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarAt,ageResidents,DAYS_PER_YEAR} from '../src/world-calendar.js';

test('MW009-YEAR-001: civil calendar has 365 consecutive days and correct boundary',()=>{
  assert.deepEqual(calendarAt(1),{day:1,year:1,dayOfYear:1,elapsedYears:0});
  assert.deepEqual(calendarAt(365),{day:365,year:1,dayOfYear:365,elapsedYears:0});
  assert.deepEqual(calendarAt(366),{day:366,year:2,dayOfYear:1,elapsedYears:1});
  assert.equal(calendarAt(731).year,3);
});

test('MW009-YEAR-002: founders age exactly one year per elapsed year',()=>{
  const founders=[
    {id:0,name:'Adam',profile:{age:20,birthYear:-20}},
    {id:1,name:'Ema',profile:{age:23,birthYear:-23}}
  ];
  assert.deepEqual(ageResidents(founders,365),[]);
  assert.equal(ageResidents(founders,366).length,2);
  assert.deepEqual(founders.map(p=>p.profile.age),[21,24]);
  assert.deepEqual(ageResidents(founders,366),[]);
  assert.equal(ageResidents(founders,731).length,2);
  assert.deepEqual(founders.map(p=>p.profile.age),[22,25]);
});

test('MW009-YEAR-003: old biography without bornYear can still receive annual aging',()=>{
  const people=[{id:0,name:'Citizen',profile:{age:30}}];
  assert.equal(ageResidents(people,DAYS_PER_YEAR+1).length,1);
  assert.equal(people[0].profile.age,31);
});
