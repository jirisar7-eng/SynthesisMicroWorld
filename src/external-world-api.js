/** MW-008: optional REAL external weather input (not an LLM).
 * Fictional simulation stays offline/deterministic until player opts in.
 * Coordinates identify a labelled reference region, not a user's location.
 * Open-Meteo API: https://open-meteo.com/en/docs
 */
export const WEATHER_REFERENCE=Object.freeze({name:'Pardubice — referenční počasí',latitude:50.03,longitude:15.77});
export function parseOpenMeteo(data){
  if(!data||!data.current)throw new Error('Weather API returned no current values');
  const current=data.current;
  const code=Number(current.weather_code);
  const rain=Number(current.precipitation);
  const temp=Number(current.temperature_2m);
  if(!Number.isFinite(code)||!Number.isFinite(temp))throw new Error('Weather API data are invalid');
  const wet=(code>=51&&code<=82)||(code>=95&&code<=99)||
    (code>=85&&code<=86)||(code>=71&&code<=77)||rain>.1;
  return {kind:wet?'rain':(temp>=33&&rain<=0?'drought':'clear'),
    temperature:temp,weatherCode:code,precipitation:Number.isFinite(rain)?rain:0,
    wind:Number(current.wind_speed_10m)||0,
    source:'Open-Meteo',reference:WEATHER_REFERENCE.name,observedAt:current.time||null};
}
export async function fetchExternalWeather(fetcher=fetch){
  const query=new URLSearchParams({
    latitude:String(WEATHER_REFERENCE.latitude),longitude:String(WEATHER_REFERENCE.longitude),
    current:'temperature_2m,weather_code,precipitation,wind_speed_10m',
    timezone:'Europe/Prague',forecast_days:'1'
  });
  const result=await fetcher('https://api.open-meteo.com/v1/forecast?'+query.toString(),
    {headers:{Accept:'application/json'}});
  if(!result.ok)throw new Error('Open-Meteo returned HTTP '+result.status);
  return parseOpenMeteo(await result.json());
}
