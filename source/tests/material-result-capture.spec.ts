import { test, expect, type Page } from "@playwright/test";
import { MATERIAL_CAPTURE_SCRIPT, rewriteLocationAssignments } from "../server/lib/material-capture";

// Régi (HTML) tananyagok eredménye e-mailben (docs/specs/2026-10-17-regi-anyag-eredmeny.md): a beinjektált szkript valódi böngészőben.
// Az anyagot a /dev/:id kiszolgálással azonos módon alakítjuk (átírás + elfogó a fejben és a törzs végén); a beküldés mockolva.
// Virtuális óra: a kattintás utáni beolvasás 1,5 mp; az új eredményállapot ezután azonnal megy, az összevárás a szerveren
// történik (docs/specs/2026-10-18-regi-anyag-eredmeny-azonnal.md — a keret eltávolításakor a várakozó eredmény elveszett).
type Post = { materialId: string; subject: string; body: string; auto?: boolean };

function serve(stored: string): string {
  const html = rewriteLocationAssignments(stored).html.replace("<head>", "<head>" + MATERIAL_CAPTURE_SCRIPT);
  return html.replace("</body>", MATERIAL_CAPTURE_SCRIPT + "</body>");
}

async function open(page: Page, id: string, stored: string, statusOf: (n: number) => number = () => 200) {
  const posts: Post[] = [];
  const mailtoNavigations: string[] = [];
  page.on("request", r => { if (r.url().startsWith("mailto:")) mailtoNavigations.push(r.url()); });
  await page.route(`http://websuli.test/dev/${id}`, route => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: serve(stored) }));
  await page.route("http://websuli.test/api/material-result", route => {
    posts.push(JSON.parse(route.request().postData() ?? "{}"));
    const status = statusOf(posts.length);
    return route.fulfill({ status, contentType: "application/json", body: status === 200 ? '{"success":true}' : '{"message":"hiba"}' });
  });
  await page.clock.install();
  await page.goto(`http://websuli.test/dev/${id}`);
  await page.clock.runFor(700); // az alapállapot rögzítése (load + 500 ms)
  return { posts, mailtoNavigations };
}

const MAILTO_MATERIAL = `<!DOCTYPE html><html><head><title>Régi kvíz</title></head><body>
<input id="email" type="email" value="tanar@pelda.hu">
<button id="send" onclick="send()">📧 Eredmény elküldése</button>
<a id="link" href="#" onclick="this.href='mailto:?subject=Linkes%20eredmény&body=' + encodeURIComponent('Pont: 3/4')">Levél</a>
<script>
function send() {
  var email = document.getElementById('email').value;
  window.location.href = 'mailto:' + encodeURIComponent(email) +
    '?subject=' + encodeURIComponent('Kvíz eredmény') + '&body=' + encodeURIComponent('Pontszám: 8/10 (80%)');
}
</script></body></html>`;

test("mailto-s régi anyag: a levelező nem nyílik meg, az eredmény a szerverhez megy, a tanuló visszajelzést kap", async ({ page }) => {
  const { posts, mailtoNavigations } = await open(page, "regi-mailto", MAILTO_MATERIAL);
  await page.click("#send");
  await expect(page.getByRole("status")).toContainText("elküldtük");
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ materialId: "regi-mailto", subject: "Kvíz eredmény", body: "Pontszám: 8/10 (80%)", auto: false });
  await page.click("#link");
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1]).toMatchObject({ subject: "Linkes eredmény", body: "Pont: 3/4", auto: false });
  await page.clock.runFor(32_000); // a kattintás utáni beolvasás sem küld (nincs eredménydoboz), és a mailto után nincs második levél
  expect(posts.length).toBe(2);
  expect(mailtoNavigations).toEqual([]);
  expect(page.url()).toBe("http://websuli.test/dev/regi-mailto");
});

const EVAL_MATERIAL = `<!DOCTYPE html><html><head><title>Törtek – 5. osztály</title></head><body>
<label for="nev">Neved</label><input id="nev" type="text" placeholder="Név" value="Kiss Anna">
<div class="task"><p>1. Mit jelent a tört számlálója?</p><textarea id="t1"></textarea></div>
<div class="quiz-head"><p>Pontszám: 0 helyes (0%)</p></div>
<button id="opt" onclick="document.querySelector('.quiz-head p').textContent='Pontszám: 1 helyes (10%)'">B) válasz</button>
<button id="eval" onclick="evaluateQuiz()">✅ Kiértékelés</button>
<div id="quiz-result"><p>Eredmény: még nincs (0%)</p></div>
<script>
function evaluateQuiz() {
  var a = document.getElementById('t1').value;
  var pct = a.length > 60 ? 90 : 80;
  document.getElementById('quiz-result').innerHTML = '<h3>Eredményed</h3><p>' + (pct / 10) + ' / 10 helyes — ' + pct + '% (' + (pct >= 90 ? 'Jeles' : 'Jó') + ')</p>';
}
</script></body></html>`;

test("küldés nélküli régi anyag: a kiértékelés után az új eredmény és a válaszok automatikusan mennek; azonos eredmény nem megy újra", async ({ page }) => {
  const { posts } = await open(page, "regi-kiertekelo", EVAL_MATERIAL);
  await page.click("#opt"); // zaj: élő haladásjelző (százalékkal, de osztályzat nélkül), nem kiértékelő kattintás → nem küld
  await page.clock.runFor(32_000);
  expect(posts).toEqual([]);

  await page.fill("#t1", "A számláló megmutatja, hány részt veszünk.");
  await page.click("#eval");
  await page.clock.runFor(1600);
  await expect.poll(() => posts.length, { timeout: 5000 }).toBe(1); // azonnal megy — a szerver vár össze
  const first = posts[0];
  expect(first.auto).toBe(true);
  expect(first.subject).toBe("Törtek – 5. osztály — eredmény");
  expect(first.body).toContain("80% (Jó)");
  expect(first.body).toContain("Tanuló: Kiss Anna");
  expect(first.body).toContain("Mit jelent a tört számlálója?");
  expect(first.body).toContain("→ A számláló megmutatja, hány részt veszünk.");
  expect(first.body).not.toContain("még nincs");
  expect(first.body).not.toContain("Pontszám: 1 helyes (10%)"); // a már látott haladásjelző nem kerül a levélbe
  await expect(page.getByRole("status")).toHaveCount(0); // az automatikus beküldés csendes

  await page.click("#eval"); // ugyanaz az eredmény
  await page.clock.runFor(32_000);
  expect(posts.length).toBe(1);

  await page.fill("#t1", "A számláló megmutatja, hogy az egészből hány egyenlő részt veszünk figyelembe.");
  await page.click("#eval"); // új eredmény → új levél
  await page.clock.runFor(32_000);
  await expect.poll(() => posts.length, { timeout: 5000 }).toBe(2);
  expect(posts[1].body).toContain("90% (Jeles)");
});

const STEP_MATERIAL = `<!DOCTYPE html><html><head><title>Telling the Time</title></head><body>
<div class="task"><p>1. Hány óra van?</p><textarea id="a1"></textarea><button onclick="checkTask(1)">Ellenőrzés</button></div>
<div class="task"><p>2. Mikor kelsz?</p><textarea id="a2"></textarea><button onclick="checkTask(2)">Ellenőrzés</button></div>
<div class="task"><p>3. Mikor fekszel?</p><textarea id="a3"></textarea><button onclick="checkTask(3)">Ellenőrzés</button></div>
<div id="task-results">Megoldott feladatok: 0 / 3 | Pontosság: 0%</div>
<script>
var done = 0;
function checkTask(n) { done++; document.getElementById('task-results').textContent = 'Megoldott feladatok: ' + done + ' / 3 | Pontosság: ' + Math.round(done / 3 * 100) + '%'; }
</script></body></html>`;

test("feladatonkénti ellenőrzés: minden új állapot azonnal megy (a szerver egy levélbe vonja össze), a legutolsó a teljes képpel; azonos állapot nem ismétlődik", async ({ page }) => {
  const { posts } = await open(page, "regi-lepesenkent", STEP_MATERIAL);
  for (const n of [1, 2, 3]) {
    await page.fill(`#a${n}`, `Válasz ${n}`);
    await page.click(`.task:nth-of-type(${n}) button`);
    await page.clock.runFor(1600);
    await expect.poll(() => posts.length, { timeout: 5000 }).toBe(n);
  }
  expect(posts[0].body).toContain("Megoldott feladatok: 1 / 3");
  expect(posts[2].body).toContain("Megoldott feladatok: 3 / 3 | Pontosság: 100%");
  expect(posts[2].body).not.toContain("1 / 3");
  expect(posts[2].body).toContain("→ Válasz 3");
  expect(new Set(posts.map(p => (p as Post & { clientId?: string }).clientId)).size).toBe(1); // egy kulcs → egy levél a szerveren

  await page.click("#a1"); // nem változott semmi → nem megy újra
  await page.clock.runFor(32_000);
  expect(posts.length).toBe(3);

  // új eredmény, majd a tanuló 1,5 mp-en belül elhagyja az oldalt → a függő beolvasás lefut, és azonnal küld
  await page.evaluate(() => { (window as unknown as { checkTask: (n: number) => void }).checkTask(4); });
  await page.click(".task:nth-of-type(1) button");
  await page.clock.runFor(200);
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect.poll(() => posts.length, { timeout: 5000 }).toBe(4);
  expect(posts[3].body).toContain("Megoldott feladatok: 5 / 3");
});

// A tulajdonosi jelzés (2026-10-18 17:29) esete: a kiértékelés után a tanuló azonnal visszalép a listára, a szülőoldal eltávolítja
// a keretet — se pagehide, se unload nem fut. Review #300: valódi szülőoldal + iframe, a törlés az 1,5 mp-es beolvasáson belül.
test("kiértékelés után azonnal a szülőoldal eltávolítja a keretet: az eredmény ekkorra már elindult, és megérkezik", async ({ page }) => {
  const posts: Post[] = [];
  await page.route("http://lista.test/", route => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8",
    body: '<!DOCTYPE html><html><body><h1>Tananyagok</h1><iframe id="f" src="http://websuli.test/dev/regi-visszalepes" style="width:100%;height:600px"></iframe></body></html>' }));
  await page.route("http://websuli.test/dev/regi-visszalepes", route => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: serve(EVAL_MATERIAL) }));
  await page.route("http://websuli.test/api/material-result", route => { posts.push(JSON.parse(route.request().postData() ?? "{}")); return route.fulfill({ status: 202, contentType: "application/json", body: '{"success":true,"queued":true}' }); });
  // valós idő (nem virtuális óra): az eltávolított keret időzítőit a virtuális óra tovább futtatná, a valódi böngésző nem
  await page.goto("http://lista.test/"); // más eredet, mint az anyag (élesben websuli.vip ↔ onrender.com): a keret külön folyamatban fut
  const frame = page.frameLocator("#f");
  await expect(frame.locator("#eval")).toBeVisible();
  await page.waitForTimeout(800); // az alapállapot rögzítése (load + 500 ms)
  await frame.locator("#eval").click();
  // A döntő tulajdonság: a kérés 1 mp-en belül elindul — élesben a keret külön folyamatban fut (websuli.vip ↔ onrender.com),
  // eltávolításakor az időzítői megszűnnek, így a későbbi (1,5 mp-es vagy 30 mp-es) beolvasás már nem futna le.
  await expect.poll(() => posts.length, { timeout: 1000, intervals: [50] }).toBe(1);
  await page.evaluate(() => document.getElementById("f")!.remove()); // a tanuló azonnal visszalép
  await page.waitForTimeout(2000);
  expect(posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ auto: true });
  expect(posts[0].body).toContain("80% (Jó)");
});

const MAILTO_AND_RESULT = `<!DOCTYPE html><html><head><title>Vegyes régi anyag</title></head><body>
<button id="eval" onclick="document.getElementById('quiz-result').textContent='Eredmény: 7 / 10 — 70% (Közepes)'">✅ Kiértékelés</button>
<div id="quiz-result"></div>
<button id="send" onclick="window.location.href='mailto:?subject=Kvíz&body=' + encodeURIComponent('70%')">📧 Eredmény elküldése</button>
</body></html>`;

test("review #281: az automatikus beküldés azonnal megy; a sikertelen közvetlen (mailto) küldés után sem vész el az eredmény", async ({ page }) => {
  // a sikeres közvetlen küldés a szerveren törli az összevárt automatikus levelet (tests/material-mailto.test.ts)
  const { posts } = await open(page, "regi-vegyes", MAILTO_AND_RESULT, n => (n === 2 ? 502 : 200));
  await page.click("#eval");
  await page.clock.runFor(1600);
  await expect.poll(() => posts.length, { timeout: 5000 }).toBe(1);
  expect(posts[0]).toMatchObject({ auto: true });
  expect(posts[0].body).toContain("70% (Közepes)");
  await page.click("#send"); // közvetlen küldés → 502
  await expect(page.getByRole("status")).toContainText("nem sikerült");
  expect(posts[1]).toMatchObject({ subject: "Kvíz", auto: false });
  expect((posts[1] as Post & { clientId?: string }).clientId).toBe((posts[0] as Post & { clientId?: string }).clientId);
  await page.clock.runFor(32_000);
  expect(posts.length).toBe(2); // az automatikus már a szerveren van, nem megy újra
});

const FLIP_MATERIAL = `<!DOCTYPE html><html><head><title>Visszaváltó kvíz</title></head><body>
<div class="task"><p>Mi a tört?</p><textarea id="t1"></textarea></div>
<button id="e80" onclick="document.getElementById('quiz-result').textContent='Eredmény: 80% (Jó)'">✅ Kiértékelés A</button>
<button id="e90" onclick="document.getElementById('quiz-result').textContent='Eredmény: 90% (Jeles)'">✅ Kiértékelés B</button>
<div id="quiz-result"></div>
</body></html>`;

test("review #281: utolsó állapot eredményhelyenként, válasz-pillanatkép, korlátozott újrapróba hibánál, kilépés 1,5 mp-en belül, kliensazonosító", async ({ page }) => {
  // 1. küldés 502, a többi 200
  const { posts } = await open(page, "regi-visszavalto", FLIP_MATERIAL, n => (n === 1 ? 502 : 200));
  await page.fill("#t1", "Első válasz");
  await page.click("#e80");
  await page.clock.runFor(1600);
  await expect.poll(() => posts.length, { timeout: 5000 }).toBe(1);
  expect(posts[0].body).toContain("Eredmény: 80% (Jó)");
  expect(posts[0].body).toContain("→ Első válasz");
  expect((posts[0] as Post & { clientId?: string }).clientId).toMatch(/^[0-9a-f]{24}$/);
  // a 502 után ugyanaz a pillanatkép újra megy
  await page.clock.runFor(31_000);
  await expect.poll(() => posts.length, { timeout: 5000 }).toBe(2);
  expect(posts[1].body).toBe(posts[0].body);

  await page.click("#e90");
  await page.clock.runFor(1600);
  await expect.poll(() => posts.length, { timeout: 5000 }).toBe(3);
  await page.fill("#t1", "Később átírt válasz"); // a pontszám után átírt szöveg nem kerül a már elküldött levélbe
  expect(posts[2].body).toContain("Eredmény: 90% (Jeles)");
  expect(posts[2].body).not.toContain("80%"); // eredményhelyenként a legutolsó állapot
  expect(posts[2].body).not.toContain("Később átírt");

  // kilépés 1,5 mp-en belül a kiértékelés után: a függő beolvasás lefut és azonnal küld
  await page.click("#e80");
  await page.clock.runFor(200);
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect.poll(() => posts.length, { timeout: 5000 }).toBe(4);
  expect(posts[3].body).toContain("Eredmény: 80% (Jó)");
  expect(posts[3].body).toContain("→ Később átírt válasz");
});

test("review #300: változatlan válaszokkal 80% → 90% → 80%: a végső 80% is elmegy (csak az egymás után azonos állapot szűrődik)", async ({ page }) => {
  const { posts } = await open(page, "regi-visszavalto-2", FLIP_MATERIAL);
  await page.fill("#t1", "Ugyanaz a válasz");
  for (const id of ["#e80", "#e90", "#e80"]) { await page.click(id); await page.clock.runFor(1600); }
  await expect.poll(() => posts.length, { timeout: 5000 }).toBe(3);
  expect(posts.map(p => /Eredmény: (\d+)%/.exec(p.body)?.[1])).toEqual(["80", "90", "80"]);
  await page.click("#e80"); // ugyanaz az állapot még egyszer → nem megy
  await page.clock.runFor(1600);
  expect(posts.length).toBe(3);
});

// docs/specs/2026-10-18-tanuloi-profil.md (S2): a párosított eszközön a /dev/:id injektálta tanulói token a beküldésbe kerül.
test("tanulói profil: a window.__websuliLearner tokenje az automatikus beküldésben is szerepel", async ({ page }) => {
  const { posts } = await open(page, "regi-tanuloval", EVAL_MATERIAL);
  await page.evaluate(() => { (window as unknown as { __websuliLearner?: string }).__websuliLearner = "tanulo-azonosito-1.1.abcdefghijklmnopqrstuv"; });
  await page.click("#eval");
  await page.clock.runFor(1600);
  await expect.poll(() => posts.length, { timeout: 5000 }).toBe(1);
  expect((posts[0] as Post & { learner?: string }).learner).toBe("tanulo-azonosito-1.1.abcdefghijklmnopqrstuv");
});
