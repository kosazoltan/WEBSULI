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
    :{phase:"error",error:'A(z) "animator" lépés modellhívása hibára futott: a szolgáltató hibát jelzett ([OpenAI] 500)',detail:null,mapId:"plant",jobId:"job-7",lessonId:"draft",draft:{teachingSections:12,savedBankPackets:3},
      // Spec 2026-10-15-kapu-reszleges-javitas-folytatas (D3, dokumentált szerződésváltozás): a szerver a folytathatóságot és a megállás lépését is megadja.
      resumable:true,stoppedAt:"animator"}}));
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

// Spec 2026-10-15-kapu-reszleges-javitas-folytatas (D3, D5; élő: a gomb megjelent, a szerver 409-cel elutasította).
test("nem folytatható megállásnál nincs Folytatás gomb, van magyarázat, és a megállás szakasza „Megállt”",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.addInitScript(()=>sessionStorage.setItem("websuli.studio.oneStepRunId","dead-run"));
  await page.route("**/api/studio/maps",route=>route.fulfill({json:{maps:[]}}));
  await page.route("**/api/studio/lessons/one-step/dead-run",route=>route.fulfill({json:{phase:"error",error:"A fúziós módszer kapuja elutasította a leckét: x",detail:null,mapId:"plant",jobId:"job-9",lessonId:"draft",
    draft:{teachingSections:12,savedBankPackets:27},resumable:false,stoppedAt:"gate"}}));
  await page.goto("/__studio-panel-probe");
  await expect(page.getByTestId("one-step-draft")).toContainText("nem folytatható");
  await expect(page.getByTestId("one-step-resume")).toHaveCount(0);
  await expect(page.getByTestId("one-step-review-source")).toBeVisible();
  const stages=page.getByTestId("creation-progress").locator("li");
  await expect(stages.nth(0)).toHaveAttribute("data-state","done");
  await expect(stages.nth(1)).toHaveAttribute("data-state","done");
  await expect(stages.nth(2)).toHaveAttribute("data-state","error");
  for (const size of [{width:360,height:800},{width:1280,height:900}]) {
    await page.setViewportSize(size);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({path:`tests/screenshots/generation-not-resumable-${size.width}.png`,fullPage:true});
  }
  expect(errors).toEqual([]);
});

// Spec 2026-10-15-folytatas-szoveg (tulajdonosi képernyőkép, job 416ad01d): a szöveg a folytatás fajtáját mondja, nem általános ígéretet.
test("bank-újraépítő folytatásnál a szöveg az újraépítést mondja, a gomb látszik",async({page})=>{
  await page.addInitScript(()=>sessionStorage.setItem("websuli.studio.oneStepRunId","rebuild-run"));
  await page.route("**/api/studio/maps",route=>route.fulfill({json:{maps:[]}}));
  await page.route("**/api/studio/lessons/one-step/rebuild-run",route=>route.fulfill({json:{phase:"error",error:"Hibás banktétel maradt a limiten, és a kivétel után a bank nem felelne meg — nem publikálható: x",detail:null,mapId:"plant",jobId:"job-416",lessonId:"draft",
    draft:{teachingSections:12,savedBankPackets:27},resumable:true,stoppedAt:"gate",resumeKind:"rebuild"}}));
  await page.goto("/__studio-panel-probe");
  await expect(page.getByTestId("one-step-draft")).toContainText("a gyakorlóbankot új tartalékkal újraépíti");
  await expect(page.getByTestId("one-step-draft")).not.toContainText("a kész részeket nem gyártja újra");
  await expect(page.getByTestId("one-step-resume")).toBeVisible();
  await page.setViewportSize({width:360,height:800});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:"tests/screenshots/generation-rebuild-360.png",fullPage:true});
});

// Elakadás-vezérlő V1 (docs/specs/2026-10-15-elakadas-vezerlo.md): a felület kiírja a program következő lépését.
test("megállt gyártásnál a program következő lépése látható",async({page})=>{
  await page.addInitScript(()=>sessionStorage.setItem("websuli.studio.oneStepRunId","next-run"));
  await page.route("**/api/studio/maps",route=>route.fulfill({json:{maps:[]}}));
  await page.route("**/api/studio/lessons/one-step/next-run",route=>route.fulfill({json:{phase:"error",error:"Hibás banktétel maradt a limiten: x",detail:null,mapId:"plant",jobId:"job-1",lessonId:"draft",
    draft:{teachingSections:12,savedBankPackets:13},resumable:true,stoppedAt:"gate",nextRecovery:{strategy:"rebuild-targeted",reason:"csak a hibás feladatokat tartalmazó fejezetek gyakorlóbankja épül újra, a többi megmarad"}}}));
  await page.goto("/__studio-panel-probe");
  await expect(page.getByTestId("one-step-next-recovery")).toContainText("A program következő lépése: csak a hibás feladatokat tartalmazó fejezetek gyakorlóbankja épül újra");
  await page.setViewportSize({width:360,height:800});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
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

// docs/specs/2026-10-15-hiba-gombok.md (tulajdonosi javaslat): megszakadt piszkozatnál három külön döntés — soha nem kezd újra észrevétlenül.
test("megszakadt piszkozatnál három külön gomb: folytatás, újragyártás, új tananyag",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.addInitScript(()=>{ if(!sessionStorage.getItem("websuli.studio.oneStepRunId")) sessionStorage.setItem("websuli.studio.oneStepRunId","draft-run"); });
  const bodies:Array<Record<string,unknown>>=[];
  let resumed=0;
  await page.route("**/api/csrf-token",route=>route.fulfill({json:{csrfToken:"test"}}));
  await page.route("**/api/studio/maps",route=>route.fulfill({json:{maps:[]}}));
  await page.route("**/api/studio/lessons/one-step",route=>{bodies.push(route.request().postDataJSON());return route.fulfill({status:202,json:{runId:"remake-run"}});});
  await page.route("**/api/studio/lessons/one-step/remake-run",route=>route.fulfill({json:{phase:"extract",error:null,detail:"Forrás feldolgozása",mapId:"plant",lessonId:null}}));
  await page.route("**/api/studio/jobs/job-old/resume",route=>{resumed++;return route.fulfill({status:202,json:{jobId:"job-old"}});});
  await page.route("**/api/studio/lessons/one-step/old-run",route=>route.fulfill({json:{phase:"animator",error:null,detail:"Folytatás a mentett részeredményekből.",mapId:"plant",jobId:"job-old",lessonId:"draft"}}));
  await page.route("**/api/studio/lessons/one-step/draft-run",route=>route.fulfill({json:{phase:"draft",error:null,detail:"Ebből a forrásból van megszakadt piszkozat — folytatható vagy újragyártható.",mapId:"plant",jobId:"job-old",lessonId:null,
    draft:{teachingSections:9,savedBankPackets:4},resumable:true,stoppedAt:"animator",resumeKind:"restart",draftRunId:"old-run"}}));
  await page.goto("/__studio-panel-probe");
  await expect(page.getByTestId("one-step-progress")).toContainText("Ebből a forrásból van megszakadt piszkozat");
  await expect(page.getByTestId("one-step-draft")).toContainText("9 fejezetnyi tananyag, 4 kész gyakorlócsomag");
  await page.getByTestId("extract-file-input").setInputFiles({name:"plants.txt",mimeType:"text/plain",buffer:Buffer.from("A szár szállítja a tápanyagokat.")});
  for (const id of ["one-step-resume","one-step-remake","one-step-new"]) await expect(page.getByTestId(id)).toBeVisible();
  for (const size of [{width:390,height:844},{width:1366,height:900}]) {
    await page.setViewportSize(size);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    for (const id of ["one-step-resume","one-step-remake","one-step-new"])
      expect(await page.getByTestId(id).evaluate(el=>el.scrollWidth>el.clientWidth+1),id).toBe(false);
    await page.screenshot({path:`tests/screenshots/generation-draft-choice-${size.width}.png`,fullPage:true});
  }
  // Újragyártás: ugyanaz a kérés, kifejezett forceNew jelzővel.
  await page.getByTestId("one-step-remake").click();
  await expect.poll(()=>bodies.length).toBe(1);
  expect(bodies[0].forceNew).toBe(true);
  await expect(page.getByTestId("one-step-progress")).toContainText("Forrás feldolgozása");
  // Folytatás: a piszkozat jobja folytatódik, és a felület a piszkozat saját futását követi.
  await page.evaluate(()=>sessionStorage.setItem("websuli.studio.oneStepRunId","draft-run"));
  await page.reload();
  await page.getByTestId("one-step-resume").click();
  await expect(page.getByTestId("one-step-progress")).toContainText("Tananyag készül");
  expect(resumed).toBe(1);
  expect(await page.evaluate(()=>sessionStorage.getItem("websuli.studio.oneStepRunId"))).toBe("old-run");
  // Új tananyag: az űrlap üres, nincs futás.
  await page.evaluate(()=>sessionStorage.setItem("websuli.studio.oneStepRunId","draft-run"));
  await page.reload();
  await page.getByTestId("one-step-new").click();
  await expect(page.getByTestId("one-step-progress")).toHaveCount(0);
  expect(await page.evaluate(()=>sessionStorage.getItem("websuli.studio.oneStepRunId"))).toBeNull();
  expect(errors).toEqual([]);
});
