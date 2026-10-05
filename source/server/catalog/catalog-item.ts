import { createHash } from "node:crypto";

/**
 * Spec 2026-10-05-s1-katalogus-kinyeres: a tantárgyi katalógus EGY tétele, forrásfüggetlen alakban. A tantárgy/téma/típus
 * besorolás (S2) és a bizalmi szint + tárolás (S3) erre épül; itt csak a kinyert tartalom és a forrás (provenance) van.
 */
export type CatalogItemKind =
  | "section"        // magyarázó szöveg egy fejezetcím alatt
  | "quiz"           // feleletválasztós kérdés, ismert helyes indexszel
  | "quiz_unkeyed"   // feleletválasztós, de a helyes kulcs nem állapítható meg — szó szerint NEM vehető át
  | "short_answer"   // rövid nyílt válasz, elfogadott változatokkal
  | "open_task"      // nyílt feladat kulcsszó-csoportokkal (+ minta)
  | "method"         // fúziós módszer-tétel
  | "vocab";         // szókincs-pár

export type CatalogItemDraft = {
  kind: CatalogItemKind;
  /** Forrás: `legacy_html:<html_files.id>` vagy `lesson:<lessons.id>`. */
  provenance: string;
  /** A tétel szövege a tanuló felé (kérdés / feladat / fejezetcím). */
  prompt: string;
  /** Fejezet-szöveg (section), mintamegoldás (open_task), módszer-válasz (method). */
  body?: string;
  options?: string[];
  correctIndex?: number;
  /** Elfogadott válaszok (short_answer) vagy kulcsszó-csoportok (open_task, csoportonként szinonimák). */
  accepted?: string[];
  keywordGroups?: string[][];
  /** Szókincs-pár. */
  pair?: { source: string; target: string; sourceLang: string; targetLang: string };
  /** Sorrend-lépések (fúziós sorba rendező / ok-okozat / idővonal módszer) — review #188. */
  steps?: string[];
  /** Fúziós tétel kötése (ha van). */
  conceptIds?: string[];
  /** Az eredeti objektum-kulcsai (formátum-statisztikához). */
  shape?: string;
  fingerprint: string;
};

const norm = (s: string) => s.normalize("NFC").toLocaleLowerCase("hu").replace(/\s+/g, " ").trim();

/** Duplikátum-szűrés: MINDEN tudást hordozó mező (review #188: a szöveg, a kulcsszó-csoportok és a lépések is — különben két azonos
 *  című, de más tartalmú fejezet/feladat összevonódna és tudás veszne el). */
export function itemFingerprint(item: Omit<CatalogItemDraft, "fingerprint" | "provenance">): string {
  // review #188 (Copilot): a módszer altípusa (shape: fusion.method.<kind>) is — különben az azonos szövegű, de más fajtájú
  // módszerek összevonódnának (a standard fixture-ben 11 → 4).
  const parts = [item.kind, item.kind === "method" ? item.shape ?? "" : "", norm(item.prompt), norm(item.body ?? ""), ...(item.options ?? []).map(norm), String(item.correctIndex ?? ""), ...(item.accepted ?? []).map(norm),
    ...(item.keywordGroups ?? []).map((g) => g.map(norm).join("|")), ...(item.steps ?? []).map(norm),
    ...(item.pair ? [norm(item.pair.source), norm(item.pair.target)] : [])];
  return createHash("sha1").update(parts.join("\u0001")).digest("hex").slice(0, 16);
}
