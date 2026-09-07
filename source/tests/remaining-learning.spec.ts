import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import ts from 'typescript';

test.use({serviceWorkers:'block'});

test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('websuli.classroomGrade','7');localStorage.setItem('websuli.spaceQuiz.grade','7');});
 await page.route('**/api/**',async route=>{
  const p=new URL(route.request().url()).pathname;
  let data:unknown=[];
  if(p==='/api/auth/user')data={id:'fixture',isAdmin:true,firstName:'Teszt',classroom:7,classrooms:[7]};
  if(p==='/api/studio/maps')data={maps:[]};
  if(p.includes('material-quizzes'))data={items:[],materials:[]};
  if(p.includes('one-step'))data={runId:'fixture-run',phase:'done'};
  await route.fulfill({json:data});
 });
});

test('source-only manufacturing on mobile and desktop sends no author grade',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [390,1280]){
  await page.setViewportSize({width,height:844});
  await page.goto('/admin?tab=lesson-studio');
  await expect(page.getByTestId('one-step-submit')).toBeVisible();
  await expect(page.getByTestId('extract-classroom')).toHaveCount(0);
  await expect(page.getByTestId('extract-subject')).toHaveCount(0);
  await page.getByTestId('extract-file-input').setInputFiles({name:'source.txt',mimeType:'text/plain',buffer:Buffer.from('T=a·m/2; kör területe πr².')});
  const req=page.waitForRequest(r=>r.method()==='POST'&&r.url().includes('/lessons/one-step'));
  await page.getByTestId('one-step-submit').click();
  const body=(await req).postDataJSON();expect(body.scope).toBeUndefined();expect(body.files).toHaveLength(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:test.info().outputPath(`studio-${width}.png`),fullPage:true});
 }
 expect(errors).toEqual([]);
});

test('asteroid wrong-answer explanation remains readable and dismisses to a new quiz',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/games/space-asteroid-quiz');
 await page.getByRole('button',{name:/Indulhat —/}).click();
 const quiz=page.getByRole('dialog',{name:'Mini-teszt',exact:true});
 const source=fs.readFileSync(new URL('../client/src/pages/SpaceAsteroidQuiz.tsx',import.meta.url),'utf8');
 const ast=ts.createSourceFile('bank.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const bank:{prompt:string;wrong:string;explanation:string}[]=[];
 function walk(n:ts.Node){
  if(ts.isObjectLiteralExpression(n)){
   const props=new Map(n.properties.filter(ts.isPropertyAssignment).map(p=>[p.name.getText(ast),p.initializer]));
   const p=props.get('prompt'),o=props.get('options'),i=props.get('correctIndex'),e=props.get('explanation');
   if(p&&o&&i&&e&&ts.isStringLiteral(p)&&ts.isArrayLiteralExpression(o)&&ts.isNumericLiteral(i)&&ts.isStringLiteral(e)){
    const wrong=o.elements[(Number(i.text)+1)%o.elements.length];if(ts.isStringLiteral(wrong))bank.push({prompt:p.text,wrong:wrong.text,explanation:e.text});
   }
  }
  ts.forEachChild(n,walk);
 }
 walk(ast);
 const text=await quiz.innerText();const entry=bank.find(q=>text.includes(q.prompt));expect(entry).toBeDefined();
 await quiz.getByRole('button',{name:entry!.wrong,exact:true}).click();
 await expect(page.getByTestId('quiz-feedback')).toHaveAttribute('data-outcome','wrong');
 await expect(page.getByTestId('quiz-feedback-why')).toContainText(entry!.explanation);
 await page.waitForTimeout(1800);
 await expect(page.getByTestId('quiz-feedback')).toBeVisible();
 await page.screenshot({path:test.info().outputPath('asteroid-explanation-mobile.png'),fullPage:true});
 await page.getByRole('button',{name:'Értem, megyek tovább'}).click();
 await expect(page.getByTestId('quiz-feedback')).toHaveCount(0);
 await expect(quiz).toBeVisible();
});

test('separate map upload also sends sources without a manual scope',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/admin?tab=knowledge-maps');
 const advanced=page.getByTestId('studio-advanced-body');
 await expect(advanced).toBeVisible();
 await expect(page.getByTestId('extract-classroom')).toHaveCount(0);
 await expect(page.getByTestId('extract-subject')).toHaveCount(0);
 await advanced.getByTestId('extract-file-input').setInputFiles({name:'source.txt',mimeType:'text/plain',buffer:Buffer.from('T = a·m/2.')});
 await page.route('**/api/studio/maps/extract',route=>route.fulfill({status:422,json:{message:'A teszt csak a feltöltött kérés alakját ellenőrzi.'}}));
 const request=page.waitForRequest(r=>r.method()==='POST'&&r.url().includes('/maps/extract'));
 await advanced.getByTestId('extract-submit').click();
 const body=(await request).postDataJSON();expect(body.scope).toBeUndefined();expect(body.files[0].content).toBe('T = a·m/2.');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await page.screenshot({path:test.info().outputPath('map-source-only-mobile.png'),fullPage:true});
});

test('tsunami timeout shows an explanation once and pauses the question clock',async({page})=>{
 test.setTimeout(70000);
 await page.setViewportSize({width:390,height:844});
 await page.goto('/games/tsunami-english');
 await page.getByRole('button',{name:/Indítás:/}).click();
 await expect(page.getByText(/Idő: \d+s/)).toBeVisible({timeout:25000});
 await expect(page.getByTestId('quiz-feedback')).toHaveAttribute('data-outcome','timeout',{timeout:35000});
 const why=await page.getByTestId('quiz-feedback-why').innerText();expect(why.length).toBeGreaterThan(15);
 await page.waitForTimeout(2200);
 await expect(page.getByTestId('quiz-feedback-why')).toHaveText(why);
 await page.screenshot({path:test.info().outputPath('tsunami-timeout-mobile.png'),fullPage:true});
 await page.getByRole('button',{name:'Értem, megyek tovább'}).click();
 await expect(page.getByTestId('quiz-feedback')).toHaveCount(0);
});
