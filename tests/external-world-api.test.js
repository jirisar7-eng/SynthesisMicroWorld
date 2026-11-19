import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOpenMeteo,fetchExternalWeather,WEATHER_REFERENCE} from '../src/external-world-api.js';
test('MW008-API-001: provider weather actually maps WMO to world climate',()=>{
  const rain=parseOpenMeteo({current:{weather_code:61,temperature_2m:15.2,precipitation:.8,wind_speed_10m:6,time:'2026-11-19T11:00'}});
  assert.equal(rain.kind,'rain');
  assert.equal(rain.source,'Open-Meteo');
  assert.equal(rain.temperature,15.2);
  const dry=parseOpenMeteo({current:{weather_code:0,temperature_2m:34,precipitation:0}});
  assert.equal(dry.kind,'drought');
});
test('MW008-API-002: fetch uses a fixed reference city, no geolocation or API key',async()=>{
  let called='';
  const fetcher=async(url,options)=>{
    called=url;
    assert.equal(options.headers.Accept,'application/json');
    return {ok:true,json:async()=>({current:{weather_code:1,temperature_2m:17,precipitation:0}})};
  };
  const result=await fetchExternalWeather(fetcher);
  assert.equal(result.kind,'clear');
  assert.ok(called.startsWith('https://api.open-meteo.com/v1/forecast?'));
  assert.ok(called.includes('latitude='+WEATHER_REFERENCE.latitude));
  assert.ok(!called.includes('apikey'));
});
test('MW008-API-003: unreachable API rejects cleanly, local simulation remains independent',async()=>{
  await assert.rejects(fetchExternalWeather(async()=>({ok:false,status:503})),/HTTP 503/);
  assert.throws(()=>parseOpenMeteo({current:{weather_code:'',temperature_2m:'bad'}}));
});
