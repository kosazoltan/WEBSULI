/**
 * Szólétra — a végrehajtási fájl győzelmi táblájának reprodukálható előállítása (review Ú5;
 * docs/specs/2026-11-17-szoletra-olvashatosag-vegrehajtas.md „Mért számok”).
 *
 * Seed-készlet: a terv 6.2 seedjei (`simSeeds("word-ladder-hu-en")`, 20 db); bank: `realLadderBank(évfolyam)` (a valódi
 * angol kézi bank + szóbank az évfolyam szintjén); bot: `runReader` (T/support/word-ladder-reader.ts). Csak olvas, determinisztikus.
 *
 * Futtatás a `source/` mappából: node --import tsx scripts/word-ladder-reader-table.ts [tempók=calm,normal,fast] [pályák=1,6]
 */
import { simSeeds, medianOf } from "../tests/support/game-sim";
import { READER_SLOW, READER_STRONG, READER_TYPICAL, realLadderBank, runReader, type ReaderProfile } from "../tests/support/word-ladder-reader";
import type { LadderTempo } from "../client/src/lib/wordLadder/pacing";

const tempos = (process.argv[2] ?? "calm,normal,fast").split(",") as LadderTempo[];
const levels = (process.argv[3] ?? "1,6").split(",").map(Number);
const grades = [3, 5, 8, 11];
const profiles: ReaderProfile[] = [{ ...READER_SLOW, name: "45%", accuracy: 0.45 }, { ...READER_SLOW, name: "65% (lassú)" }, READER_TYPICAL, READER_STRONG];
const seeds = simSeeds("word-ladder-hu-en");

console.log(`| Pálya, tempó | ${profiles.map((p) => p.name).join(" | ")} |`);
console.log(`|---|${profiles.map(() => "---").join("|")}|`);
for (const level of levels) {
  for (const tempo of tempos) {
    const cells = profiles.map((profile) => {
      const per = grades.map((grade) => {
        const bank = realLadderBank(grade);
        const runs = seeds.map((seed) => runReader(profile, { seed, grade, questions: true, tempo, level, bank }));
        return { wins: runs.filter((r) => r.won).length, dur: medianOf(runs.map((r) => r.durationSec)) };
      });
      return `${per.map((x) => x.wins).join(" / ")} (${Math.round(Math.min(...per.map((x) => x.dur)))}–${Math.round(Math.max(...per.map((x) => x.dur)))} s)`;
    });
    console.log(`| ${level}., ${tempo} | ${cells.join(" | ")} |`);
  }
}
