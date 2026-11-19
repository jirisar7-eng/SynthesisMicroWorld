/**
 * Optional asset integration: Poly Haven CC0 forest floor.
 * Downloads at BUILD TIME; the deployed game does not need API availability.
 * Missing service, timeout or oversized asset -> procedural fallback.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {chooseDiffuse} from './polyhaven-utils.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const dir=resolve(root,'public/terrain');
const manifest={
  provider:'Poly Haven',asset:'forrest_ground_01',
  assetPage:'https://polyhaven.com/a/forrest_ground_01',
  api:'https://api.polyhaven.com/files/forrest_ground_01',
  license:'CC0-1.0',ready:false,file:null,fallback:'procedural'
};
await mkdir(dir,{recursive:true});
async function get(url) {
  const response=await fetch(url,{
    headers:{'User-Agent':'SynthesisMicroWorld-PrivateGame/0.6D','Accept':'application/json, image/jpeg, image/webp, image/png'},
    signal:AbortSignal.timeout(7500)
  });
  if(!response.ok)throw new Error('HTTP '+response.status);
  return response;
}
if(process.env.SKIP_POLYHAVEN_ASSETS==='1') {
  console.log('[terrain-assets] Explicitly skipped; using procedural fallback.');
} else {
  try{
    const listing=await (await get(manifest.api)).json();
    const file=chooseDiffuse(listing);
    if(!file)throw new Error('No supported small diffuse map returned by API');
    const response=await get(file.url);
    const binary=Buffer.from(await response.arrayBuffer());
    if(!binary.length||binary.length>2_600_000)throw new Error('Texture size outside mobile budget');
    const name='forest-ground.'+file.format;
    await writeFile(resolve(dir,name),binary);
    manifest.ready=true;manifest.file='/terrain/'+name;
    manifest.resolution=file.resolution;manifest.fallback='procedural only on runtime load failure';
    console.log('[terrain-assets] Poly Haven CC0 fetched: '+file.resolution+' / '+file.format+' / '+Math.round(binary.length/1024)+' KiB');
  }catch(error){
    console.warn('[terrain-assets] API unavailable ('+error.message+'). Procedural terrain retained.');
  }
}
await writeFile(resolve(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
