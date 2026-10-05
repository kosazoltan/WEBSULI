import { evaluateOpenAnswer, isTypedTask, normalizeAnswer } from "../../shared/lesson-experience-score";
import type { LessonExperience } from "../../shared/lesson-experience";

/**
 * Spec 2026-10-05-bank-determinisztikus-normalizalas (tulajdonosi utasítás: „másik irányú javítás”). Mért (5 élő futás, 2026-10-05):
 * 54 bukott bankcsomag-kísérletből 29 „a mintaválasz nem teljes pont” (a modell saját rubrikája és mintája ellentmond: minWords > minta,
 * ragozott alak a szinonimacsoportban hiányzik), 27 „Ismétlődő kérdés egy korábbi csomaggal”. Mindkettő GÉPIES hiba — eddig modell-
 * javítókörök (orkesztrátor) próbálták javítani, a keretek elfogytak, a futás a kapunál állt meg. Itt determinisztikusan, modellhívás
 * nélkül javítjuk: a mintában ragozva szereplő kötelező alak a csoportba kerül, az ismétlődő kérdés kikerül (a minimum alá soha). A szószám-
 * küszöb nem csökken, és a javíthatatlan tétel a meglévő hibaúton (javító-, majd mentőkör) marad.
 */

type Task = LessonExperience["tasks"][number];
type Quiz = LessonExperience["quiz"][number];
type Packet = { tasks: Task[]; quiz: Quiz[] };

const tokens = (s: string) => normalizeAnswer(s).split(/\s+/).filter(Boolean);
/** Ugyanannak a szónak ragozott alakja-e (a csoport-szó a minta-szó töve, vagy legalább 4 betűs közös eleje van a rövidebbik végéig ≤ 3 eltéréssel). */
function sameWord(sampleWord: string, groupWord: string): boolean {
  if (sampleWord === groupWord) return true;
  // Review #196 (P1): számnál csak a pontos szám egyezik („30” ≠ „300”); ragozás csak a szám UTÁN („30-at” ↔ „30”).
  if (/\d/.test(sampleWord) || /\d/.test(groupWord)) {
    const num = (w: string) => /^[\d.,]+/.exec(w)?.[0];
    return /^[\d.,]+$/.test(groupWord) && num(sampleWord) === groupWord;
  }
  const [short, long] = sampleWord.length <= groupWord.length ? [sampleWord, groupWord] : [groupWord, sampleWord];
  if (short.length >= 2 && long.startsWith(short) && (short.length >= 4 || long.length - short.length <= 4)) return true;
  let p = 0;
  while (p < short.length && short[p] === long[p]) p++;
  return p >= 4 && short.length - p <= 2 && long.length - p <= 4;
}
/** A minta azon (eredeti írásmódú) szakasza, amely a csoport egyik kifejezésének ragozott megfelelője — vagy null. */
function inflectedPhrase(sample: string, group: readonly string[]): string | null {
  const raw = sample.split(/\s+/).filter(Boolean);
  const keyed = raw.map((w) => tokens(w).join(" "));
  for (const phrase of group) {
    const words = tokens(phrase);
    if (!words.length) continue;
    for (let i = 0; i + words.length <= keyed.length; i++) {
      if (words.every((w, n) => sameWord(keyed[i + n], w))) return raw.slice(i, i + words.length).join(" ").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    }
  }
  return null;
}

/** Egy nyílt feladat rubrikájának igazítása a saját mintájához. true: a minta teljes pont (eleve vagy igazítás után). */
export function alignTaskToSample(t: Task): boolean {
  if (evaluateOpenAnswer(t.sample, t).score === 1) return true;
  if (isTypedTask(t)) return false; // a típusos (v2) részeredmény-feladatot nem igazítjuk — az a modell dolga
  const words = tokens(t.sample).slice(0, 500).length;
  // A szószám-küszöb SOHA nem csökken (tests/lesson-experience „without lowering the threshold”): rövid mintát a modell javít.
  if (words < t.minWords) return false;
  const candidate: Task = { ...t, required: t.required.map((g) => [...g]) };
  for (const group of candidate.required) {
    if (evaluateOpenAnswer(t.sample, { ...candidate, required: [group], minWords: 1, needsSentence: false }).score === 1) continue;
    const form = inflectedPhrase(t.sample, group);
    if (form && !group.includes(form)) group.push(form);
  }
  if (candidate.needsSentence && evaluateOpenAnswer(t.sample, candidate).score !== 1 && evaluateOpenAnswer(t.sample, { ...candidate, needsSentence: false }).score === 1) candidate.needsSentence = false;
  if (evaluateOpenAnswer(t.sample, candidate).score !== 1) return false;
  Object.assign(t, candidate);
  return true;
}

/**
 * A csomag gépies hibáinak javítása HELYBEN (a hívó `validate`-je után fut a meglévő ellenőrzés). Visszaadja a naplózandó lépéseket.
 * `prior`: a korábban kész csomagok kérdései (az ismétlődés-ellenőrzés kulcsával); `min`: a csomag minimális darabszámai.
 */
export function normalizeBankPacket(packet: Packet, prior: { tasks: string[]; quiz: string[] }, min: { tasks: number; quiz: number }, keyOf: (text: string) => string): string[] {
  const notes: string[] = [];
  for (const t of packet.tasks) {
    const before = JSON.stringify([t.minWords, t.required, t.needsSentence]);
    // a javíthatatlan feladat marad: a meglévő hibaút (javítókör, majd mentőkör) dönt róla
    if (alignTaskToSample(t) && JSON.stringify([t.minWords, t.required, t.needsSentence]) !== before) notes.push(`${t.id}: rubrika a mintához igazítva`);
  }
  const drop = <T extends { id: string }>(items: T[], textOf: (x: T) => string, past: string[], bad: (x: T) => boolean, floor: number, label: string) => {
    const seen = new Set(past.map(keyOf));
    const remove = new Set<T>();
    for (const item of items) {
      const key = keyOf(textOf(item));
      if (seen.has(key) || bad(item)) remove.add(item);
      seen.add(key);
    }
    for (const item of [...remove]) {
      if (items.length <= floor) break;
      items.splice(items.indexOf(item), 1);
      notes.push(`${item.id}: kivéve (${label})`);
    }
  };
  drop(packet.tasks, (t) => t.q, prior.tasks, () => false, min.tasks, "ismétlődő feladat");
  drop(packet.quiz, (q) => q.question, prior.quiz, () => false, min.quiz, "ismétlődő kérdés");
  return notes;
}
