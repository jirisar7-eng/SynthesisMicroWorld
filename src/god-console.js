/** MW-GOD-001 mobile panel. The token is kept only in ephemeral JS memory. */
const $=id=>document.getElementById(id);
const reqId=()=>crypto.randomUUID();
export function createGodConsole({sim,isRemote,refreshWorld,getSelectedAgent}){
  let powers=[],token='',control={paused:false,speed:1},point={x:0,z:0},picking=false,busy=false;
  const root=document.createElement('section');
  root.id='mw-god-console';root.className='mw-god-console';root.hidden=true;
  root.setAttribute('role','dialog');root.setAttribute('aria-label','Božský panel');
  root.innerHTML=[
    '<header class="mw-god-header"><div><small>MW-GOD-001 · SOUKROMÝ SERVER</small><h2>Božské schopnosti</h2></div><button type="button" id="god-close">×</button></header>',
    '<div class="mw-god-body"><p id="god-status" role="status">Načítám schopnosti…</p>',
    '<label for="god-token">Administrátorský token VPS</label>',
    '<div class="mw-god-row"><input type="password" id="god-token" autocomplete="off" placeholder="Token se neukládá">',
    '<button id="god-unlock">Odemknout</button></div>',
    '<label for="god-power">Schopnost</label><select id="god-power"></select><p id="god-description" class="mw-god-note"></p>',
    '<label for="god-target">Cíl</label><select id="god-target">',
    '<option value="world">Celý svět</option><option value="agent">Jednotlivec</option>',
    '<option value="group">Skupina v okolí</option><option value="point">Místo na mapě</option></select>',
    '<div class="mw-god-row"><output id="god-target-info"></output><button id="god-pick">Vybrat v 3D</button></div>',
    '<label for="god-radius">Poloměr skupiny: <output id="god-radius-info">12</output></label>',
    '<input type="range" id="god-radius" min="2" max="25" value="12">',
    '<label for="god-intensity">Intenzita: <output id="god-intensity-info">1</output>/5</label>',
    '<input type="range" id="god-intensity" min="1" max="5" step="1" value="1">',
    '<button id="god-apply" class="mw-god-primary">Provést božský zásah</button>',
    '<hr><h3>Ovládání času</h3><div class="mw-god-row">',
    '<button id="god-pause">Pozastavit</button><select id="god-speed">',
    '<option value="0.25">0,25×</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option>',
    '</select></div><hr><h3>Obnova světa</h3>',
    '<p class="mw-god-note">Před každou změnou vzniká kontrolní bod. Uchovává se posledních deset.</p>',
    '<select id="god-checkpoints" aria-label="Uložený bod"></select>',
    '<div class="mw-god-row"><button id="god-refresh">Načíst body</button>',
    '<button id="god-restore">Obnovit vybraný</button></div>',
    '<hr><h3>Historie božských zásahů</h3><div id="god-history"></div></div>'
  ].join('');
  document.body.append(root);
  const ui=id=>root.querySelector('#god-'+id);
  const note=(msg,err=false)=>{ui('status').textContent=msg;ui('status').dataset.error=String(err);};
  const headers=()=>({'Authorization':'Bearer '+token,'Content-Type':'application/json'});
  async function api(path,options={}){
    const res=await fetch('/api/god/'+path,{cache:'no-store',...options});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw Error(data.message||data.error||'HTTP '+res.status);
    return data;
  }
  function authed(path){if(!token)throw Error('Nejprve odemkni panel tokenem.');
    return api(path,{headers:headers()});}
  function post(path,payload){if(!token)throw Error('Nejprve odemkni panel tokenem.');
    return api(path,{method:'POST',headers:headers(),
      body:JSON.stringify({...payload,requestId:reqId()})});}
  function controlUI(value){
    control={...control,...value};
    ui('pause').textContent=control.paused?'Pokračovat':'Pozastavit';
    ui('speed').value=String(control.speed);
  }
  function targetUI(){
    const type=ui('target').value,person=sim.agents.find(a=>a.id===getSelectedAgent());
    ui('target-info').textContent=type==='world'?'Celý svět':
      type==='agent'?(person?.name||'Vyber NPC'):
      type==='group'?'Skupina u '+point.x.toFixed(1)+', '+point.z.toFixed(1):
        'Bod '+point.x.toFixed(1)+', '+point.z.toFixed(1);
    ui('radius').disabled=type!=='group';
    ui('pick').disabled=type==='world';
  }
  function powerUI(){
    const spec=powers.find(p=>p.id===ui('power').value);
    if(!spec)return;
    ui('description').textContent=spec.description;
    const desired=spec.target==='world'?'world':spec.target==='point'?'point':'agent';
    if(spec.target==='world'||spec.target==='point'||
       !['agent','group'].includes(ui('target').value))ui('target').value=desired;
    for(const o of ui('target').options)o.disabled=
      spec.target==='world'?o.value!=='world':
      spec.target==='point'?o.value!=='point':!['agent','group'].includes(o.value);
    targetUI();
  }
  async function history(){
    const [a,b]=await Promise.all([authed('history'),authed('checkpoints')]);
    controlUI(a.control);
    const list=ui('history');list.replaceChildren();
    for(const entry of a.entries.slice(0,40)){
      const box=document.createElement('article'),strong=document.createElement('strong'),
        small=document.createElement('small');
      strong.textContent='#'+entry.id+' · '+(powers.find(p=>p.id===entry.power)?.label||entry.power);
      small.textContent='Den '+entry.day+' · '+entry.result+
        (entry.affectedIds?.length?' · NPC '+entry.affectedIds.join(', '):'');
      box.append(strong,small);list.append(box);
    }
    if(!list.childNodes.length)list.textContent='Zatím žádný zásah.';
    const sel=ui('checkpoints'),current=sel.value;sel.replaceChildren();
    for(const c of b.checkpoints){
      const opt=document.createElement('option');opt.value=c.id;opt.textContent=c.id;sel.append(opt);
    }
    if([...sel.options].some(o=>o.value===current))sel.value=current;
  }
  async function initialize(){
    if(!isRemote()){note('Božské API vyžaduje aktivní serverový svět na VPS.',true);return;}
    try{
      const response=await api('catalog');
      powers=response.powers;ui('power').replaceChildren();
      for(const power of powers){const o=document.createElement('option');
        o.value=power.id;o.textContent=power.category+' · '+power.label;ui('power').append(o);}
      controlUI(response.control);powerUI();
      note(response.control.enabled?'API připraveno. Zadej soukromý token.':
        'Server nemá nastavený MW_GOD_ADMIN_TOKEN.',!response.control.enabled);
    }catch(e){note('Božské API nedostupné: '+e.message,true);}
  }
  async function run(action){
    if(busy)return;busy=true;
    for(const id of ['apply','pause','restore'])ui(id).disabled=true;
    try{
      const outcome=await action();
      await refreshWorld();
      await history();
      note(outcome.event?.result||'Server změnu potvrdil a uložil.');
    }catch(e){note(e.message,true);}
    finally{busy=false;for(const id of ['apply','pause','restore'])ui(id).disabled=false;}
  }
  $('btn-god-console')?.addEventListener('click',()=>{root.hidden=!root.hidden;});
  ui('close').addEventListener('click',()=>root.hidden=true);
  ui('power').addEventListener('change',powerUI);
  ui('target').addEventListener('change',targetUI);
  ui('radius').addEventListener('input',()=>ui('radius-info').textContent=ui('radius').value);
  ui('intensity').addEventListener('input',()=>ui('intensity-info').textContent=ui('intensity').value);
  ui('unlock').addEventListener('click',async()=>{
    token=ui('token').value.trim();ui('token').value='';
    try{await history();note('Odemčeno. Zásahy míří do skutečné serverové simulace.');}
    catch(e){token='';note('Odemknutí se nezdařilo: '+e.message,true);}
  });
  ui('pick').addEventListener('click',()=>{
    if(!isRemote()){note('Pro výběr je nutný serverový svět.',true);return;}
    picking=true;root.hidden=true;
    if(!document.body.classList.contains('page-map'))
      document.querySelector('a[data-page="map"]')?.click();
  });
  function payloadTarget(){
    const type=ui('target').value;
    if(type==='world')return {type};
    if(type==='agent')return {type,id:getSelectedAgent()};
    if(type==='group')return {type,x:point.x,z:point.z,radius:Number(ui('radius').value)};
    return {type:'point',x:point.x,z:point.z};
  }
  ui('apply').addEventListener('click',()=>{
    const power=ui('power').value;
    if(!power){note('Seznam schopností není načten.',true);return;}
    if(['fire','flood','meteor'].includes(power)&&
       !confirm('Opravdu spustit katastrofu v živém světě?'))return;
    void run(()=>post('action',{power,target:payloadTarget(),
      intensity:Number(ui('intensity').value)}));
  });
  ui('pause').addEventListener('click',()=>void run(()=>post('control',{
    paused:!control.paused,speed:control.speed})));
  ui('speed').addEventListener('change',()=>void run(()=>post('control',{
    paused:control.paused,speed:Number(ui('speed').value)})));
  ui('refresh').addEventListener('click',()=>void history().catch(e=>note(e.message,true)));
  ui('restore').addEventListener('click',()=>{
    const checkpointId=ui('checkpoints').value;
    if(!checkpointId){note('Není vybrán bod obnovy.',true);return;}
    if(!confirm('Obnovit svět k bodu '+checkpointId+'? Před obnovou vznikne záloha.'))return;
    void run(()=>post('restore',{checkpointId,confirm:'RESTORE_WORLD'}));
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){picking=false;root.hidden=true;}});
  void initialize();
  return {
    isPicking:()=>picking,
    wantsArea:()=>picking&&['group','point'].includes(ui('target').value),
    selectAgent(id){
      const a=sim.agents.find(x=>x.id===id);
      if(picking&&a&&ui('target').value==='group')point={x:a.x,z:a.z};
      if(picking){picking=false;root.hidden=false;}
      targetUI();
    },
    selectPoint(p){
      if(!picking)return;
      point={x:+p.x.toFixed(2),z:+p.z.toFixed(2)};
      picking=false;root.hidden=false;targetUI();
    }
  };
}
