import assert from 'node:assert/strict';
import test from 'node:test';
import { parseExtractorConcept } from '../server/studio/extractor';

const concept={id:'area',term:'Terület',definition:'T=ab',quote:'T=ab',type:'formula',examWeight:'core',relatedIds:[]};
test('unpaginated sources do not lose all concepts to model-generated missing-page labels',()=>{
 for(const kind of ['text','image'] as const)for(const page of [null,'nincs oldalszám',0]){
  const parsed=parseExtractorConcept({...concept,sourceRef:{file:'source',page}},[{name:'source',kind,content:'T=ab'}]);
  assert.equal(parsed.success,true);
  if(parsed.success)assert.deepEqual(parsed.data.sourceRef,{file:'source'});
 }
});
test('PDF pages and substantive concept fields remain strictly validated',()=>{
 const files=[{name:'source',kind:'pdf' as const,content:'pdf'}];
 assert.equal(parseExtractorConcept({...concept,sourceRef:{file:'source',page:'nincs oldalszám'}},files).success,false);
 assert.equal(parseExtractorConcept({...concept,sourceRef:{file:'source',page:2}},files).success,true);
 assert.equal(parseExtractorConcept({...concept,type:'invented',sourceRef:{file:'source',page:null}},[{name:'source',kind:'text',content:'T=ab'}]).success,false);
});
