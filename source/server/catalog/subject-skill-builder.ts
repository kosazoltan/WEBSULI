import { createHash } from "node:crypto";
import { SUBJECT_LABELS, type CatalogSubject } from "../../shared/catalog-taxonomy";
import type { BankRow } from "./bank-rows";
import { isExcludedSample } from "./sample-exclusions";

/**
 * Spec 2026-10-05-s4-tantargyi-skillek: a tantárgyi skill DETERMINISZTIKUS összeállítása a visszafejtett katalógusból (modell
 * nélkül). Azonos bemenet → bájtra azonos szöveg (stabil verzió-hash). Minta CSAK egyező besorolású, aktív, szülő-ellenőrzött
 * tétel lehet; a jelölt és az átnézendő tétel soha.
 */
export const SUBJECT_SKILL_GENERATOR = "subject-skill-builder v2";
export const SPARSE_LIMIT = 30;
const SAMPLES_PER_AREA = 2;
const MAX_SAMPLES = 40;
const MAX_AREAS = 40;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
/**
 * v2 (a valós korpuszon mérve): néhány régi lecke ékezet nélkül íródott („Hany kulonbozo jelet hasznal…”) — mintának rossz
 * helyesírást tanítana. Magyar nyelvű bankban a 4+ szavas, egyetlen ékezetes betűt sem tartalmazó tétel nem minta (a bankban marad).
 */
const FOREIGN_LANGUAGE_BANKS: ReadonlySet<string> = new Set(["angol", "nemet", "francia"]);
export function unaccentedHungarian(subject: string, text: string): boolean {
  if (FOREIGN_LANGUAGE_BANKS.has(subject)) return false;
  const words = text.match(/\p{L}{2,}/gu) ?? [];
  return words.length >= 4 && !/[áéíóöőúüű]/iu.test(text);
}
/** v2: a témakör-kulcs kis-/nagybetűtől független („kivonás” = „Kivonás”); a megjelenített név a változatok közül a legkisebb (determinisztikus). */
const areaKey = (area: string) => area.trim().toLocaleLowerCase("hu");
const KIND_LABEL: Record<string, string> = { quiz: "kvíz", short_answer: "rövid válasz", open_task: "nyílt feladat", method: "módszer", section: "magyarázó fejezet", vocab: "szókincs-pár", quiz_unkeyed: "kulcs nélküli kvíz" };

/** Visszatérő csapda (lektor-jegyzet vagy gépi lelet) tantárgyanként összesítve. */
export type Trap = { source: "lektor" | "ellenőrző"; code: string; count: number; example?: string };

export type SubjectSkill = { subject: CatalogSubject; text: string; sparse: boolean; activeItems: number; lessons: number; version: string };

function sampleLine(r: BankRow): string {
  const prompt = clip(oneLine(r.prompt), 160);
  if (r.kind === "quiz" && r.options && r.correctIndex !== null) {
    const opts = r.options.map((o, i) => `${String.fromCharCode(97 + i)}) ${clip(oneLine(o), 60)}`).join("; ");
    return `- [kvíz] ${prompt} — ${opts} (helyes: ${String.fromCharCode(97 + r.correctIndex)})`;
  }
  if (r.kind === "short_answer") return `- [rövid válasz] ${prompt} — elfogadott: ${(r.accepted ?? []).slice(0, 4).map((a) => clip(oneLine(a), 40)).join(" | ")}`;
  if (r.kind === "open_task") return `- [nyílt] ${prompt}${r.keywordGroups?.length ? ` — kulcsszavak: ${r.keywordGroups.slice(0, 4).map((g) => g[0]).join(", ")}` : ""}`;
  if (r.kind === "vocab" && r.pair) return `- [szókincs] ${r.pair.source} → ${r.pair.target}`;
  if (r.kind === "method") return `- [módszer] ${prompt}${r.steps?.length ? ` — lépések: ${r.steps.slice(0, 5).map((s) => clip(oneLine(s), 40)).join(" → ")}` : ""}`;
  return `- [fejezet] ${prompt}: ${clip(oneLine(r.body ?? ""), 220)}`;
}

/** Egy tantárgy skill-szövege a bank-soraiból. `rows` bármilyen sorrendben jöhet — a kimenet rendezett. */
export function buildSubjectSkill(subject: CatalogSubject, allRows: readonly BankRow[], traps: readonly Trap[], sourceDay: string, agreedProvenances?: ReadonlySet<string>): SubjectSkill {
  const rows = allRows.filter((r) => r.subject === subject && r.status === "active");
  // Spec S4: a leckeszám és a témakör-térkép CSAK az egyező besorolású leckékből (aktív tételek ∩ agreed leckék) — az átnézendő
  // lecke, amely egy aktív sorba beolvadt, nem számít bele. Ha a halmaz nincs megadva, minden provenance számít.
  const countable = (r: BankRow): string[] => (agreedProvenances ? r.provenances.filter((p) => agreedProvenances.has(p)) : r.provenances);
  const lessons = new Set(rows.flatMap(countable)).size;
  const sparse = rows.length < SPARSE_LIMIT;
  const out: string[] = [];
  out.push(`# Tantárgyi skill: ${SUBJECT_LABELS[subject]} (bank: ${subject})`);
  out.push(`<!-- ${SUBJECT_SKILL_GENERATOR} | forrás: ${sourceDay} | leckék: ${lessons} | aktív tételek: ${rows.length}${sparse ? " | ritka" : ""} -->`);
  out.push("", "## Szabályok",
    `- Ez a(z) ${SUBJECT_LABELS[subject]} bank tudása; más tantárgy (más természettudományi ág) bankjára NE hivatkozz.`,
    "- A mintatételek szülők által ellenőrzött, éles leckékből valók: szerkezetük, nehézségük és nyelvezetük a mérce.",
    "- Szó szerint csak azonos témájú és évfolyamú tételt vegyél át; egyébként csak sablonként használd.");

  // Témakör-térkép évfolyamonként
  const areas = new Map<string, { grade: number | null; area: string; items: number; lessons: Set<string> }>();
  for (const r of rows) {
    const area = r.topicArea ?? "(témakör nélkül)";
    const key = `${String(r.grade ?? 99).padStart(2, "0")}\u0001${areaKey(area)}`;
    const a = areas.get(key) ?? { grade: r.grade, area, items: 0, lessons: new Set<string>() };
    if (area.localeCompare(a.area, "hu") < 0) a.area = area;
    a.items++;
    for (const p of countable(r)) a.lessons.add(p);
    areas.set(key, a);
  }
  const areaList = [...areas.entries()].sort((x, y) => x[0].localeCompare(y[0], "hu")).map(([, a]) => a);
  out.push("", "## Témakörök évfolyamonként");
  for (const a of areaList.slice(0, MAX_AREAS)) out.push(`- ${a.grade ? `${a.grade}. évf.` : "évfolyam nélkül"}: ${clip(a.area, 80)} — ${a.items} tétel, ${a.lessons.size} lecke`);
  if (areaList.length > MAX_AREAS) out.push(`- … további ${areaList.length - MAX_AREAS} témakör`);

  // Tételtípus-arány
  const kinds = new Map<string, number>();
  for (const r of rows) kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);
  const kindLine = [...kinds.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, n]) => `${KIND_LABEL[k] ?? k} ${Math.round((100 * n) / Math.max(1, rows.length))}%`).join(" · ");
  out.push("", "## Tételtípus-arány a bank leckéiben", rows.length ? `- ${kindLine}` : "- (nincs aktív tétel)");

  // Mintatételek
  if (!sparse) {
    out.push("", "## Mintatételek (szülő-ellenőrzött)");
    let taken = 0;
    for (const a of areaList) {
      if (taken >= MAX_SAMPLES) break;
      const pool = rows.filter((r) => r.trust === "parent_verified" && r.kind !== "section" && !isExcludedSample(r.fingerprint) && areaKey(r.topicArea ?? "(témakör nélkül)") === areaKey(a.area) && r.grade === a.grade
        && !unaccentedHungarian(subject, `${r.prompt} ${(r.options ?? []).join(" ")}`))
        .sort((x, y) => x.fingerprint.localeCompare(y.fingerprint)).slice(0, Math.min(SAMPLES_PER_AREA, MAX_SAMPLES - taken));
      if (!pool.length) continue;
      out.push(`### ${a.grade ? `${a.grade}. évf. — ` : ""}${clip(a.area, 80)}`);
      for (const r of pool) out.push(sampleLine(r));
      taken += pool.length;
    }
  }

  // Visszatérő csapdák
  const sortedTraps = [...traps].sort((a, b) => b.count - a.count || a.source.localeCompare(b.source) || a.code.localeCompare(b.code));
  out.push("", "## Visszatérő csapdák");
  if (!sortedTraps.length) out.push("- (nincs mért csapda)");
  for (const t of sortedTraps.slice(0, 12)) out.push(`- ${t.source}: ${t.code} ×${t.count}${t.example ? ` — pl. ${t.example}` : ""}`);

  const text = `${out.join("\n")}\n`;
  return { subject, text, sparse, activeItems: rows.length, lessons, version: createHash("sha256").update(text).digest("hex").slice(0, 12) };
}

/**
 * Lektor-jegyzet üzenetének rövidített mintája: idézett szöveg → „…”, e-mail/`@`-os token → „…@…”, két nagybetűs szó egymás után
 * (névszerű) → „[név]”, szám → #, 120 karakter. Ez egyszerű maszkolás, NEM garantált anonimizálás.
 */
export function trapExample(message: string): string {
  return clip(oneLine(message).replace(/[„"«][^”"»]*[”"»]/g, "„…”").replace(/\S*@\S*/g, "…@…")
    .replace(/(?<![\p{L}])\p{Lu}\p{Ll}+(?:[ -]\p{Lu}\p{Ll}+)+/gu, "[név]").replace(/\d+(?:[.,]\d+)?/g, "#"), 120);
}

/** A gépi ellenőrző leleteiből tantárgyi csapda-osztályok (a jelölt tételek `checks` mezőjéből). */
export function verifierTraps(subject: string, allRows: readonly BankRow[]): Trap[] {
  const counts = new Map<string, number>();
  for (const r of allRows) if (r.subject === subject && r.status === "flagged") for (const c of r.checks) {
    const code = /ismétlődő/.test(c) ? "ismétlődő válaszlehetőség" : /ugyanazt jelenti/.test(c) ? "két egyenértékű opció" : /hamis egyenlőség/.test(c) ? "hamis számítás" : /kulcs/.test(c) ? "rossz vagy hiányzó kulcs" : "egyéb";
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()].map(([code, count]) => ({ source: "ellenőrző" as const, code, count }));
}
