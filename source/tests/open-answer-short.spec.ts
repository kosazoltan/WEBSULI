import { expect, test, type Page } from "@playwright/test";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { gradeTasks } from "../shared/lesson-result-email";
import { shortAndIncompleteReason, shortButCompleteReason } from "../shared/lesson-experience-score";

/**
 * Spec 2026-11-17-nyilt-feladat-rovid-valasz (E7) — valódi render, vendég tanuló: a tömör, de tartalmilag teljes válasz FÉL pontot kap a
 * biztató üzenettel (ponttal és pont nélkül is), a kifejtett válasz teljes pontot, a hiányos rövid válasz nullát a pontos üzenettel; a
 * szerveroldali pontozó (a levél forrása) a beküldött válaszokból ugyanazt számolja. A döntőbíró végpontja itt nem emel.
 */
test.use({ serviceWorkers: "block" });

const SAMPLE = "A terület az alap és a magasság szorzatának a fele, ezt érdemes megjegyezni.";
function lesson() {
  const base = fusionFixture();
  const experience = base.experience!;
  return { ...base, experience: { ...experience, tasks: experience.tasks.map(t => ({ ...t, required: [["alap"], ["magasság"], ["fele"]], bonus: [], minWords: 8, needsSentence: false, sample: SAMPLE })) } };
}

async function mock(page: Page) {
  const posts: Array<Record<string, unknown>> = [];
  await page.route("**/api/**", async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/lessons/lesson-s/results" && req.method() === "POST") { posts.push(req.postDataJSON()); return route.fulfill({ status: 202, json: { queued: true } }); }
    if (path === "/api/lessons/arbiter") return route.fulfill({ status: 503, json: { message: "A döntőbíró a tesztben nem érhető el." } });
    if (path === "/api/auth/user") return route.fulfill({ json: null });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "test" } });
    if (path === "/api/html-files/short-fixture") return route.fulfill({ json: { id: "short-fixture", title: "Lecke", contentType: "lesson", classroom: 7 } });
    if (path === "/api/lessons/by-file/short-fixture") return route.fulfill({ json: { lessonId: "lesson-s", version: 1, lesson: lesson() } });
    if (path.startsWith("/api/design-assets/")) return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: [] });
  });
  return posts;
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`tömör helyes válasz: fél pont + biztató üzenet; kifejtve teljes pont; a levél pontja egyezik (${viewport.width} px)`, async ({ page }) => {
    const posts = await mock(page);
    await page.setViewportSize(viewport);
    await page.goto("/preview/short-fixture");
    await page.getByRole("tab", { name: "Feladatok", exact: true }).click();
    const tasks = page.locator("[data-task-id]");
    await expect(tasks).toHaveCount(15);
    const answers = ["alap, magasság, fele", "Alap, magasság, fele.", SAMPLE, "alap", "nem tudom."];
    for (let i = 0; i < answers.length; i++) await tasks.nth(i).locator("textarea").fill(answers[i]);
    await page.getByRole("button", { name: "Feladatok kiértékelése" }).click();
    await page.getByRole("button", { name: "Lezárom a kihagyásokkal", exact: true }).click();

    const verdict = (i: number) => tasks.nth(i).locator(".fusion-verdict");
    for (const i of [0, 1]) {
      await expect(verdict(i), answers[i]).toHaveAttribute("data-state", "partial");
      await expect(verdict(i).locator("strong")).toHaveText("Részben jó · 0.5 pont");
      await expect(verdict(i).locator("p").first()).toHaveText(shortButCompleteReason(8));
    }
    await expect(verdict(2)).toHaveAttribute("data-state", "ok");
    await expect(verdict(2).locator("strong")).toHaveText("Elfogadva · 1 pont");
    for (const i of [3, 4]) {
      await expect(verdict(i), answers[i]).toHaveAttribute("data-state", "fail");
      await expect(verdict(i).locator("strong")).toHaveText("Hiányos · 0 pont");
      await expect(verdict(i).locator("p").first()).toHaveText(shortAndIncompleteReason(8));
    }
    // Az üzenet nem lóg ki a kártyából (keskeny nézetben sem).
    const box = await verdict(0).boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= viewport.width, "a visszajelzés a nézeten belül van").toBe(true);

    // A levél forrása: a szerver a beküldött válaszokat ugyanazzal a közös pontozóval pontozza — a képernyővel egyező eredmény.
    await expect.poll(() => posts.filter(p => p.kind === "tasks").length, { timeout: 60_000 }).toBe(1);
    const sent = posts.find(p => p.kind === "tasks")!.answers as Record<string, string>;
    const ids = await tasks.evaluateAll(nodes => nodes.map(node => node.getAttribute("data-task-id")!));
    const graded = gradeTasks(lesson().experience.tasks, sent);
    const byId = new Map(graded.rows.map(r => [r.taskId, r]));
    expect(ids.slice(0, 5).map(id => [byId.get(id)!.state, byId.get(id)!.score])).toEqual([["partial", 0.5], ["partial", 0.5], ["ok", 1], ["fail", 0], ["fail", 0]]);
    expect(graded.summary.points).toBe(2);
  });
}
