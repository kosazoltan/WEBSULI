import {test, expect} from '@playwright/test';
import {compactFusionFixture} from '../shared/fixtures/lesson-fusion';

test.use({serviceWorkers:'block'});
for (const [width,height] of [[390,844],[844,390],[1440,900]]) {
  test(`published preview tabs remain unobscured at ${width}x${height}`, async ({page}) => {
    await page.setViewportSize({width,height});
    await page.route('**/api/**', route => {
      const path=new URL(route.request().url()).pathname;
      if(path==='/api/config') return route.fulfill({json:{baseUrl:'http://localhost',materialOrigin:''}});
      if(path==='/api/html-files/preview-fixture') return route.fulfill({json:{id:'preview-fixture',title:'Háromszög',contentType:'lesson'}});
      if(path==='/api/lessons/by-file/preview-fixture') return route.fulfill({json:{lesson:compactFusionFixture()}});
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
      return route.fulfill({json:{lesson}});
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
