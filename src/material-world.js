import {layoutStockItem,stockSlotGroup} from './stockpile-layout.js';

/**
 * MW-006: physically accounted settlement materials.
 * Every unit in the shared inventory is a distinct object with an ID,
 * a visible position, a container, moisture and a complete type.
 * Rendering may switch to LOD later; accounting never does.
 */
export const ITEM_INFO = Object.freeze({
  wood: {name:'Poleno', icon:'🪵'},
  twig: {name:'Proutí', icon:'🌿'},
  stone: {name:'Kámen', icon:'🪨'},
  berry: {name:'Bobule', icon:'🫐'},
  apple: {name:'Jablko', icon:'🍎'},
  seed: {name:'Semínko divokých bobulí', icon:'🌱'},
  grain: {name:'Obilí', icon:'🌾'}
});
export const FOOD_TYPES = ['berry','apple','grain'];
export const RECIPES = Object.freeze({
  house: {name:'Obytný dům',wood:12,stone:0,capacity:4,color:'#d7bd9d',roof:'#876046',size:[3.6,3.4]},
  warehouse: {name:'Skladiště',wood:14,stone:5,capacity:100,color:'#b39c7b',roof:'#615d55',size:[5,3.9]},
  farm: {name:'Hospodářství',wood:8,stone:4,capacity:12,color:'#b8a782',roof:'#937351',size:[4.4,4]},
  hall: {name:'Společenský dům',wood:18,stone:8,capacity:12,color:'#d6c3a7',roof:'#655d5e',size:[5.2,4.8]},
  workshop: {name:'Dílna',wood:15,stone:6,capacity:6,color:'#aaa48f',roof:'#686e61',size:[4.1,3.9]}
});
export const BUILD_SITES = Object.freeze([
  {x:5.1,z:4.9,type:'house'},
  {x:-8.6,z:5.4,type:'warehouse'},
  {x:8.6,z:-8.2,type:'farm'},
  {x:-7.2,z:-8.8,type:'hall'},
  {x:13.4,z:9.4,type:'workshop'},
  {x:1.2,z:13.1,type:'house'}
]);
const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
const fixed=(n)=>Math.round(n*1000)/1000;

export class MaterialWorld {
  constructor() {
    this.items=[];
    this.nextId=1;
    this.containers=new Map([
      ['crate-1',{id:'crate-1',kind:'crate',name:'Společná bedna',x:2.5,z:2.4,roof:false}],
      ['woodpile',{id:'woodpile',kind:'pile',name:'Hromada dřeva',x:-3.7,z:2.1,roof:false}],
      ['stonepile',{id:'stonepile',kind:'pile',name:'Hromada kamení',x:-4.9,z:-1,roof:false}],
      ['seedtray',{id:'seedtray',kind:'tray',name:'Semena',x:2.5,z:-2.7,roof:false}]
    ]);
    this.baskets=[];
    this.structures=[];
    this.fields=[];
    this.tents=[];
    this.projects=new Map();this.nextProjectId=1;
    this.logistics={collected:0,delivered:0,transported:0,constructionDeliveries:0};
    this.fire={heat:0,lastFuel:0,lastWood:null,fuelCount:0};
    this.add('berry',14,'crate-1');
  }
  defaultContainer(type){
    if(type==='wood'||type==='twig')return 'woodpile';
    if(type==='stone')return 'stonepile';
    if(type==='seed')return 'seedtray';
    if(type==='apple'||type==='berry'){
      // A woven basket has finite volume: do not grow a tall fruit tower forever.
      for(const basket of this.baskets.toReversed()){
        if(this.items.filter(i=>i.container===basket.id).length<12)return basket.id;
      }
    }
    return 'crate-1';
  }
  add(type,quantity=1,containerId=null) {
    if(!ITEM_INFO[type]) throw new Error('Unknown material type: '+type);
    if(!Number.isInteger(quantity)||quantity<0) throw new Error('Quantity must be nonnegative integer');
    // Choose an actual destination for EVERY separate item.
    // A multi-item harvest must not overflow one basket just because its
    // destination was computed only once before the batch was created.
    if(containerId&&!this.containers.has(containerId))throw new Error('Unknown storage container '+containerId);
    const result=[];
    for(let i=0;i<quantity;i++){
      const container=containerId||this.defaultContainer(type);
      if(!this.containers.has(container))throw new Error('Unknown storage container '+container);
      const item={id:this.nextId++,type,container,wet:0,created:true};
      this.items.push(item);result.push(item);
    }
    return result;
  }
  // Available inventory excludes items being physically carried or reserved for construction.
  isAvailable(item){
    if(item.reservedFor)return false;
    const c=this.containers.get(item.container);
    return !!c && c.kind!=='carry' && c.kind!=='site' && c.kind!=='tentStorage';
  }
  count(type){return this.items.filter(x=>x.type===type&&this.isAvailable(x)).length;}
  countStored(type){return this.items.filter(x=>x.type===type&&this.containers.get(x.container)?.kind!=='carry').length;}
  countCarried(){return this.items.filter(x=>this.containers.get(x.container)?.kind==='carry').length;}
  foodCount(){return FOOD_TYPES.reduce((n,t)=>n+this.count(t),0);}
  countAll(){return this.items.length;}
  consume(type,quantity=1){
    if(quantity<0||!Number.isInteger(quantity))throw new Error('Invalid quantity');
    const candidates=this.items.filter(i=>i.type===type&&this.isAvailable(i));
    if(candidates.length<quantity)return null;
    // Dry wood burns more effectively; use stored pieces first in normal construction.
    const selected=candidates.slice(0,quantity);
    const ids=new Set(selected.map(x=>x.id));
    this.items=this.items.filter(x=>!ids.has(x.id));
    return selected;
  }
  findFoodSource(){
    const item=this.items.find(i=>FOOD_TYPES.includes(i.type)&&this.isAvailable(i));
    if(!item)return null;
    return {item,container:this.containers.get(item.container)};
  }
  consumeFoodFrom(containerId){
    const item=this.items.find(i=>FOOD_TYPES.includes(i.type)&&i.container===containerId&&this.isAvailable(i));
    if(!item)return null;
    this.items=this.items.filter(i=>i.id!==item.id);
    return item;
  }
  consumeFood(){
    const source=this.findFoodSource();
    return source?this.consumeFoodFrom(source.container.id):null;
  }
  canAfford(recipe){return this.count('wood')>=recipe.wood&&this.count('stone')>=recipe.stone;}
  pay(recipe){
    if(!this.canAfford(recipe))return false;
    this.consume('wood',recipe.wood);
    this.consume('stone',recipe.stone);
    return true;
  }
  craftBasket(ownerId){
    if(this.count('twig')<5)return null;
    this.consume('twig',5);
    const id='basket-'+(this.baskets.length+1);
    const basket={id,kind:'basket',name:'Ručně pletený košík',x:2.8+this.baskets.length*.9,z:3.1,roof:false,ownerId};
    this.baskets.push(basket);this.containers.set(id,basket);
    return basket;
  }
  addStructure(type,x,z,builderId,time){
    const id='building-'+(this.structures.length+1);
    const building={id,type,x,z,builderId,builtAt:time,roof:true};
    this.structures.push(building);
    if(type==='warehouse'){
      const container={id:'covered-'+id,kind:'shelves',name:'Krytý skladový přístřešek',x:x+3.9,z:z+.6,roof:true};
      this.containers.set(container.id,container);
      // Nothing teleports from an outdoor heap: citizens must physically move it.
      this.logistics.hasWarehouse=true;
    }
    if(type==='farm')this.fields.push({id:'field-'+id,x:x+3.5,z:z+.2,crop:'berry',planted:false,growth:0,water:.7,seededAt:null,crops:0,harvests:0});
    return building;
  }
  covered(item){return Boolean(this.containers.get(item.container)?.roof);}
  updateMoisture(dt,weather){
    for(const item of this.items){
      if(item.type!=='wood'&&item.type!=='twig')continue;
      const roof=this.covered(item);
      const delta=roof ? -.023*dt : weather==='rain' ? .024*dt : weather==='drought' ? -.013*dt : -.004*dt;
      item.wet=fixed(clamp(item.wet+delta,0,1));
    }
  }
  burnWood(time,weather){
    if(time-this.fire.lastFuel<21)return null;
    this.fire.lastFuel=time;
    const wood=this.items.filter(x=>x.type==='wood'&&this.isAvailable(x)).sort((a,b)=>a.wet-b.wet)[0];
    if(!wood){this.fire.heat=0;return null;}
    this.items=this.items.filter(x=>x.id!==wood.id);
    const effectiveHeat=Math.round(100*(1-wood.wet*.77));
    this.fire.heat=effectiveHeat;
    this.fire.lastWood={id:wood.id,wet:wood.wet,heat:effectiveHeat,roof:this.covered(wood)};
    this.fire.fuelCount++;
    return this.fire.lastWood;
  }
  tick(dt,weather){
    this.updateMoisture(dt,weather);
    // Heat is instant fuel efficiency; the life of the fire is handled by the simulation clock.
    for(const field of this.fields){
      if(!field.planted)continue;
      const water=weather==='rain'?1.1:weather==='drought'?.32:.7;
      field.water=water;
      const growthRate=water/120;
      field.growth=clamp(field.growth+growthRate*dt,0,1);
    }
  }
  plant(fieldId,time){
    const field=this.fields.find(f=>f.id===fieldId);
    if(!field||field.planted||!this.consume('seed',1))return false;
    field.planted=true;field.growth=0;field.seededAt=time;
    return true;
  }
  harvest(fieldId){
    const field=this.fields.find(f=>f.id===fieldId);
    if(!field||!field.planted||field.growth<1)return null;
    field.planted=false;field.growth=0;field.harvests++;field.crops+=6;
    // Wild berry seeds grow berry bushes, not implausibly a different cereal crop.
    this.add('berry',6);this.add('seed',2);
    return {berries:6,seeds:2};
  }
  chooseBuilding(){
    const current = new Set(this.structures.map(x=>x.type));
    for(const site of BUILD_SITES){
      if(this.structures.some(x=>x.x===site.x&&x.z===site.z))continue;
      const type=site.type,recipe=RECIPES[type];
      if(type==='house' && !this.structures.some(x=>x.type==='house') && this.canAfford(recipe))return {...site,recipe};
      if(type==='warehouse'&&current.has('house')&&this.canAfford(recipe))return {...site,recipe};
      if(type==='farm'&&current.has('warehouse')&&this.count('seed')>=1&&this.canAfford(recipe))return {...site,recipe};
      if(type==='hall'&&current.has('farm')&&this.canAfford(recipe))return {...site,recipe};
      if(type==='workshop'&&current.has('hall')&&this.canAfford(recipe))return {...site,recipe};
      if(type==='house'&&current.has('workshop')&&this.canAfford(recipe))return {...site,recipe};
    }
    return null;
  }
  packDepartureWood(agent){
    const wood=this.items.filter(i=>i.type==='wood'&&this.isAvailable(i)).slice(0,2);
    if(wood.length!==2)return false;
    const bag=this.cargoContainer(agent);
    for(const item of wood)item.container=bag.id;
    this.logistics.transported+=2;
    return true;
  }
  departureFoodSource(){
    for(const c of this.containers.values()){
      if(c.kind==='carry'||c.kind==='site'||c.kind==='tentStorage')continue;
      const count=this.items.filter(i=>i.container===c.id&&FOOD_TYPES.includes(i.type)&&this.isAvailable(i)).length;
      if(count>=2)return c;
    }
    return null;
  }
  packDepartureFood(agent,sourceId=null){
    const food=this.items.filter(i=>FOOD_TYPES.includes(i.type)&&this.isAvailable(i)&&
      (!sourceId||i.container===sourceId)).slice(0,2);
    if(food.length!==2)return false;
    const bag=this.cargoContainer(agent);
    for(const item of food)item.container=bag.id;
    this.logistics.transported+=2;
    return true;
  }
  cancelDeparture(agent){
    const goods=this.cargo(agent);
    for(const item of goods)item.container=this.defaultContainer(item.type);
    return goods.length;
  }
  pitchTent(agent,site,time){
    const bag=this.cargo(agent);
    const logs=bag.filter(i=>i.type==='wood').slice(0,2);
    if(logs.length!==2)return null;
    const spent=new Set(logs.map(i=>i.id));
    this.items=this.items.filter(i=>!spent.has(i.id));
    const id='tent-'+(this.tents.length+1);
    const tent={id,type:'tent',x:site.x,z:site.z,ownerId:agent.id,builtAt:time,roof:true};
    this.tents.push(tent);
    const basket={id:'tent-storage-'+id,name:'Zásoby u stanu',kind:'tentStorage',
      x:site.x+.5,z:site.z+.6,roof:true,ownerId:agent.id};
    this.containers.set(basket.id,basket);
    for(const item of this.cargo(agent))item.container=basket.id;
    return tent;
  }
  foodAtTent(tentId){
    const container='tent-storage-'+tentId;
    return this.items.filter(i=>i.container===container&&FOOD_TYPES.includes(i.type)).length;
  }
  eatAtTent(agent,tentId){
    const container='tent-storage-'+tentId;
    const food=this.items.find(i=>i.container===container&&FOOD_TYPES.includes(i.type));
    if(!food)return false;
    this.items=this.items.filter(i=>i.id!==food.id);
    return true;
  }
  packTentReturn(agent,tentId){
    const container='tent-storage-'+tentId;
    const bag=this.cargoContainer(agent);
    const moved=this.items.filter(i=>i.container===container);
    for(const item of moved)item.container=bag.id;
    return moved.length;
  }

  cargoContainer(agent){
    const id='carry-'+agent.id;
    let container=this.containers.get(id);
    if(!container){
      container={id,kind:'carry',ownerId:agent.id,name:'Nese '+agent.name,x:agent.x,z:agent.z,roof:false};
      this.containers.set(id,container);
    }
    return container;
  }
  moveCarrier(agent){
    const bag=this.containers.get('carry-'+agent.id);
    if(bag){bag.x=agent.x;bag.z=agent.z;}
  }
  collect(agent,type,quantity,details={}){
    if(!Number.isInteger(quantity)||quantity<0)throw new Error('Invalid collection amount');
    const cargo=this.cargoContainer(agent);
    const made=this.add(type,quantity,cargo.id);
    for(const item of made){item.origin=details.origin||'wilderness';item.collectedBy=agent.id;item.collectedAt=details.time||0;}
    this.logistics.collected+=made.length;
    this.moveCarrier(agent);
    return made;
  }
  cargo(agent){return this.items.filter(i=>i.container==='carry-'+agent.id);}
  deliver(agent,targetId=null){
    const goods=this.cargo(agent);
    for(const item of goods){
      const destination=targetId||this.defaultContainer(item.type);
      if(!this.containers.has(destination))throw new Error('Missing delivery destination '+destination);
      item.container=destination;
    }
    this.logistics.delivered+=goods.length;
    return goods.length;
  }
  nearestRoofedStore(){
    return [...this.containers.values()].find(c=>c.kind==='shelves'&&c.roof)||null;
  }
  planStockTransfer(limit=4){
    const dest=this.nearestRoofedStore();
    if(!dest)return null;
    const originals=['woodpile','crate-1','seedtray','stonepile'];
    for(const from of originals){
      const source=this.containers.get(from);
      const goods=this.items.filter(i=>i.container===from&&!i.reservedFor).slice(0,limit);
      if(goods.length)return {source,destination:dest,ids:goods.map(x=>x.id)};
    }
    return null;
  }
  pickupStorage(agent,ids){
    const bag=this.cargoContainer(agent);
    const stock=ids.map(id=>this.items.find(i=>i.id===id)).filter(Boolean);
    if(stock.length!==ids.length||stock.some(i=>!this.isAvailable(i)))return false;
    for(const item of stock)item.container=bag.id;
    this.logistics.transported+=stock.length;
    return true;
  }
  createProject(recipe,{x,z,type,builderId,time=0}){
    if(!this.canAfford(recipe))return null;
    const projectId='project-'+this.nextProjectId++;
    const site={id:'site-'+projectId,kind:'site',name:'Staveniště',x,z,roof:false,buildingWidth:recipe.size?.[0]||4};
    this.containers.set(site.id,site);
    const items=[];
    for(const [kind,amount] of [['wood',recipe.wood],['stone',recipe.stone]]){
      const candidates=this.items.filter(i=>i.type===kind&&this.isAvailable(i)).slice(0,amount);
      if(candidates.length!==amount)throw new Error('Project reservation race');
      for(const item of candidates){item.reservedFor=projectId;items.push(item.id);}
    }
    const project={id:projectId,type,x,z,builderId,time,siteId:site.id,items,total:items.length,delivered:0,complete:false};
    this.projects.set(projectId,project);
    return project;
  }
  pendingProject(projectId,limit=4){
    const project=this.projects.get(projectId);
    if(!project)return [];
    return project.items.map(id=>this.items.find(i=>i.id===id))
      .filter(i=>i&&i.reservedFor===projectId&&i.container!==project.siteId&&
        this.containers.get(i.container)?.kind!=='carry').slice(0,limit);
  }
  pickProjectLoad(agent,projectId,ids){
    const project=this.projects.get(projectId);
    if(!project||!ids.length||ids.length>5)return false;
    const items=ids.map(id=>this.items.find(i=>i.id===id));
    if(items.some(i=>!i||i.reservedFor!==projectId||i.container===project.siteId))return false;
    const bag=this.cargoContainer(agent);
    for(const item of items)item.container=bag.id;
    this.logistics.transported+=items.length;
    return true;
  }
  depositProjectLoad(agent,projectId){
    const project=this.projects.get(projectId);
    if(!project)return 0;
    let n=0;
    for(const item of this.cargo(agent)){
      if(item.reservedFor===projectId){item.container=project.siteId;n++;}
    }
    project.delivered+=n;
    this.logistics.constructionDeliveries+=n;
    return n;
  }
  projectReady(projectId){
    const project=this.projects.get(projectId);
    return !!project&&project.delivered===project.total&&project.total>0;
  }
  finalizeProject(projectId){
    const project=this.projects.get(projectId);
    if(!this.projectReady(projectId))return false;
    const toRemove=new Set(project.items);
    this.items=this.items.filter(i=>!toRemove.has(i.id));
    project.complete=true;this.projects.delete(projectId);
    return true;
  }

  itemLayout(item,indexOverride=null) {
    const container=this.containers.get(item.container);
    const index=indexOverride===null?
      this.items.filter(i=>i.container===item.container&&
        stockSlotGroup(i,container)===stockSlotGroup(item,container))
        .findIndex(i=>i.id===item.id):indexOverride;
    return layoutStockItem(item,container,index);
  }
  snapshot(){
    const byType={};
    for(const key of Object.keys(ITEM_INFO))byType[key]=this.count(key);
    return {byType,total:this.countAll(),carried:this.countCarried(),
      atSite:this.items.filter(i=>this.containers.get(i.container)?.kind==='site').length,
      logistics:{...this.logistics},food:this.foodCount(),baskets:this.baskets.length,
      buildings:this.structures.length,fields:this.fields.map(f=>({...f})),
      fire:{...this.fire}};
  }
}
