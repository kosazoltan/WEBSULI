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
  await page.route("**/api/studio/lessons/one-step/error-run",route=>route.fulfill({json:{phase:"error",error:"A szerzői lépés hibát jelzett",detail:null,mapId:"plant",lessonId:null}}));
  await page.goto("/__studio-panel-probe");
  await expect(page.getByTestId("one-step-progress")).toContainText("A szerzői lépés hibát jelzett");
  await expect(page.getByTestId("one-step-review-source")).toBeVisible();
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
