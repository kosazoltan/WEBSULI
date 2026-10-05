import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyFailure, jobMetrics, normalizeSubject, subjectSummary } from "../server/studio/run-metrics";

/* Spec 2026-10-05-s0-meresi-alap — a tudásbank-program mércéje (determinisztikus, a mért hibaüzenetekkel). */

test("bukás-osztályozás a mért éles hibaüzenetekre", () => {
  assert.equal(classifyFailure("Hibás banktétel maradt a limiten, és a kivétel után a bank nem felelne meg — nem publikálható: …"), "bank_floor_after_removal");
  assert.equal(classifyFailure("A megalapozatlan blokk kivétele után a fúziós bank nem felel meg — nem publikálható"), "bank_floor_after_removal");
  assert.equal(classifyFailure("Egyválasztós hiba maradt a leckében, nem publikálható"), "single_choice_left");
  assert.equal(classifyFailure("A lektor 3 tartalmi javítást kér — tényhiba maradt, nem publikálható"), "factual_at_limit");
  assert.equal(classifyFailure("A 1. fejezet bankcsomagja a javító kör után sem megfelelő: methods=2"), "bank_packet");
  assert.equal(classifyFailure("Az animátor megsértette a szerződést — A(z) 1. szakasz nem-animate blokkjai megváltoztak."), "animator_contract");
  assert.equal(classifyFailure("A vázlat nem felel meg a térképnek — hiányzó kulcsfogalom: parolgas"), "coverage_grounding");
  assert.equal(classifyFailure("A(z) \"animator\" lépés modellhívása hibára futott: a szolgáltató hibát jelzett"), "infrastructure");
  assert.equal(classifyFailure("value.trim is not a function"), "schema_code");
  assert.equal(classifyFailure("Ismeretlen hiba."), "schema_code");
  assert.equal(classifyFailure(null), "other");
});

test("jobonkénti mutatók: főkönyv és régi mezők, siker/bukás, jegyzetek", () => {
  const ok = jobMetrics({ id: "a", subject: "matematika", step: "done", status: "ok", error: null, output: { repairLedger: { bankOnly: { used: 2, rounds: [1, 2] }, gateBank: { used: 1, rounds: [4] } } } }, { total: 6, bank: 5, teach: 1 });
  assert.deepEqual([ok.success, ok.failed, ok.failureClass, ok.bankOnlyRounds, ok.gateBank, ok.subject], [true, false, null, 2, 1, "Matematika"]);
  const legacy = jobMetrics({ id: "b", subject: "Történelem", step: "error", status: "error", error: "Egyválasztós hiba maradt", output: { bankOnlyRepairRounds: 1, targetedGateRepairRound: 3 } });
  assert.deepEqual([legacy.failed, legacy.failureClass, legacy.bankOnlyRounds, legacy.targetedGate], [true, "single_choice_left", 1, 1]);
});

test("tantárgyi összesítés: egységesített név, siker-arány, átlagok, ÖSSZESEN sor elöl", () => {
  const rows = [
    jobMetrics({ id: "1", subject: "Természetismeret", step: "done", status: "ok", error: null, output: null }, { total: 2, bank: 2, teach: 0 }),
    jobMetrics({ id: "2", subject: "természetismeret", step: "error", status: "error", error: "bankcsomagja", output: null }, { total: 4, bank: 2, teach: 2 }),
  ];
  const [all, sci] = subjectSummary(rows);
  assert.equal(all.subject, "ÖSSZESEN");
  assert.equal(sci.subject, "Természetismeret");
  assert.deepEqual([sci.runs, sci.success, sci.successRate, sci.avgBankNotes, sci.avgTeachNotes, sci.failures.bank_packet], [2, 1, 0.5, 2, 1, 1]);
  assert.equal(normalizeSubject("  "), "Ismeretlen");
});
