import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {buildAuthorPrompt,buildLektorPrompt,buildConceptFixPrompt,SOURCE_REVIEW_RULES} from '../server/studio/step-io';
import {lessonSchema} from '../shared/lesson-schema';

test('a forráspélda a szerző, lektor és célzott javító promptban is megmarad',()=>{
 const map={subject:'Matematika',classroom:7,concepts:[{id:'private-db-id',localId:'triangle',term:'Háromszög területe',definition:'a=3,2 m és m=5,6 m esetén T=8,96 m².',quote:'T=3,2·5,6/2=8,96 m².',examWeight:'core' as const}]};
 const lesson=lessonSchema.parse({mapId:'map',subject:map.subject,classroom:7,title:'Háromszög',sourceOnly:true,misconceptions:[],sections:[{heading:'Terület',probaEnabled:true,blocks:[{kind:'explain',text:map.concepts[0].definition,depth:'core',coversConceptIds:['triangle']}]}]});
 for(const prompt of [buildAuthorPrompt([{heading:'Terület',conceptIds:['triangle'],plannedBlocks:['explain'],animationSuggestions:[]}],map,[]),buildLektorPrompt(lesson,map),buildConceptFixPrompt(lesson,map,'triangle')]){
  assert.ok(prompt.includes(map.concepts[0].definition));assert.ok(prompt.includes(map.concepts[0].quote));assert.ok(prompt.includes(SOURCE_REVIEW_RULES));assert.ok(!prompt.includes('private-db-id'));
 }
});

test('mindkét adatbázisos fogalomlekérdezés továbbítja a definíciót és idézetet',()=>{
 const src=readFileSync(new URL('../server/studio/step-runner.ts',import.meta.url),'utf8');
 const queries=src.match(/\.select\(\{[\s\S]*?\}\)\s*\.from\(kmConcepts\)/g)??[];
 assert.equal(queries.length,2);
 for(const query of queries){assert.match(query,/definition:\s*kmConcepts.definition/);assert.match(query,/quote:\s*kmConcepts.quote/);}
});
