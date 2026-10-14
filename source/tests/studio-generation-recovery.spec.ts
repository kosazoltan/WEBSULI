import { expect, test } from "@playwright/test";
// Route fixtures must own requests on production builds too, including after reload.
test.use({ serviceWorkers: "block" });

test("a megállt feltöltés visszatérés után is látható és a konkrét forrás megnyitható", async ({ page }) => {
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/api/csrf-token",route=>route.fulfill({json:{csrfToken:"test"}}));
  await page.route("**/api/studio/maps",route=>route.fulfill({json:{maps:[]}}));
  await page.route("**/api/studio/lessons/one-step",route=>route.fulfill({status:202,json:{runId:"run-plant"}}));
  await page.route("**/api/studio/lessons/one-step/run-plant",route=>route.fulfill({json:{phase:"parked",detail:"Forrásellenőrzés szükséges: 14 fogalom átnézésre vár.",error:null,mapId:"plant",lessonId:null}}));
  await page.route("**/api/studio/maps/plant",route=>route.fulfill({json:{map:{id:"plant",title:"Virágos növények",status:"draft",subject:"Természetismeret",classroom:5,sourceFiles:[{name:"plants.txt",kind:"text"}]},concepts:[],approval:{ok:false,reason:"Forrásellenőrzés szükséges"}}}));
  await page.goto("/__studio-panel-probe");
  await page.getByTestId("extract-file-input").setInputFiles({name:"plants.txt",mimeType:"text/plain",buffer:Buffer.from("A szár szállítja a tápanyagokat.")});
  await page.getByTestId("one-step-submit").click();
  await expect(page.getByTestId("one-step-progress")).toContainText("Az új tananyag még nem készült el");
  await expect(page.getByTestId("extract-file-list")).toContainText("plants.txt");
  await page.reload();
  await expect(page.getByTestId("one-step-progress")).toContainText("14 fogalom");
  await page.getByTestId("studio-advanced-toggle").click();
  await expect(page.getByTestId("studio-advanced-body")).toBeVisible();
  await expect(page.getByTestId("one-step-progress")).toHaveCount(1);
  expect(await page.evaluate(()=>sessionStorage.getItem("websuli.studio.oneStepRunId"))).toBe("run-plant");
  await page.reload();
  await expect(page.getByTestId("one-step-progress")).toContainText("14 fogalom");
  for (const size of [{width:360,height:800},{width:844,height:390},{width:1280,height:900}]) {
    await page.setViewportSize(size);
    await expect(page.getByTestId("one-step-review-source")).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const button=page.getByTestId("one-step-review-source");
    expect(await button.evaluate(el=>el.scrollWidth>el.clientWidth+1)).toBe(false);
    await page.screenshot({path:`tests/screenshots/generation-parked-${size.width}.png`,fullPage:true});
  }
  await page.getByTestId("one-step-review-source").click();
  await expect(page.getByTestId("one-step-source-review")).toContainText("Virágos növények");
  expect(errors).toEqual([]);
});

test("a hibával leállt futás meglévő forrásjegyzéke is megnyitható",async({page})=>{
  await page.addInitScript(()=>sessionStorage.setItem("websuli.studio.oneStepRunId","error-run"));
  await page.route("**/api/studio/lessons/one-step/error-run",route=>route.fulfill({json:{phase:"error",error:"A szerzői lépés hibát jelzett",detail:null,mapId:"plant",lessonId:null,draft:{teachingSections:12,savedBankPackets:0}}}));
  await page.goto("/__studio-panel-probe");
  await expect(page.getByTestId("one-step-progress")).toContainText("A szerzői lépés hibát jelzett");
  // Review #215: a nulla kész csomag is látszik (az éles 416ad01d futás állapota).
  await expect(page.getByTestId("one-step-draft")).toContainText("12 fejezetnyi tananyag, 0 kész gyakorlócsomag");
  await expect(page.getByTestId("one-step-review-source")).toBeVisible();
});

// Spec 2026-10-14-folytatas-mentett-reszekbol: a megállt gyártás a mentett részekből folytatható, nem kell elölről kezdeni.
test("a hibával megállt gyártás a mentett részekből folytatható, egyetlen kéréssel",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.addInitScript(()=>sessionStorage.setItem("websuli.studio.oneStepRunId","stopped-run"));
  let resumed=0;
  await page.route("**/api/csrf-token",route=>route.fulfill({json:{csrfToken:"test"}}));
  await page.route("**/api/studio/maps",route=>route.fulfill({json:{maps:[]}}));
  await page.route("**/api/studio/jobs/job-7/resume",async route=>{resumed++;await new Promise(r=>setTimeout(r,300));await route.fulfill({status:202,json:{jobId:"job-7"}});});
  await page.route("**/api/studio/lessons/one-step/stopped-run",route=>route.fulfill({json:resumed
    ?{phase:"animator",error:null,detail:"Folytatás a mentett részeredményekből.",mapId:"plant",jobId:"job-7",lessonId:"draft"}
    :{phase:"error",error:'A(z) "animator" lépés modellhívása hibára futott: a szolgáltató hibát jelzett ([OpenAI] 500)',detail:null,mapId:"plant",jobId:"job-7",lessonId:"draft",draft:{teachingSections:12,savedBankPackets:3}}}));
  await page.goto("/__studio-panel-probe");
  await expect(page.getByTestId("one-step-progress")).toContainText("A gyártás megállt hibával");
  await expect(page.getByTestId("one-step-draft")).toContainText("Mentett piszkozat: 12 fejezetnyi tananyag, 3 kész gyakorlócsomag");
  const button=page.getByTestId("one-step-resume");
  for (const size of [{width:360,height:800},{width:844,height:390},{width:1280,height:900}]) {
    await page.setViewportSize(size);
    await expect(button).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    expect(await button.evaluate(el=>el.scrollWidth>el.clientWidth+1)).toBe(false);
    await page.screenshot({path:`tests/screenshots/generation-resume-${size.width}.png`,fullPage:true});
  }
  await button.click();
  await button.click({force:true}).catch(()=>undefined);
  await expect(page.getByTestId("one-step-progress")).toContainText("Tananyag készül");
  expect(resumed).toBe(1);
  await expect(page.getByTestId("one-step-resume")).toHaveCount(0);
  await expect(page.getByTestId("one-step-draft")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("csak a közzétett lecke kész; hálózati hiba újraellenőrizhető, újratöltés után megnyitható",async({page})=>{
  await page.addInitScript(()=>sessionStorage.setItem("websuli.studio.oneStepRunId","finished-run"));
  let published=false;
  await page.route("**/api/studio/maps",route=>route.fulfill({json:{maps:[]}}));
  await page.route("**/api/studio/lessons/one-step/finished-run",route=>route.fulfill({json:{phase:"done",error:null,detail:"Elkészült",mapId:"plant",lessonId:"lesson",htmlFileId:published?"new-plant":null}}));
  await page.goto("/__studio-panel-probe");
  await expect(page.getByTestId("one-step-status-error")).toContainText("nincs elérhető, közzétett tananyag");
  await expect(page.getByTestId("one-step-open-lesson")).toHaveCount(0);
  published=true;
  await page.getByRole("button",{name:"Állapot újraellenőrzése"}).click();
  await expect(page.getByTestId("one-step-open-lesson")).toHaveAttribute("href","/preview/new-plant");
  await page.reload();
  await expect(page.getByTestId("one-step-open-lesson")).toHaveAttribute("href","/preview/new-plant");
});
