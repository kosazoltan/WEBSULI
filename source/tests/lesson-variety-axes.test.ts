import test from "node:test";
import assert from "node:assert/strict";
import { seedFrom } from "../shared/seeded";
import { OPENING_FORMS, openerVarietyPick, type OpeningFormGroup } from "../shared/lesson-opener";
import {
  EXAMPLE_THEMES, RECAP_FORMS, lengthBands, pickVarietyAxes, avoidSeriesRepeat, varietyAxesContract, varietyAxesLektorLine, shapeSignature,
} from "../shared/lesson-variety-axes";

/** V1 (docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md): nyitásformák, témakontextus, összefoglaló formák, hosszsáv, sorozatszabály. */
const GROUP_CLASSROOMS: Record<OpeningFormGroup, number> = { young: 2, middle: 6, older: 10 };

test("200 leckeazonosítón minden nyitásforma és témakontextus előfordul, egyik sem haladja meg a 25%-ot", () => {
  for (const [group, classroom] of Object.entries(GROUP_CLASSROOMS) as Array<[OpeningFormGroup, number]>) {
    const forms = new Map<string, number>();
    for (let i = 0; i < 200; i++) {
      const id = openerVarietyPick(classroom, seedFrom(`lecke-${i}`)).form.id;
      forms.set(id, (forms.get(id) ?? 0) + 1);
    }
    for (const f of OPENING_FORMS[group]) assert.ok(forms.has(f.id), `${group}: ${f.id} nem fordult elő`);
    for (const [id, n] of forms) assert.ok(n / 200 <= 0.25, `${group}/${id}: ${n}/200`);
  }
  const themes = new Map<string, number>();
  for (let i = 0; i < 200; i++) {
    const t = pickVarietyAxes(seedFrom(`lecke-${i}`), 4).exampleTheme.id;
    themes.set(t, (themes.get(t) ?? 0) + 1);
  }
  for (const t of EXAMPLE_THEMES) assert.ok(themes.has(t.id), `téma: ${t.id}`);
  for (const [id, n] of themes) assert.ok(n / 200 <= 0.25, `téma ${id}: ${n}/200`);
});

test("a kiosztás determinisztikus; minden összefoglaló forma előfordul; a hosszsáv ≥ 2 fejezetnél nem egyforma", () => {
  assert.deepEqual(pickVarietyAxes(123, 5), pickVarietyAxes(123, 5));
  const recaps = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const axes = pickVarietyAxes(seedFrom(`lecke-${i}`), 2 + (i % 5));
    recaps.add(axes.recapForm.id);
    assert.equal(axes.lengthBands.length, 2 + (i % 5));
    assert.ok(new Set(axes.lengthBands).size >= 2, `egyforma sávok: ${axes.lengthBands.join(",")}`);
  }
  for (const r of RECAP_FORMS) assert.ok(recaps.has(r.id), `összefoglaló: ${r.id}`);
  assert.deepEqual(lengthBands(9, 1).length, 1);
});

test("sorozatszabály: az előző lecke formája / témája / összefoglalója nem ismétlődik; előzmény nélkül a mag dönt", () => {
  const classroom = 6;
  for (let i = 0; i < 50; i++) {
    const seed = seedFrom(`sorozat-${i}`);
    const base = { openingForm: openerVarietyPick(classroom, seed).form.id, ...pickVarietyAxes(seed, 4) };
    const same = avoidSeriesRepeat(base, { openingForm: base.openingForm, exampleTheme: base.exampleTheme.id, recapForm: base.recapForm.id }, classroom);
    assert.notEqual(same.openingForm, base.openingForm);
    assert.notEqual(same.exampleTheme.id, base.exampleTheme.id);
    assert.notEqual(same.recapForm.id, base.recapForm.id);
    assert.deepEqual(avoidSeriesRepeat(base, undefined, classroom), base);
    assert.deepEqual(avoidSeriesRepeat(base, { openingForm: "mas-forma" }, classroom).openingForm, base.openingForm);
  }
});

test("blokkváz-aláírás: a fejezetek blokksora, a sorrend számít", () => {
  assert.equal(shapeSignature([{ plannedBlocks: ["explain", "check"] }, { plannedBlocks: ["recap"] }]), "explain>check|recap");
  assert.notEqual(shapeSignature([{ plannedBlocks: ["check", "explain"] }]), shapeSignature([{ plannedBlocks: ["explain", "check"] }]));
});

test("szerzői szerződés: témakör, összefoglaló forma és fejezetenkénti hosszsáv; a lektor az összefoglaló formát méri", () => {
  const axes = pickVarietyAxes(seedFrom("lecke-x"), 3);
  const text = varietyAxesContract(axes, 2000);
  assert.match(text, new RegExp(axes.exampleTheme.label));
  assert.match(text, new RegExp(axes.recapForm.label.replace(/[–-]/g, ".")));
  assert.match(text, /1\. fejezet: (rövid|közepes|hosszabb)/);
  assert.match(text, /3\. fejezet: (rövid|közepes|hosszabb)/);
  assert.match(text, /tantárgyi pontosság/i);
  assert.match(varietyAxesLektorLine(axes), new RegExp(axes.recapForm.label.replace(/[–-]/g, ".")));
});

test("3 új nyitásforma (kihívás, képtalálós, híres történet) a megfelelő korcsoportokban", () => {
  const ids = (g: OpeningFormGroup) => OPENING_FORMS[g].map((f) => f.id);
  for (const g of ["young", "middle", "older"] as const) assert.ok(ids(g).includes("kihivas"), `${g}: kihívás`);
  assert.ok(ids("young").includes("kepes") && ids("middle").includes("kepes"));
  assert.ok(ids("middle").includes("hires-tortenet") && ids("older").includes("hires-tortenet"));
});

test("bekötés: a szerzői prompt a futás kiosztott tengelyeit csak BE kapcsolónál kapja; kiosztás nélkül / KI-nél bájtra a régi", async () => {
  const { buildAuthorPrompt } = await import("../server/studio/step-io");
  const { runWithLessonVariety, setRunVarietyAxes } = await import("../server/studio/lesson-variety-flag");
  const map = { title: "T", subject: "matek", classroom: 6, concepts: [{ localId: "c1", examWeight: "core" as const, term: "terület" }] };
  const sections = [{ heading: "H", conceptIds: ["c1"], plannedBlocks: ["explain" as const], animationSuggestions: [] as string[] }];
  const axes = pickVarietyAxes(seedFrom("bekotes"), 1);
  const plain = runWithLessonVariety(true, () => buildAuthorPrompt(sections, map, []));
  const assigned = runWithLessonVariety(true, () => { setRunVarietyAxes(axes); return buildAuthorPrompt(sections, map, []); });
  assert.doesNotMatch(plain, /PÉLDÁK TÉMAKÖRE/);
  assert.match(assigned, new RegExp(`PÉLDÁK TÉMAKÖRE: ${axes.exampleTheme.label}`));
  const { lessonLengthBudget } = await import("../shared/lesson-length");
  assert.equal(assigned.replace(`\n${varietyAxesContract(axes, lessonLengthBudget(map).targetWords)}`, ""), plain, "a kiosztás csak a V1-sorokat adja hozzá")
  const off = runWithLessonVariety(false, () => { setRunVarietyAxes(axes); return buildAuthorPrompt(sections, map, []); });
  assert.doesNotMatch(off, /PÉLDÁK TÉMAKÖRE/);
  assert.equal(off, runWithLessonVariety(false, () => buildAuthorPrompt(sections, map, [])));
});

test("sorozat-előzmény a job-kimenetből: csak ismert alakú mezők; blokkváz-aláírás a vázlatból", async () => {
  const { seriesPreviousOf } = await import("../server/studio/pipeline-store");
  assert.equal(seriesPreviousOf(null), undefined);
  assert.equal(seriesPreviousOf({ foo: 1 }), undefined);
  assert.deepEqual(seriesPreviousOf({ openingForm: "rejtely", exampleTheme: "sport", recapForm: "3-2-1", outline: { sections: [{ plannedBlocks: ["explain", "check"] }, { plannedBlocks: ["recap"] }] } }),
    { openingForm: "rejtely", exampleTheme: "sport", recapForm: "3-2-1", shapeSignature: "explain>check|recap" });
  assert.deepEqual(seriesPreviousOf({ openingForm: "ROSSZ FORMA!", exampleTheme: 3 }), undefined);
});
