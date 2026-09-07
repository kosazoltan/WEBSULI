import assert from 'node:assert/strict';
import test from 'node:test';
import { inferOneStepScope, scopeContentParts } from '../server/studio/one-step';

test('classification sees the end of text, PDF as a file and decoded DOCX content',async()=>{
  const text='Bevezetés. '.repeat(500)+'A kör területe r²π.';
  const parts=await scopeContentParts([
    {name:'long.txt',kind:'text',content:text},
    {name:'source.pdf',kind:'pdf',content:'data:application/pdf;base64,AAAA'},
    {name:'source.docx',kind:'docx',content:'encoded document'},
  ],async encoded=>{assert.equal(encoded,'encoded document');return 'A háromszög területe a·m/2.';});
  assert.deepEqual(parts,[{type:'text',text},{type:'file',file:{filename:'source.pdf',file_data:'data:application/pdf;base64,AAAA'}},{type:'text',text:'A háromszög területe a·m/2.'}]);
  await assert.rejects(scopeContentParts([{name:'empty.docx',kind:'docx',content:'encoded'}],async()=>''),/nem olvasható/);
});

test('manufacturing derives grade from source even when a legacy client supplies a different grade',async()=>{
  const files=[{name:'geometry.txt',kind:'text' as const,content:'T = a·m/2; kör területe T=r²π.'}];
  const result=await inferOneStepScope({files,scope:{subject:'angol',classroom:2}},async received=>{
    assert.deepEqual(received,files);
    return JSON.stringify({subject:'matematika',classroom:7});
  });
  assert.equal(result.ok,true);
  if(result.ok)assert.deepEqual(result.scope,{subject:'matematika',classroom:7});
});
test('failed inference never falls back to an author supplied grade',async()=>{
  const result=await inferOneStepScope({files:[{name:'photo',kind:'image',content:'unreadable'}],scope:{subject:'matek',classroom:4}},async()=>'{"unknown":true}');
  assert.equal(result.ok,false);
});
