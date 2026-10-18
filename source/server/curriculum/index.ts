import tanmenet from "../data/tanmenet-2020.json";
import nyelvi from "../data/nyelvi-tanmenet.json";
import { buildIndex, matchMaterial, type CurriculumIndex, type CurriculumMatch, type TanmenetData } from "./match";
import { hintsFromHtml, hintsFromLesson } from "./hints";

/**
 * A NAT 2020 mintatanmenet-index (docs/specs/2026-10-17-tanmenet-rendezes.md): egyszer épül, a listához anyagonként pozíciót ad.
 * A kliens ebből rendez a mai naphoz képest; a pozíció dátumfüggetlen, ezért a lista-gyorsítótárral együtt tárolható.
 * Kiegészítés (docs/specs/2026-10-18-tanmenet-kiegeszites.md): ha a cím nem elég, a tartalom címsorai / kulcsfogalmai döntenek.
 */
let index: CurriculumIndex | null = null;
/** A NAT 2020 mintatanmenetek + az iskolai nyelvi tanmenetek (angol, francia — nincs hivatalos OH-tanmenet). */
export const curriculumData = (): TanmenetData => ({ about: "NAT 2020 + iskolai nyelvi tanmenetek", plans: [...(tanmenet as TanmenetData).plans, ...(nyelvi as TanmenetData).plans] });
const getIndex = () => (index ??= buildIndex(curriculumData()));

export type CurriculumHint = { pos: number; label: string };
type Item = { id: string; title: string; classroom: number; contentType?: string | null };
/** Tartalombetöltő: anyag-azonosító → nyers tartalom (HTML) vagy a publikált lecke JSON-ja. */
export type ContentLoader = (items: readonly Item[]) => Promise<Map<string, { html?: string; lesson?: unknown }>>;

const round = (m: CurriculumMatch) => ({ pos: Math.round(m.pos * 1000) / 1000, label: m.label });

export function curriculumOf(file: { title: string; classroom: number; hints?: readonly string[] }): CurriculumHint | null {
  const m = matchMaterial(file, getIndex());
  return m ? round(m) : null;
}

/** A tartalomjelzők memóriája (anyag + cím + évfolyam szerint); a lista-gyorsítótár érvénytelenítésekor ürül. */
const hintMemo = new Map<string, readonly string[]>();
const memoKey = (f: Item) => `${f.id}|${f.title}|${f.classroom}`;
export function clearCurriculumHints(): void {
  hintMemo.clear();
}

/**
 * A lista minden eleméhez hozzáadja a `curriculum` mezőt. A cím alapján nem illeszthető (évfolyammal rendelkező) anyagok tartalmát
 * egyszer olvassa be (`load`), és a címsorokból / kulcsfogalmakból próbál illeszteni. Hiba esetén null — a lista nem állhat meg.
 */
export async function withCurriculum<T extends Item>(files: T[], load?: ContentLoader): Promise<Array<T & { curriculum: CurriculumHint | null }>> {
  const first = files.map(f => {
    try { return curriculumOf(f); } catch { return null; }
  });
  if (load) {
    const missing = files.filter((f, i) => !first[i] && f.classroom > 0 && !hintMemo.has(memoKey(f)));
    if (missing.length) {
      try {
        const contents = await load(missing);
        for (const f of missing) {
          const c = contents.get(f.id);
          hintMemo.set(memoKey(f), c?.lesson ? hintsFromLesson(c.lesson) : c?.html ? hintsFromHtml(c.html) : []);
        }
      } catch { /* a tartalom nélkül is kiszolgálható a lista (cím szerinti illesztés) */ }
    }
  }
  return files.map((f, i) => {
    if (first[i]) return { ...f, curriculum: first[i] };
    const hints = hintMemo.get(memoKey(f));
    if (!hints?.length) return { ...f, curriculum: null };
    try { return { ...f, curriculum: curriculumOf({ ...f, hints }) }; } catch { return { ...f, curriculum: null }; }
  });
}
