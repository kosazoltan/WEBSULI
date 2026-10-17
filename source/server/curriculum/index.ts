import tanmenet from "../data/tanmenet-2020.json";
import { buildIndex, matchMaterial, type CurriculumIndex, type CurriculumMatch, type TanmenetData } from "./match";

/**
 * A NAT 2020 mintatanmenet-index (docs/specs/2026-10-17-tanmenet-rendezes.md): egyszer épül, a listához anyagonként pozíciót ad.
 * A kliens ebből rendez a mai naphoz képest; a pozíció dátumfüggetlen, ezért a lista-gyorsítótárral együtt tárolható.
 */
let index: CurriculumIndex | null = null;
const getIndex = () => (index ??= buildIndex(tanmenet as TanmenetData));

export type CurriculumHint = { pos: number; label: string };

export function curriculumOf(file: { title: string; classroom: number }): CurriculumHint | null {
  const m: CurriculumMatch | null = matchMaterial(file, getIndex());
  return m ? { pos: Math.round(m.pos * 1000) / 1000, label: m.label } : null;
}

/** A lista minden eleméhez hozzáadja a `curriculum` mezőt (hiba esetén null — a lista nem állhat meg miatta). */
export function withCurriculum<T extends { title: string; classroom: number }>(files: T[]): Array<T & { curriculum: CurriculumHint | null }> {
  return files.map(f => {
    try { return { ...f, curriculum: curriculumOf(f) }; } catch { return { ...f, curriculum: null }; }
  });
}
