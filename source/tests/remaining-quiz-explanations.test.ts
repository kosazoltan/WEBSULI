import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
import { QUESTION_BANK, materialToQuestions, shuffleOptions, pickQuestion } from '../client/src/lib/tornado/questions';
import { buildFeedback } from '../client/src/game-engine/feedback';

for (const [file,count] of [['BlockCraftQuiz',213],['SpaceAsteroidQuiz',38]] as const) {
  test(`${file}: every literal question has a substantive explanation`,()=>{
    const source=fs.readFileSync(new URL(`../client/src/pages/${file}.tsx`,import.meta.url),'utf8');
    const ast=ts.createSourceFile(file+'.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    let found=0;
    function visit(n:ts.Node) {
      if(ts.isObjectLiteralExpression(n)) {
        const props=new Map(n.properties.filter(ts.isPropertyAssignment).map(p=>[p.name.getText(ast),p.initializer]));
        const prompt=props.get('prompt');
        if(prompt&&ts.isStringLiteral(prompt)&&props.has('correctIndex')) {
          found++;
          const explanation=props.get('explanation');
          assert.ok(explanation&&ts.isStringLiteral(explanation),prompt.text);
          assert.ok(explanation.text.length>=30&&explanation.text.length<=300,prompt.text);
          assert.doesNotMatch(explanation.text,/^(TODO|A helyes válasz:)/i);
        }
      }
      ts.forEachChild(n,visit);
    }
    visit(ast);assert.equal(found,count);
  });
}
test('Tornado: all 120 bank items preserve explanations through shuffle and feedback',()=>{
  assert.equal(QUESTION_BANK.length,120);
  for(const q of QUESTION_BANK){
    assert.ok(q.explanation&&q.explanation.length>=30,q.id);
    const shuffled=shuffleOptions(q,()=>0.3);
    const feedback=buildFeedback({quiz:{...shuffled,explanation:shuffled.explanation??undefined},chosenIndex:(shuffled.correctIndex+1)%4,attempt:1,ageBand:'kid'});
    assert.equal(feedback.why,q.explanation);
  }
});
test('Tornado material explanation reaches feedback, legacy rows remain valid',()=>{
  const row={prompt:'Mennyi 2+3?',options:['4','5','6','7'],correctIndex:1,explanation:'Két almához három almát adunk, így összesen öt almánk lesz.'};
  assert.equal(materialToQuestions([row],7)[0]?.explanation,row.explanation);
  assert.equal(materialToQuestions([{...row,explanation:undefined}],7).length,1);
});
test('Tornado mastery chooses within selected grade and keeps material priority',()=>{
  const easy=pickQuestion({level:1,school:6,mode:'math',adaptiveBand:0.15,rng:()=>0});
  const hard=pickQuestion({level:1,school:6,mode:'math',adaptiveBand:1,rng:()=>0});
  assert.equal(easy.grade,6);assert.equal(hard.grade,6);assert.ok(hard.difficulty>=easy.difficulty);
  const material={...easy,id:'lesson',source:'material' as const};
  assert.equal(pickQuestion({level:1,school:6,mode:'math',adaptiveBand:1,material:[material],rng:()=>0}).id,'lesson');
});
