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
    this.fire={heat:0,lastFuel:0,lastWood:null,fuelCount:0};
    this.add('berry',14,'crate-1');
  }
  defaultContainer(type){
    if(type==='wood'||type==='twig')return 'woodpile';
    if(type==='stone')return 'stonepile';
    if(type==='seed')return 'seedtray';
    if((type==='apple'||type==='berry')&&this.baskets.length)return this.baskets.at(-1).id;
    return 'crate-1';
  }
  add(type,quantity=1,containerId=null) {
    if(!ITEM_INFO[type]) throw new Error('Unknown material type: '+type);
    if(!Number.isInteger(quantity)||quantity<0) throw new Error('Quantity must be nonnegative integer');
    const container=containerId||this.defaultContainer(type);
    if(!this.containers.has(container))throw new Error('Unknown storage container '+container);
    const result=[];
    for(let i=0;i<quantity;i++){
      const item={id:this.nextId++,type,container,wet:0,created:true};
      this.items.push(item);result.push(item);
    }
    return result;
  }
  count(type){return this.items.filter(x=>x.type===type).length;}
  foodCount(){return FOOD_TYPES.reduce((n,t)=>n+this.count(t),0);}
  countAll(){return this.items.length;}
  consume(type,quantity=1){
    if(quantity<0||!Number.isInteger(quantity))throw new Error('Invalid quantity');
    const candidates=this.items.filter(i=>i.type===type);
    if(candidates.length<quantity)return null;
    // Dry wood burns more effectively; use stored pieces first in normal construction.
    const selected=candidates.slice(0,quantity);
    const ids=new Set(selected.map(x=>x.id));
    this.items=this.items.filter(x=>!ids.has(x.id));
    return selected;
  }
  consumeFood(){
    for(const t of ['berry','apple','grain']){const r=this.consume(t,1);if(r)return r[0];}
    return null;
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
      for(const item of this.items) {
        if(item.type==='wood'||item.type==='apple'||item.type==='berry'||item.type==='seed'||item.type==='grain'){
          item.container=container.id;
        }
      }
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
    const wood=this.items.filter(x=>x.type==='wood').sort((a,b)=>a.wet-b.wet)[0];
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
  itemLayout(item) {
    const container=this.containers.get(item.container);
    if(!container)return {x:0,z:0};
    const peers=this.items.filter(i=>i.container===item.container&&i.type===item.type);
    const index=peers.findIndex(i=>i.id===item.id);
    const typeOffset={wood:{x:0,z:0},twig:{x:.8,z:0},stone:{x:0,z:0},berry:{x:0,z:0},apple:{x:.7,z:0},seed:{x:0,z:0},grain:{x:1,z:0}}[item.type];
    const perRow=container.kind==='basket'?4:container.kind==='crate'?5:9;
    const row=Math.floor(index/perRow),col=index%perRow;
    const spacing=container.kind==='basket'?.17:container.kind==='crate'?.21:.26;
    return {x:container.x+typeOffset.x+(col-(perRow-1)/2)*spacing,
      z:container.z+typeOffset.z+row*spacing};
  }
  snapshot(){
    const byType={};
    for(const key of Object.keys(ITEM_INFO))byType[key]=this.count(key);
    return {byType,total:this.countAll(),food:this.foodCount(),baskets:this.baskets.length,
      buildings:this.structures.length,fields:this.fields.map(f=>({...f})),
      fire:{...this.fire}};
  }
}
