import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseDiffuse} from '../scripts/polyhaven-utils.mjs';

test('MW-ASSET-001: Poly Haven API selects the verified 1K diffuse JPEG',()=>{
 const file=chooseDiffuse({Diffuse:{'1k':{jpg:{url:'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/forrest_ground_01.jpg',size:210000}},'2k':{jpg:{url:'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/forrest_ground_01.jpg',size:1000000}}}});
 assert.equal(file.resolution,'1k');
 assert.equal(file.format,'jpg');
});

test('MW-ASSET-002: forged, huge or insecure external asset URLs are rejected',()=>{
 assert.equal(chooseDiffuse({Diffuse:{'1k':{jpg:{url:'http://dl.polyhaven.org/asset.jpg'}}}}),null);
 assert.equal(chooseDiffuse({Diffuse:{'1k':{jpg:{url:'https://attacker.example/file.jpg'}}}}),null);
 assert.equal(chooseDiffuse({Diffuse:{'1k':{jpg:{url:'https://dl.polyhaven.org/large.jpg',size:4000000}}}}),null);
 assert.equal(chooseDiffuse({Diffuse:{}}),null);
});
