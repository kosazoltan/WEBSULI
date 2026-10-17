import { test, expect, type Page } from "@playwright/test";
import { MATERIAL_CAPTURE_SCRIPT, rewriteLocationAssignments } from "../server/lib/material-capture";

// Régi (HTML) tananyagok eredménye e-mailben (docs/specs/2026-10-17-regi-anyag-eredmeny.md): a beinjektált szkript valódi böngészőben.
// Az anyagot a /dev/:id kiszolgálással azonos módon alakítjuk (átírás + elfogó a fejben és a törzs végén); a beküldés mockolva.
type Post = { materialId: string; subject: string; body: string; auto?: boolean };

function serve(stored: string): string {
  const html = rewriteLocationAssignments(stored).html.replace("<head>", "<head>" + MATERIAL_CAPTURE_SCRIPT);
  return html.replace("</body>", MATERIAL_CAPTURE_SCRIPT + "</body>");
}

async function open(page: Page, id: string, stored: string) {
  const posts: Post[] = [];
  const mailtoNavigations: string[] = [];
  page.on("request", r => { if (r.url().startsWith("mailto:")) mailtoNavigations.push(r.url()); });
  await page.route(`http://websuli.test/dev/${id}`, route => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: serve(stored) }));
  await page.route("http://websuli.test/api/material-result", route => {
    posts.push(JSON.parse(route.request().postData() ?? "{}"));
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"success":true}' });
  });
  await page.goto(`http://websuli.test/dev/${id}`);
  await page.waitForTimeout(700); // az alapállapot rögzítése (load + 500 ms)
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
  await page.waitForTimeout(1800); // a kattintás utáni beolvasás sem küld (nincs százalékos eredménydoboz)
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
  await page.waitForTimeout(1800);
  expect(posts).toEqual([]);

  await page.fill("#t1", "A számláló megmutatja, hány részt veszünk.");
  await page.click("#eval");
  await expect.poll(() => posts.length, { timeout: 5000 }).toBe(1);
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
  await page.waitForTimeout(2000);
  expect(posts.length).toBe(1);

  await page.fill("#t1", "A számláló megmutatja, hogy az egészből hány egyenlő részt veszünk figyelembe.");
  await page.click("#eval"); // új eredmény → új levél
  await expect.poll(() => posts.length, { timeout: 5000 }).toBe(2);
  expect(posts[1].body).toContain("90% (Jeles)");
});
