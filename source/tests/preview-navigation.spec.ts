import {test, expect} from '@playwright/test';
import {compactFusionFixture} from '../shared/fixtures/lesson-fusion';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Exercise the actual injected browser program without importing/starting the server.
const routeSource = ts.createSourceFile('routes.ts', readFileSync(new URL('../server/routes.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
function browserHelper(name: string): string {
  let html: string | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(routeSource) === name && node.initializer && ts.isNoSubstitutionTemplateLiteral(node.initializer)) html = node.initializer.text;
    ts.forEachChild(node, visit);
  }
  visit(routeSource);
  if (!html) throw new Error(`Missing production browser helper: ${name}`);
  return html;
}
const storageHtml = `<!doctype html><html lang="hu"><head>${browserHelper('sandboxLocalStorageFix')}</head><body style="margin:0"><p id="storage"></p><script>localStorage.setItem('probe','ok');document.getElementById('storage').textContent=localStorage.getItem('probe');document.getElementById('storage').dataset.fallback=String(window.__sandboxLocalStorageFixApplied);</script></body></html>`;

test.use({serviceWorkers:'block'});
for (const [width,height] of [[390,844],[844,390],[1440,900]]) {
  test(`published preview tabs remain unobscured at ${width}x${height}`, async ({page}) => {
    await page.setViewportSize({width,height});
    await page.route('**/api/**', route => {
      const path=new URL(route.request().url()).pathname;
      if(path==='/api/config') return route.fulfill({json:{baseUrl:'http://localhost',materialOrigin:''}});
      if(path==='/api/html-files/preview-fixture') return route.fulfill({json:{id:'preview-fixture',title:'Háromszög',contentType:'lesson'}});
      if(path==='/api/lessons/by-file/preview-fixture') return route.fulfill({json:{lessonId:'preview-lesson-fixture',version:1,lesson:compactFusionFixture()}});
      return route.fulfill({status:401,json:{message:'Anonymous fixture'}});
    });
    await page.goto('/preview/preview-fixture');
    for (const name of ['Tananyag','Módszerek','Feladatok','Kvíz']) {
      await page.getByRole('tab',{name,exact:true}).click();
      await expect.poll(()=>page.getByRole('tab').evaluateAll(tabs=>tabs.every(tab=>{
        const b=tab.getBoundingClientRect();
        const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
        return b.y>=0 && b.bottom<=innerHeight && hit!==null && tab.contains(hit);
      }))).toBe(true);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    }
    const submit=await page.getByRole('button',{name:'Kvíz kiértékelése',exact:true}).boundingBox();
    expect(submit).not.toBeNull();
    expect(submit!.y).toBeGreaterThanOrEqual(0);
    expect(submit!.y+submit!.height).toBeLessThanOrEqual(height);
    await page.screenshot({path:`test-results/preview-tabs-${width}.png`});
  });
}

test('preview reload fetches fresh lesson data and new tab opens the lesson', async ({page}) => {
  let reads=0;
  await page.route('**/api/**', route => {
    const url=new URL(route.request().url());
    if(url.pathname==='/api/config') return route.fulfill({json:{baseUrl:url.origin,materialOrigin:'https://material.example'}});
    if(url.pathname==='/api/html-files/preview-fixture') return route.fulfill({json:{id:'preview-fixture',title:'Háromszög',contentType:'lesson'}});
    if(url.pathname==='/api/lessons/by-file/preview-fixture') {
      const lesson=compactFusionFixture();lesson.title=++reads===1?'Eredeti tanítás':'Frissített tanítás';
      return route.fulfill({json:{lessonId:'preview-lesson-fixture',version:reads,lesson}});
    }
    return route.fulfill({status:401,json:{message:'Anonymous fixture'}});
  });
  await page.goto('/preview/preview-fixture');
  await expect(page.getByRole('heading',{name:'Eredeti tanítás',exact:true})).toBeVisible();
  await page.getByTestId('button-reload-iframe').click();
  await expect(page.getByRole('heading',{name:'Frissített tanítás',exact:true})).toBeVisible();
  const popupPromise=page.waitForEvent('popup');
  await page.getByTestId('button-open-new-tab').click();
  const popup=await popupPromise;
  await expect(popup).toHaveURL(new URL('/preview/preview-fixture',page.url()).href);
  await popup.close();
});

for (const [width,height] of [[390,844],[844,390],[1440,900]]) {
  test(`HTML preview fills the remaining viewport without outer scroll at ${width}x${height}`, async ({page}) => {
    await page.setViewportSize({width,height});
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/config') return route.fulfill({json:{baseUrl:new URL(route.request().url()).origin,materialOrigin:''}});
      if (path === '/api/html-files/preview-html') return route.fulfill({json:{id:'preview-html',title:'HTML lecke',contentType:'html'}});
      return route.fulfill({status:401,json:{message:'Anonymous fixture'}});
    });
    await page.route('**/dev/preview-html', route => route.fulfill({contentType:'text/html',body:storageHtml}));
    await page.goto('/preview/preview-html');
    const iframe = page.getByTestId('iframe-preview');
    await expect(page.frameLocator('[data-testid="iframe-preview"]').locator('#storage')).toHaveText('ok');
    await expect(page.frameLocator('[data-testid="iframe-preview"]').locator('#storage')).toHaveAttribute('data-fallback','false');
    const box = await iframe.boundingBox();
    const toolbar = await page.getByTestId('button-back').locator('..').locator('..').boundingBox();
    expect(box).not.toBeNull(); expect(toolbar).not.toBeNull();
    expect(Math.abs(box!.y - (toolbar!.y + toolbar!.height))).toBeLessThanOrEqual(1);
    expect(Math.abs(box!.y + box!.height - height)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if (width === 390) {
      // Simulate mobile browser chrome: large viewport (vh) exceeds dynamic viewport.
      await page.evaluate(() => {
        function resize(rules: CSSRuleList) {
          for (const rule of rules) {
            if ('cssRules' in rule) resize((rule as CSSGroupingRule).cssRules);
            if (rule instanceof CSSStyleRule) for (const property of ['height','min-height']) {
              if (rule.style.getPropertyValue(property).trim() === '100vh') rule.style.setProperty(property,'calc(100dvh + 120px)');
            }
          }
        }
        for (const sheet of document.styleSheets) { try { resize(sheet.cssRules); } catch { /* Unrelated cross-origin fonts. */ } }
      });
      expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
    }
    if (width === 844) {
      // Simulate an engine ignoring dvh declarations; the vh fallback must fill the screen.
      await page.evaluate(() => {
        function legacy(rules: CSSRuleList) {
          for (const rule of rules) {
            if ('cssRules' in rule) legacy((rule as CSSGroupingRule).cssRules);
            if (rule instanceof CSSStyleRule) for (const property of ['height','min-height']) {
              if (rule.style.getPropertyValue(property).includes('dvh')) rule.style.removeProperty(property);
            }
          }
        }
        for (const sheet of document.styleSheets) { try { legacy(sheet.cssRules); } catch { /* Unrelated cross-origin fonts. */ } }
      });
      const fallbackBox = await iframe.boundingBox();
      expect(Math.abs(fallbackBox!.y + fallbackBox!.height - height)).toBeLessThanOrEqual(1);
    }
    expect(errors).toEqual([]);
    await page.screenshot({path:`test-results/html-preview-${width}.png`});
  });
}

test('opaque sandbox storage fallback initializes lesson scripts without a server logger', async ({page}) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<iframe title="Opaque material" sandbox="allow-scripts"></iframe>');
  await page.locator('iframe').evaluate((el, html) => { (el as HTMLIFrameElement).srcdoc = html; }, storageHtml);
  const storage = page.frameLocator('iframe').locator('#storage');
  await expect(storage).toHaveText('ok');
  await expect(storage).toHaveAttribute('data-fallback','true');
  expect(errors).toEqual([]);
});

test('dictation permission denial logs through the browser without an unhandled error', async ({page}) => {
  const errors: string[] = []; const warnings: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'warning') warnings.push(m.text()); });
  await page.setContent(`<html><head><script>window.SpeechRecognition=function(){this.start=function(){this.onerror({error:'not-allowed'});this.onend();};};</script></head><body><textarea></textarea>${browserHelper('speechToTextScript')}</body></html>`);
  await page.getByRole('button',{name:'Diktálás (beszéd szöveggé)',exact:true}).click();
  await expect(page.locator('textarea')).toHaveAttribute('data-dictation-error','not-allowed');
  expect(warnings.some(m=>m.includes('Mikrofon engedély megtagadva'))).toBe(true);
  expect(errors).toEqual([]);
});

test('dictation initialization failure is reported without throwing a second logger error', async ({page}) => {
  const errors: string[] = []; const logs: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
  await page.setContent(`<html><head><script>Object.defineProperty(window,'SpeechRecognition',{get:function(){throw new Error('Initialization probe');}});</script></head><body><p>A tananyag továbbra is látható.</p>${browserHelper('speechToTextScript')}</body></html>`);
  await expect(page.getByText('A tananyag továbbra is látható.')).toBeVisible();
  expect(logs.some(m=>m.includes('Inicializálási hiba'))).toBe(true);
  expect(errors).toEqual([]);
});
