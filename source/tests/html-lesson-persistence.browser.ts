import { test, expect } from '@playwright/test';
import { compactFusionFixture } from '../shared/fixtures/lesson-fusion';
import { withLessonTypography } from '../shared/lesson-typography';
import { mkdir, readFile } from 'node:fs/promises';
for (const viewport of [{width:320,height:740},{width:844,height:390},{width:1366,height:768}]) {
 test(`HTML scored banks survive reload ${viewport.width}`, async ({page})=>{
  const lesson=compactFusionFixture(); const data={classroom:7,classroomEvidence:'A háromszög területének kiszámítása az alap és magasság alapján.',subject:'matematika',experience:lesson.experience};
  let html=withLessonTypography(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}*{box-sizing:border-box}</style></head><body><section data-lesson-panel="tasks"></section><section data-lesson-panel="quiz"></section><script type="application/json" id="websuli-lesson-data">${JSON.stringify(data)}</script></body></html>`);
  await page.route('**/quiz-proof',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:html}));
  await page.setViewportSize(viewport); await page.goto('/quiz-proof');
  const quiz=page.getByRole('region',{name:'Megőrzött gyakorlókvíz'});
  await expect(quiz.locator('article')).toHaveCount(10);
  const titles=await quiz.locator('h3').allTextContents();
  // Every question must actually be visible in sequence, not merely present in the DOM.
  for (const [regionName, count] of [['Megőrzött gyakorlókvíz',10],['Pontozott szöveges feladatok',5]] as const) {
    const region=page.getByRole('region',{name:regionName});
    const seen=new Set<string>();
    for (let i=0;i<count;i++) {
      await expect(region.locator('article:visible')).toHaveCount(1);
      seen.add(await region.locator('article:visible h3').innerText());
      if (i<count-1) await region.getByRole('button',{name:'Következő kérdés',exact:true}).click();
    }
    expect(seen.size).toBe(count);
    await expect(region.getByRole('button',{name:'Következő kérdés',exact:true})).toBeDisabled();
    await region.getByRole('button',{name:'Összes kérdés áttekintése',exact:true}).click();
    await expect(region.locator('article:visible')).toHaveCount(count);
    await region.getByRole('button',{name:'Egyenként',exact:true}).click();
    for(let i=1;i<count;i++) await region.getByRole('button',{name:'Előző kérdés',exact:true}).click();
  }
  const firstQuestion=titles[0].replace(/^\d+\. /,''); const q=data.experience!.quiz.find(q=>q.question===firstQuestion)!;
  await quiz.locator('article').first().getByRole('button',{name:q.options[q.correctIndex],exact:true}).click();
  await quiz.getByRole('button',{name:'Kiértékelés',exact:true}).click();
  await expect(quiz.getByRole('status')).toHaveCount(0);
  await expect(quiz.getByRole('group',{name:'Hiányos kör lezárása'})).toContainText('9 kérdés');
  await quiz.getByRole('button',{name:'Lezárom a kihagyásokkal',exact:true}).click();
  await expect(quiz.getByRole('status')).toContainText('1 / 10 pont');
  const tasks=page.getByRole('region',{name:'Pontozott szöveges feladatok'});
  const question=await tasks.locator('textarea').first().getAttribute('aria-label');
  await tasks.locator('textarea').first().fill(data.experience!.tasks.find(t=>t.q===question)!.sample);
  await tasks.getByRole('button',{name:'Kiértékelés',exact:true}).click();
  await expect(tasks.getByRole('status')).toHaveCount(0);
  await tasks.getByRole('button',{name:'Folytatom a kitöltést',exact:true}).click();
  await expect(tasks.locator('article:visible')).toHaveCount(1);
  await tasks.getByRole('button',{name:'Kiértékelés',exact:true}).click();
  await tasks.getByRole('button',{name:'Lezárom a kihagyásokkal',exact:true}).click();
  await tasks.getByRole('button',{name:'Előző kérdés',exact:true}).click();
  await expect(tasks.getByRole('status')).toContainText('1 / 5 pont');
  await tasks.locator('article').first().getByText('Mintaválasz',{exact:true}).click();
  const download=page.waitForEvent('download');
  await tasks.getByRole('button',{name:'Eredmény letöltése',exact:true}).click();
  const exported=JSON.parse(await readFile((await (await download).path())!,'utf8'));
  expect(exported.seenSampleIds).toEqual([data.experience!.tasks.find(t=>t.q===question)!.id]);
  await page.reload();
  await expect(quiz.getByRole('status')).toContainText('1 / 10 pont');
  expect(await quiz.locator('h3').allTextContents()).toEqual(titles);
  await expect(tasks.getByRole('status')).toContainText('1 / 5 pont');
  await expect(quiz.locator('article').first().getByRole('button').first()).toBeDisabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for (const control of await quiz.getByRole('button').all()) {
    if (!(await control.isVisible())) continue;
    await control.scrollIntoViewIfNeeded();
    const box=await control.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(await control.evaluate(el=>{ const r=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); })).toBe(true);
  }
  await quiz.scrollIntoViewIfNeeded(); await mkdir('../tmp/closure-browser',{recursive:true});
  await page.screenshot({path:`../tmp/closure-browser/quiz-${viewport.width}.png`});
  await quiz.getByRole('button',{name:'Új kvízkör',exact:true}).click();
  await quiz.getByRole('button',{name:'Mégsem',exact:true}).click(); await expect(quiz.getByRole('status')).toContainText('1 / 10');
  await quiz.getByRole('button',{name:'Új kvízkör',exact:true}).click(); await quiz.getByRole('button',{name:'Új kör indítása',exact:true}).click(); await expect(quiz.getByRole('status')).toHaveCount(0);
  for (const [panel, label] of [[quiz,'Teljes kvízbank · 15 kérdés'],[tasks,'Teljes feladatbank · 15 kérdés']] as const) {
    await panel.getByRole('button',{name:label,exact:true}).click();
    await panel.getByRole('button',{name:'Új kör indítása',exact:true}).click();
    await expect(panel.locator('article')).toHaveCount(15);
    await panel.getByRole('button',{name:'Kiértékelés',exact:true}).click();
    await panel.getByRole('button',{name:'Lezárom a kihagyásokkal',exact:true}).click();
    await expect(panel.getByRole('status')).toContainText('0 / 15 pont');
  }
  await page.reload();
  await expect(quiz.getByRole('status')).toContainText('0 / 15 pont');
  await expect(tasks.getByRole('status')).toContainText('0 / 15 pont');
  const previousData=JSON.stringify(data);
  data.experience!.quiz[0].question='Mi a tanult területképlet műveleti sorrendje?';
  html=html.replace(previousData,JSON.stringify(data));
  await page.reload();
  await expect(quiz.getByRole('status')).toHaveCount(0);
  await expect(tasks.getByRole('status')).toContainText('0 / 15 pont');
  await page.evaluate(()=>{ for (const key of Object.keys(localStorage)) localStorage.setItem(key,'{invalid'); });
  await page.reload();
  await expect(quiz.getByRole('status')).toHaveCount(0);
  await expect(tasks.getByRole('status')).toHaveCount(0);
  await expect(quiz.locator('article')).toHaveCount(10);
  await expect(tasks.locator('article')).toHaveCount(5);
  await page.addInitScript(()=>{ Storage.prototype.setItem=()=>{throw new DOMException('Storage blocked','SecurityError');}; });
  await page.reload();
  await expect(quiz.getByRole('alert')).toContainText('nem engedte a mentést');
  await expect(tasks.getByRole('alert')).toContainText('nem engedte a mentést');
 });
}
