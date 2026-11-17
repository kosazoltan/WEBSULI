import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import ts from 'typescript';
import {VOCAB_EN} from '../client/src/data/vocabBank/vocab-en';

test.use({serviceWorkers:'block'});

test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('websuli.classroomGrade','7');localStorage.setItem('websuli.spaceQuiz.grade','7');});
 await page.route('**/api/**',async route=>{
  const p=new URL(route.request().url()).pathname;
  let data:unknown=[];
  if(p==='/api/auth/user')data={id:'fixture',isAdmin:true,firstName:'Teszt',classroom:7,classrooms:[7]};
  if(p==='/api/studio/maps')data={maps:[]};
  if(p.includes('material-quizzes'))data={items:[],materials:[]};
  if(p.includes('one-step'))data={runId:'fixture-run',phase:'done',htmlFileId:'fixture-published-lesson'};
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
 test.setTimeout(150000);
 await page.setViewportSize({width:390,height:844});
 await page.goto('/games/space-asteroid-quiz');
 await page.getByRole('button',{name:/Indulhat —/}).click();
 const quiz=page.getByRole('dialog',{name:'Mini-teszt',exact:true});
 // Spec 2026-09-29-jatekok-3-12-evfolyam, 3–4. döntés: 3–12. évfolyamon (itt 7.) a kérdés a közös évfolyam-bankból jön,
 // ezért a várt tételek a játék saját bankja ÉS a közös bank fájljai.
 const bankDir=new URL('../client/src/data/gradeQuizBank/',import.meta.url);
 const sources=[new URL('../client/src/pages/SpaceAsteroidQuiz.tsx',import.meta.url),...fs.readdirSync(bankDir).filter(f=>/^grade-\d+\.ts$/.test(f)).map(f=>new URL(f,bankDir))];
 const bank:{prompt:string;wrong:string;explanation:string}[]=[];
 for(const file of sources){
 const ast=ts.createSourceFile('bank.tsx',fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
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
 }
 expect(bank.length).toBeGreaterThan(900);
 // SPEC-VÁLTOZÁS 2026-11-15 (docs/specs/2026-11-15-jatekok-mobil-szobank.md 4.3–4.4, A8): az angol kérdés-hely a
 // központi szóbankból jön (generált prompt, `vocab:<bejegyzés>:<típus>` azonosító), ezért az első kérdés ~20%-os
 // eséllyel nem a fenti forrásokból való (review #434). A mérce nem lazul: MINDKÉT esetet kötelezően ellenőrizzük —
 // (1) kézi / évfolyam-banki kérdés: a magyarázat a bank szövege; (2) szóbankos kérdés: a magyarázat megnevezi a helyes
 // választ és a bejegyzés term = hu párját (a generátor sablonja). A 7. évfolyam 1-es sávja 30 tétel, köztük 6 angol:
 // rossz válaszokkal továbblépve legfeljebb 30 kérdésen belül biztosan jön szóbankos kérdés (minden kérdezett tétel fogy).
 const vocabById=new Map(VOCAB_EN.map(e=>[e.id,e]));
 let checkedBank=false,checkedVocab=false;
 for(let i=0;i<40&&!(checkedBank&&checkedVocab);i++){
  await expect(quiz).toBeVisible();
  const id=(await quiz.getAttribute('data-quiz-id'))??'';
  if(id.startsWith('vocab:')){
   const entry=vocabById.get(id.split(':')[1]!);expect(entry,`ismeretlen szóbank-bejegyzés: ${id}`).toBeDefined();
   const correct=(await quiz.locator('[data-correct="true"] > span').last().innerText()).trim();
   await quiz.locator('[data-correct="false"]').first().click();
   await expect(page.getByTestId('quiz-feedback')).toHaveAttribute('data-outcome','wrong');
   const why=page.getByTestId('quiz-feedback-why');
   await expect(why).toContainText(`A helyes válasz: „${correct}”`);
   await expect(why).toContainText(`${entry!.term} = ${entry!.hu}`);
   if(!checkedVocab)await page.screenshot({path:test.info().outputPath('asteroid-explanation-vocab-mobile.png'),fullPage:true});
   checkedVocab=true;
  }else if(!checkedBank){
   const text=await quiz.innerText();const entry=bank.find(q=>text.includes(q.prompt));expect(entry,`a kérdés (${id}) nincs a forrásokban`).toBeDefined();
   await quiz.getByRole('button',{name:entry!.wrong,exact:true}).click();
   await expect(page.getByTestId('quiz-feedback')).toHaveAttribute('data-outcome','wrong');
   await expect(page.getByTestId('quiz-feedback-why')).toContainText(entry!.explanation);
   await page.waitForTimeout(1800);
   await expect(page.getByTestId('quiz-feedback')).toBeVisible();
   await page.screenshot({path:test.info().outputPath('asteroid-explanation-mobile.png'),fullPage:true});
   checkedBank=true;
  }else{
   await quiz.locator('[data-correct="false"]').first().click();
   await expect(page.getByTestId('quiz-feedback')).toHaveAttribute('data-outcome','wrong');
  }
  await page.getByRole('button',{name:'Értem, megyek tovább'}).click();
  await expect(page.getByTestId('quiz-feedback')).toHaveCount(0);
  await expect(quiz).toBeVisible();
 }
 expect(checkedBank,'kézi / évfolyam-banki kérdés magyarázata nem volt ellenőrizve').toBe(true);
 expect(checkedVocab,'szóbankos kérdés magyarázata nem volt ellenőrizve').toBe(true);
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

/*
 * SPEC-VÁLTOZÁS 2026-11-16 (docs/specs/2026-11-16-jatekok-jatekelmeny.md 9.; végrehajtás J1a, D-J1a-8): a Szökőár kérdése
 * nem blokkoló kapukérdés — időtúllépés-kártya nincs. A helyettesítő eset az új (nem lazább) követelményt méri: hibás kapu
 * után nincs `[role="dialog"]`, a helyes kapu legalább 1,8 mp-ig zöld (a lapon belül, képkockánként mérve — C-65), a
 * „Miért?” a magyarázókártyát nyitja (`data-outcome="wrong"`, olvasható magyarázat), alatta a szimuláció ÁLL (a magyarázat
 * olvasása közben áll az óra), bezárás után fut tovább.
 */
test('tsunami wrong gate: no blocking card, the right gate stays green, "Miért?" explains and pauses the game',async({page})=>{
 test.setTimeout(90000);
 await page.setViewportSize({width:390,height:844});
 await page.goto('/games/tsunami-english');
 await page.getByRole('button',{name:/Indítás:/}).click();
 const gate=(sel:string)=>page.locator(`[data-testid="ts-quiz"] .ts-gate${sel}`);
 await expect(gate('')).toHaveCount(3,{timeout:30000});
 await page.evaluate(()=>{
  const w=window as unknown as {__tsReveal?:{start:number|null;end:number|null}};
  w.__tsReveal={start:null,end:null};
  const tick=()=>{
   const on=document.querySelector('[data-testid="ts-quiz"] .ts-gate[data-correct="true"][data-state="correct"]')!==null;
   const r=w.__tsReveal!;
   if(r.start===null&&on)r.start=performance.now();
   if(r.start!==null&&r.end===null&&!on)r.end=performance.now();
   if(r.end===null)requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
 });
 await gate('[data-correct="false"]').first().click();
 await expect(gate('[data-state="wrong"]')).toHaveCount(1);
 expect(await page.locator('[role="dialog"]').count(),'a hibás kapu nem nyit blokkoló kártyát').toBe(0);
 const reveal=()=>page.evaluate(()=>(window as unknown as {__tsReveal:{start:number|null;end:number|null}}).__tsReveal);
 await expect.poll(async()=>(await reveal()).end!==null,{timeout:20000}).toBe(true);
 const r=await reveal();expect(r.end!-r.start!,'a helyes kapu ≥ 1,8 mp-ig zöld').toBeGreaterThanOrEqual(1800);
 await page.getByTestId('play-why').first().click();
 await expect(page.getByTestId('quiz-feedback')).toHaveAttribute('data-outcome','wrong');
 const why=await page.getByTestId('quiz-feedback-why').innerText();expect(why.length).toBeGreaterThan(15);
 const sim=()=>page.evaluate(()=>(window as unknown as {__websuliGame:{probe:()=>{simTime:number}}}).__websuliGame.probe().simTime);
 const s0=await sim();await page.waitForTimeout(1500);
 expect(await sim(),'a magyarázat alatt a játék áll').toBe(s0);
 await expect(page.getByTestId('quiz-feedback-why')).toHaveText(why);
 await page.screenshot({path:test.info().outputPath('tsunami-why-mobile.png'),fullPage:true});
 await page.getByRole('button',{name:'Értem, megyek tovább'}).click();
 await expect(page.getByTestId('quiz-feedback')).toHaveCount(0);
 await expect.poll(sim,{message:'bezárás után fut tovább'}).toBeGreaterThan(s0);
});
