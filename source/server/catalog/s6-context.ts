import { subjectKeyOf } from "../../shared/subject-key";
import { subjectSkillBlock } from "../studio/subject-skills";
import { buildCatalogPool, lessonTopicText, planningCatalogBlock, type CatalogConcept, type CatalogPool, type CatalogRowLike } from "./retrieval";

/**
 * Spec 2026-10-06-s6-katalogus-bekotes: a tantárgyi tudásbank gyártási bekötése — a KAPCSOLÓ és a tervezői/szerzői blokk.
 * Ez az egyetlen gyártási modul, amely a tantárgyi skillt (S4) behúzza; kikapcsolt kapcsolónál semmit sem ad (a promptok és a
 * lépés-hashek bájtra változatlanok — teszt őrzi). Alapból KI, amíg az A/B el nem fogadja.
 */
export function catalogS6Enabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.STUDIO_CATALOG_S6 === "1";
}

export type CatalogMapLike = { meta: { title: string; subject: string; classroom: number }; concepts: readonly CatalogConcept[] };

/** A lekérés paraméterei a térképből; ismeretlen vagy kétértelmű tantárgy → null (nincs lekérés, nincs találgatás). */
export function catalogQueryOf(map: CatalogMapLike) {
  const subject = subjectKeyOf(map.meta.subject);
  if (!subject) return null;
  return { subject, grade: map.meta.classroom, topic: lessonTopicText(map.meta.title, map.concepts), concepts: map.concepts };
}

/** A pool a térkép lekéréséből; a `rows` a betöltő eredménye (`subject = $1 and status = 'active'`). */
export function catalogPoolFor(map: CatalogMapLike, rows: readonly CatalogRowLike[]): CatalogPool | undefined {
  const query = catalogQueryOf(map);
  return query ? buildCatalogPool(rows, query) : undefined;
}

/** Igaz, ha a mentett pool ugyanehhez a lekéréshez tartozik (tantárgy, évfolyam, téma) — különben újra kell tölteni. */
export function poolMatches(pool: unknown, map: CatalogMapLike): pool is CatalogPool {
  const q = catalogQueryOf(map);
  const p = pool as CatalogPool | undefined;
  return !!q && p?.version === 1 && p.subject === q.subject && p.grade === q.grade && p.topic === q.topic && Array.isArray(p.items);
}

/** Tervező és szerző: tantárgyi skill + katalógus-minták. Üres, ha egyik sincs. */
export function planningContextBlock(map: CatalogMapLike, pool: CatalogPool | undefined): string {
  const subject = subjectKeyOf(map.meta.subject);
  return [subject ? subjectSkillBlock(subject, null) : "", planningCatalogBlock(pool)].filter(Boolean).join("\n");
}
