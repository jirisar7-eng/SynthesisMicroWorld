import test from 'node:test';
import assert from 'node:assert/strict';
import { MaterialWorld,RECIPES } from '../src/material-world.js';
import {initializeBiography,lifeEvent,experienceSkill,makeLifeCard} from '../src/biography.js';

test('MW-MAT-001: every collected item has a distinct ID and a physical location',()=>{
 const world=new MaterialWorld();
 const wood=world.add('wood',3);
 const apples=world.add('apple',2);
 assert.equal(new Set([...wood,...apples].map(x=>x.id)).size,5);
 assert.equal(world.countAll(),19);
 for(const item of [...wood,...apples]){
   assert.ok(world.containers.has(item.container));
   const pos=world.itemLayout(item);
   assert.ok(Number.isFinite(pos.x)&&Number.isFinite(pos.z));
 }
});

test('MW-MAT-002: harvesting, crafting and construction conserve the visible inventory',()=>{
 const world=new MaterialWorld();
 world.add('wood',22);world.add('stone',7);world.add('twig',5);
 const total=world.countAll();
 const basket=world.craftBasket(2);
 assert.ok(basket);
 assert.equal(world.count('twig'),0);
 assert.ok(world.pay(RECIPES.house));
 world.addStructure('house',5.1,4.9,1,20);
 assert.equal(world.count('wood'),10);
 assert.equal(world.countAll(),total-5-12);
 assert.equal(world.structures.length,1);
 assert.equal(world.baskets.length,1);
});

test('MW-MAT-003: basket is genuinely woven from twigs and stores new apples',()=>{
 const world=new MaterialWorld();
 world.add('twig',5);
 const basket=world.craftBasket(0);
 world.add('apple',3);
 assert.equal(world.count('twig'),0);
 assert.ok(world.items.filter(x=>x.type==='apple').every(x=>x.container===basket.id));
});

test('MW-MAT-004: open air rain wets logs; roof dries them; wet logs burn colder',()=>{
 const dry=new MaterialWorld(),wet=new MaterialWorld();
 dry.add('wood',2);wet.add('wood',2);
 wet.tick(34,'rain');
 const rainyWet=wet.items.find(x=>x.type==='wood').wet;
 assert.ok(rainyWet>.7);
 const dryFuel=dry.burnWood(22,'clear'),wetFuel=wet.burnWood(22,'rain');
 assert.ok(dryFuel.heat>wetFuel.heat);
 dry.addStructure('warehouse',-7,3,1,30);
 wet.addStructure('warehouse',-7,3,1,30);
 const testWood=wet.items.find(x=>x.type==='wood');
 assert.ok(wet.covered(testWood));
 const initial=testWood.wet;
 wet.tick(15,'rain');
 assert.ok(testWood.wet<initial,'covered material dries even while it rains outside');
});

test('MW-MAT-005: seeds must exist and be consumed before fields can grow',()=>{
 const world=new MaterialWorld();
 const f=world.addStructure('farm',8,-8,1,1);
 assert.ok(f);
 const field=world.fields[0];
 assert.equal(world.plant(field.id,2),false);
 world.add('seed',1);
 assert.equal(world.plant(field.id,3),true);
 assert.equal(world.count('seed'),0);
 world.tick(250,'rain');
 assert.equal(field.growth,1);
 const harvest=world.harvest(field.id);
 assert.deepEqual(harvest,{grain:6,seeds:2});
 assert.equal(world.count('grain'),6);
 assert.equal(world.count('seed'),2);
 assert.equal(world.harvest(field.id),null);
});

test('MW-MAT-006: building catalog needs actual stone as well as wood',()=>{
 const world=new MaterialWorld();
 world.add('wood',12);
 assert.equal(world.chooseBuilding().type,'house');
 world.pay(RECIPES.house);world.addStructure('house',5.1,4.9,1,7);
 world.add('wood',30);
 assert.equal(world.chooseBuilding(),null,'warehouse needs mined stone');
 world.add('stone',5);
 assert.equal(world.chooseBuilding().type,'warehouse');
 world.pay(RECIPES.warehouse);world.addStructure('warehouse',-8.6,5.4,2,100);
 assert.equal(world.count('stone'),0);
 assert.ok(world.containers.has('covered-building-2'));
});

test('MW-LIFE-001: biography is based on recorded actions, not fabricated history',()=>{
 const a=initializeBiography({id:0,name:'Adam',hunger:14,energy:91,socialNeed:33,mood:80,
   personality:{name:'Zvídavý'},mode:'idle',purpose:'explore',reason:'Je zvídavý',
   cognition:{resources:{'tree:1':{}}},relationships:{},memories:['Dorazil']},0);
 const sim={day:3,agents:[a],material:{structures:[]}};
 let card=makeLifeCard(a,sim);
 assert.match(card.biography,/historie teprve vzniká/);
 lifeEvent(a,2,'Dokončil dům','Postavil obydlí');
 experienceSkill(a,'wood',12);
 card=makeLifeCard(a,sim);
 assert.match(card.biography,/dokončil dům/);
 assert.equal(card.timeline[0].day,2);
 assert.equal(card.skills.find(x=>x.name==='Práce se dřevem').level,12);
 assert.match(card.health,/zatím není simulován/);
});
