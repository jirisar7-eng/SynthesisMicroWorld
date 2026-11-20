#!/usr/bin/env node
// MW-019A2 end-to-end browser smoke, using Chromium's standard DevTools Protocol.
// No extra npm packages, users, credentials, or production endpoints.
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const url=process.env.MW_SMOKE_URL||'http://127.0.0.1:18585/svet/?perf=1';
const chrome=spawn(process.env.CHROME_BIN||'google-chrome',[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader','--use-angle=swiftshader',
  '--remote-debugging-port=9237','--remote-allow-origins=*',
  '--window-size=390,844','--force-device-scale-factor=1',
  '--user-data-dir=/tmp/mw019a2-chromium-'+process.pid,'about:blank'
],{stdio:'ignore'});

let socket,id=0;
const awaiting=new Map();
async function connection(){
  let wsUrl;
  for(let i=0;i<110;i++){
    try{
      const tabs=await (await fetch('http://127.0.0.1:9237/json/list')).json();
      wsUrl=tabs.find(t=>t.type==='page')?.webSocketDebuggerUrl;
      if(wsUrl)break;
    }catch{}
    await sleep(300);
  }
  assert.ok(wsUrl,'Chrome DevTools endpoint did not start');
  socket=new WebSocket(wsUrl);
  socket.addEventListener('message',event=>{
    const reply=JSON.parse(event.data);
    const pending=awaiting.get(reply.id);
    if(!pending)return;
    awaiting.delete(reply.id);
    if(reply.error)pending.reject(new Error(reply.error.message));
    else pending.resolve(reply.result);
  });
  await new Promise((resolve,reject)=>{
    socket.addEventListener('open',resolve,{once:true});
    socket.addEventListener('error',reject,{once:true});
  });
}
function call(method,params={}){
  const current=++id;
  return new Promise((resolve,reject)=>{
    awaiting.set(current,{resolve,reject});
    socket.send(JSON.stringify({id:current,method,params}));
  });
}
async function evaluate(expression){
  const r=await call('Runtime.evaluate',{
    expression:'('+expression+')',
    returnByValue:true,awaitPromise:true,userGesture:true
  });
  if(r.exceptionDetails)throw new Error(
    'Browser exception: '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));
  return r.result.value;
}
/** Actual Android-like touch interaction, not programmatic .click(). */
async function touch(selector,index=0){
  const expression=`(()=>{const all=[...document.querySelectorAll(${JSON.stringify(selector)})];
    const node=all[${index}];if(!node)throw new Error('Missing touch target');
    node.scrollIntoView({block:'center',behavior:'instant'});
    const r=node.getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height};
  })()`;
  const r=await evaluate(expression);
  assert.ok(r.width>0&&r.height>0,'Touch target must have a positive hitbox: '+selector);
  await sleep(140);
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x,y:r.y,id:1}]});
  await sleep(80);
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}

async function until(description,check,tries=50){
  for(let i=0;i<tries;i++){
    const result=await check().catch(()=>false);
    if(result)return result;
    await sleep(300);
  }
  throw new Error('Browser timed out waiting for '+description);
}
async function main(){
  await connection();
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride',{
    width:390,height:844,screenWidth:390,screenHeight:844,
    deviceScaleFactor:1,mobile:true
  });
  await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await call('Page.navigate',{url});
  await until('live 3D map',()=>evaluate(`!!document.querySelector('#scene canvas') &&
    !!document.body.classList.contains('remote-world')`));
  const map=await evaluate(`({
    hasCanvas:!!document.querySelector('#scene canvas'),
    remote:document.body.classList.contains('remote-world'),
    error:!!document.querySelector('#ui-failure, #scene [role=alert]')
  })`);
  assert.ok(map.hasCanvas&&map.remote&&!map.error);
  console.log('MW019A2_MAP_PASS: server viewer has a working WebGL canvas');
  const renderStats=await evaluate(`window.__MW_VISUAL_STATS__`);
  assert.ok(renderStats,'Read-only render diagnostics must be present');
  assert.ok(renderStats.fogNear>=130&&renderStats.fogFar>=390,
    'The second island must not disappear into close artificial fog');
  assert.ok(renderStats.pixelRatio<=1.26,
    'Android must use a bounded GPU pixel load');
  assert.equal(renderStats.shadowMaps,false,
    'On mobile render affordable contact shades instead of costly shadow maps');
  assert.ok(renderStats.visibleItemMeshes<=520,
    '3D must have a stable item budget even when the saved world has huge supplies');
  assert.equal(renderStats.shoreBands,4,'Both original islands must have two accurate shoreline bands');
  assert.equal(renderStats.seaTexture,true,'Existing water must be visibly textured, not blank');
  assert.ok(renderStats.cloudMinAltitude>=70,'Clouds must not float in front of camera at village height');
  console.log('MW019A2_SHORE_SEA_CLOUD_PASS',JSON.stringify(renderStats));
  assert.ok(renderStats.cameraPolarDeg>=30&&renderStats.cameraPolarDeg<=52,
    'Portrait camera should look down at the village, not spend half the view on sky');
  console.log('MW019A2_CAMERA_ANGLE_PASS',renderStats.cameraPolarDeg);
  const hud=await evaluate(`(()=>{
    const box=selector=>{const node=document.querySelector(selector);
      if(!node)return null;
      const r=node.getBoundingClientRect();
      return {top:r.top,left:r.left,right:r.right,bottom:r.bottom,
        width:r.width,height:r.height};
    };
    return {perf:box('#mw-render-fps'),top:box('.scene-overlay-top'),
      live:box('.view-badge'),weather:box('.map-weather'),
      items:[...document.querySelectorAll('.mobile-metrics span')].map(node=>{
        const r=node.getBoundingClientRect();
        return {top:r.top,left:r.left,right:r.right,bottom:r.bottom};
      }),perfText:document.querySelector('#mw-render-fps')?.textContent||''};
  })()`);
  const overlaps=(x,y)=>x&&y&&x.left<y.right&&y.left<x.right&&
    x.top<y.bottom&&y.top<x.bottom;
  assert.ok(hud.perf && hud.top && hud.perfText.includes('FPS'),
    'FPS diagnostic should be visible in top HUD');
  assert.ok(hud.perf.left>=hud.top.left-1&&hud.perf.right<=hud.top.right+1,
    'FPS diagnostic must fit inside top HUD');
  assert.ok(!overlaps(hud.perf,hud.live)&&!overlaps(hud.perf,hud.weather),
    'FPS overlay may not cover Live World or weather');
  assert.equal(hud.items.length,3);
  const metricTops=hud.items.map(x=>x.top);
  assert.ok(Math.max(...metricTops)-Math.min(...metricTops)<3,
    'Resident, wood and food badges must fit into ONE mobile row');
  console.log('MW019A2_MOBILE_HUD_PASS',JSON.stringify(hud));
  assert.ok(Number.isInteger(renderStats.stockyardRelocations) &&
    Number.isInteger(renderStats.groundItemsRelocated) &&
    Number.isInteger(renderStats.stockLayoutUnplaced),
    'The browser must expose safe stockyard layout diagnostics');
  console.log('MW019A2_STOCKYARD_RENDER_PASS',JSON.stringify({
    stockyardRelocations:renderStats.stockyardRelocations,
    groundItemsRelocated:renderStats.groundItemsRelocated,
    unplaced:renderStats.stockLayoutUnplaced,
    visibleItems:renderStats.visibleItemMeshes,
    inventory:renderStats.inventoryItemCount
  }));
  console.log('MW019A2_VISUAL_QUALITY_PASS',JSON.stringify(renderStats));
  await until('actual on-screen Android FPS meter',()=>evaluate(`
    document.querySelector('#mw-render-fps')?.textContent?.includes(' FPS')`),65);
  console.log('MW019A2_FPS_METER_PASS:',await evaluate(`
    document.querySelector('#mw-render-fps').textContent`));

  await touch('.mobile-site-nav [data-page=people]');
  await until('fps overlay hidden in the people view',()=>evaluate(`
    !!document.querySelector('#mw-render-fps')?.hidden`));
  console.log('MW019A2_FPS_OVERLAY_PASS: no floating FPS chip over biography');
  await until('people cards',()=>evaluate(`document.body.classList.contains('page-people') &&
    document.querySelectorAll('#citizen-list button').length>=30`));
  const before=await evaluate(`({
    count:document.querySelectorAll('#citizen-list button').length,
    name:document.querySelector('#life-fullname').textContent,
    route:location.pathname
  })`);
  assert.equal(before.route,'/lide/');
  await touch('#citizen-list button',1);
  await until('second NPC selection',()=>evaluate(`document.querySelectorAll(
    '#citizen-list button[aria-pressed=true]').length===1 &&
    document.querySelectorAll('#citizen-list button')[1].getAttribute('aria-pressed')==='true'`));
  const after=await evaluate(`({
    name:document.querySelector('#life-fullname').textContent,
    error:!!document.querySelector('#ui-failure')
  })`);
  assert.notEqual(before.name,after.name,'Selecting a second NPC must change its biography');
  assert.ok(!after.error,'Selecting a citizen may not crash the browser UI');
  console.log('MW019A2_CITIZEN_SELECTION_PASS: actual second NPC biography opened');

  await touch('.mobile-site-nav [data-page=overview]');
  await until('overview contents',()=>evaluate(`document.body.classList.contains('page-overview') &&
    document.querySelector('#npc-name')?.textContent?.length>0`));
  const name=await evaluate(`document.querySelector('#npc-name').textContent`);
  const nextControl=await evaluate(`(()=>{
    const button=document.querySelector('#btn-next-npc');
    const r=button.getBoundingClientRect();
    return {width:r.width,height:r.height,label:button.getAttribute('aria-label')};
  })()`);
  assert.ok(nextControl.width>=44&&nextControl.height>=44,
    'Next NPC must be a finger-sized control in the mobile overview');
  assert.equal(nextControl.label,'Další obyvatel');
  await touch('#btn-next-npc');
  await until('next citizen in overview',()=>evaluate(
    `document.querySelector('#npc-name').textContent!==${JSON.stringify(name)}`));
  assert.equal(await evaluate(`location.pathname`),'/prehled/');
  assert.ok(!await evaluate(`!!document.querySelector('#ui-failure')`));
  console.log('MW019A2_OVERVIEW_BUTTON_PASS: next-NPC control updates details');

  await touch('.mobile-site-nav [data-page=map]');
  await until('back to live scene',()=>evaluate(`document.body.classList.contains('page-map') &&
    !!document.querySelector('#scene canvas')`));
  await sleep(1200);
  assert.ok(!await evaluate(`!!document.querySelector('#ui-failure')`));
  console.log('MW019A2_NAVIGATION_PASS: scene remains alive after overview and people tabs');
  await touch('#btn-far-island');
  await until('switch to opposite island',()=>evaluate(`document.querySelector('#btn-far-island').textContent.includes('První ostrov')`));
  await until('second island elevated framing',()=>evaluate(`
    window.__MW_VISUAL_STATS__.cameraPolarDeg<53`));
  assert.ok(!await evaluate(`!!document.querySelector('#ui-failure')`));
  console.log('MW019A2_SECOND_ISLAND_PASS: distant terrain is navigable without render exceptions');
}
try{await main();}
finally{
  if(socket?.readyState===WebSocket.OPEN)socket.close();
  chrome.kill('SIGKILL');
}
