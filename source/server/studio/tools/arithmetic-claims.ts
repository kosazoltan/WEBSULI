/**
 * Eszköz (2026-09-20): a bank szövegeiben szereplő ARITMETIKAI ÁLLÍTÁSOK gépi ellenőrzése.
 *
 * Mérve négy futásban (quiz.10 „154 · 8 = 1238", quiz.16 „12 · 2 = 48", quiz.60 „194·5 = 970",
 * tasks.24 lépéssor): az olcsó bankmodell hibás részszámításokat ír a magyarázatba vagy a
 * mintába, a lektor ezeket egyenként blokkolja, és minden ilyen egy javító kört ér. Egy
 * „a op b = c" alakú állítás determinisztikusan ellenőrizhető; ami hamis, az a csomag-
 * ellenőrzésben bukik, a lektor előtt. Csak egész és tizedes számokkal, + − · : műveletekkel,
 * balról jobbra több tagú kifejezésre is (szorzás/osztás elsőbbségével). Zárójeles kifejezést
 * nem értékel (nem állít róla semmit).
 */

import { EXPR, OPS, evaluateExpression } from "../../../shared/arithmetic-expression";
import { referenceValueProblems, type TypedAnswer } from "../../../shared/answer-value";

// Spec 2026-09-29 (egy-helyes-valasz): a kiértékelő a `shared/arithmetic-expression.ts`-be költözött (a kliens és a
// `shared/single-choice-check.ts` is használja); itt változatlanul újraexportálva.
export { evaluateExpression };

/** Egyenlőség-LÁNC: `a op b = c op d = e` — a tanulói lépéssor („40 – 18 + 4 = 22 + 4 = 26") is ilyen. */
const CHAIN = new RegExp(`(${EXPR})((?:\\s*=\\s*${EXPR})+)(?!\\d|[.,]\\d)`, "g");

/**
 * Every false equality in the text, as "bal = jobb (helyesen: x)". Mérve (regressziós futás
 * 94a5ccf9): a „40 – 2 · 9 + 4 = 40 – 18 + 4 = 22 + 4 = 26" tanulói lépéssort a páronkénti
 * olvasat („40 – 18 + 4 = 22") hamisnak vette és négy kísérlet után megölte a csomagot. A lánc
 * minden tagját kiértékeljük; csak akkor hiba, ha két SZOMSZÉDOS, kiértékelhető tag értéke eltér.
 */
export function falseArithmeticClaims(text: string): string[] {
  const problems: string[] = [];
  for (const m of text.matchAll(CHAIN)) {
    // Mérve élesben (2026-09-24, felvételi-feladatlap lecke): „(500 + 480) : 2 = 490” — a minta a zárójel
    // UTÁNI „2 = 490”-nél is elindult (szóköz választotta el), és hamis állításnak vette. Ha a lánc előtt
    // (szóközt átugorva) művelet vagy zárójel áll, a kifejezés közepéről indult: nem ítéljük meg.
    const prefix = text.slice(0, m.index!).trimEnd();
    const lead = prefix.slice(-1);
    // Egy műveleti jel csak akkor jelent kifejezés-közepet, ha előtte szám vagy zárójel áll — a „Nem:”
    // címke kettőspontja nem osztás (a section-patch teszt „Nem: 12 · 2 = 48 téves” esete).
    const beforeLead = prefix.slice(0, -1).trimEnd().slice(-1);
    if (/^[()[\]]$/.test(lead) ||(new RegExp(`[${OPS}=]`).test(lead) && /[\d)\]]/.test(beforeLead))) continue;
    // Gyök/hatvány/abszolútérték jel a lánc előtt („√25 = 5”, „|−3| = 3”): a jel nem része a kiértékelt kifejezésnek — nem ítéljük meg.
    if (/[√∛∜|^]$/u.test(prefix)) continue;
    // Spec 2026-10-05-s3-katalogus-bank (mérve a szülő-ellenőrzött korpuszon): ismeretlenes egyenlet — „x + 5 = 12”,
    // „3x + 2 = 11”, „__ × 5 = 15” — a lánc az ismeretlen UTÁN indult („5 = 12”), és helyes egyenletet hamisnak vett (a bank-
    // csomag ellenőrzésében is). Ha a műveleti jel előtt egybetűs ismeretlen (nem szó része, nem szóközös mértékegység),
    // együttható+betű („3x”) vagy kitöltendő hely (_ ? □ …) áll, a kifejezés közepéről indult: nem ítéljük meg.
    if (new RegExp(`[${OPS}=]`).test(lead)) {
      const beforeOp = prefix.slice(0, -1).trimEnd();
      const unknownLead = /(?:^|[^\p{L}\d\s])\s*\p{L}$/u.test(beforeOp) || /(?:^|\s)\p{L}$/u.test(beforeOp) && !/\d\s+\p{L}$/u.test(beforeOp);
      const coefficientLead = /\d\p{L}$/u.test(beforeOp);
      const placeholderLead = /(?:_+|\?|[□☐▢⬜◻]|…|\.{3})$/u.test(beforeOp);
      if (unknownLead || coefficientLead || placeholderLead) continue;
    }
    const segments = `${m[1]}${m[2]}`.split("=").map((seg) => seg.trim());
    // 3. élő futás (run e79ab9da): „980 Ft : 2 = 490 Ft” — a mértékegység töri meg a kifejezést, a
    // minta a „2 = 490”-től indult. Szám + mértékegység + műveleti jel előtt: ha az a szám maga nem
    // egy hosszabb kifejezés része, mértékegység nélkül értékeljük („980 : 2 = 490”); különben kihagyjuk.
    const unitLead = prefix.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*[\\p{L}%°²³/]{1,8}\\.?\\s*([${OPS}])$`, "u"));
    // Élő futás 68a5b500: „15 nap: 60 : 15 = 4” — a szóhoz tapadó kettőspont címke, nem osztás.
    if (unitLead && !(unitLead[2] === ":" && !/\s:$/.test(prefix))) {
      const head = prefix.slice(0, prefix.length - unitLead[0].length).trimEnd();
      const headLast = head.slice(-1);
      const headMid = /[()]/.test(headLast) || (new RegExp(`[${OPS}=]`).test(headLast)
        && new RegExp(`(?:[\\d)]|\\d\\s*[\\p{L}%°²³/]{1,8}\\.?)$`, "u").test(head.slice(0, -1).trimEnd()));
      if (headMid) continue;
      segments[0] = `${unitLead[1]} ${unitLead[2]} ${segments[0]}`;
    }
    // „1/15 = 4 km” (a teljes út 1/15-e 4 km): hányad = mennyiség jelölés, nem számolási állítás.
    const after = text.slice(m.index! + m[0].length);
    // Spec 2026-10-05-s3-katalogus-bank (mérve: „= 6,3T”, „= 168(2,8 − m)”, „= 48π”, „= 3(x + 8)”): ha a lánc utolsó száma
    // KÖZVETLENÜL betűhöz/ismeretlenhez/zárójelhez tapad, az implicit szorzás vagy ismeretlen — nem tisztán számértékű állítás.
    if (/^[\p{L}(]/u.test(after)) continue;
    // A lánc után műveleti jel folytatja a kifejezést, de nem kiértékelhetően („16/24 = 2/?”, „= 3 · _”): nem állítás.
    // A betűhöz tapadó kötőjel magyar toldalék („= 48-at”), nem kivonás — az ilyen állítást megítéljük.
    if (new RegExp(`^\\s*[${OPS}]`).test(after) && !/^-\p{L}/u.test(after)) continue;
    // Helyiérték-bontás („30 = 3 tízes”, „43 = 4 tízes + 3 egyes”): a jobb oldal nem szám, hanem darab-helyiérték.
    if (/^\s*(?:tízes|egyes|százas|ezres|tízezres|tized|század|ezred)(?!\p{L})/u.test(after)) continue;
    // Időpont („11:45 → 12:45 = 1 óra”): a szóköz nélküli ó:pp nem osztás.
    if (/^\d{1,2}:\d{2}$/.test(m[1].trim()) && /^\s*(?:óra|perc|h\b|min)/u.test(after)) continue;
    // Szóközzel elválasztott szám után indult lánc („2 2 = 1 félidő” — egymás alá írt tört kinyert maradéka): töredék, nem állítás.
    if (/\d\s+$/.test(text.slice(0, m.index!))) continue;
    if (segments.length === 2 && /^\d+\s*\/\s*\d+$/.test(segments[0]) && /^\d+(?:[.,]\d+)?$/.test(segments[1]) && /^\s*[a-záéíóöőúüű%]/i.test(after)) continue;
    // Spec 2026-10-05-s3-katalogus-bank (mérve a szülő-ellenőrzött korpuszon): maradékos osztás — „13 ÷ 4 = 3 maradék 1” helyes;
    // tört eredményként („3.25”) hamisnak látszott. Itt a = b·q + r, 0 ≤ r < b a szabály.
    // Írásmódok (mérve): „= 3 maradék 1”, „= 3 (maradék 9)”, „= 21 (m: 1)”, „= 3, és 2 marad”.
    const remainder = after.match(/^\s*[,(]?\s*(?:maradék|marad|m\.?)\s*:?\s*(\d+)/iu) ?? after.match(/^\s*,?\s*és\s+(\d+)\s+(?:a\s+)?marad/iu);
    if (remainder && segments.length === 2) {
      const div = segments[0].match(/^(\d+)\s*[:÷/]\s*(\d+)$/u);
      if (div && /^\d+$/.test(segments[1])) {
        const a = Number(div[1]), b = Number(div[2]), q = Number(segments[1]), r = Number(remainder[1]);
        if (!(b > 0 && r < b && a === b * q + r)) problems.push(`${segments[0].replace(/\s+/g, " ")} = ${q} maradék ${r} (helyesen: ${b > 0 ? `${Math.floor(a / b)} maradék ${a % b}` : "nem értelmezett"})`);
        continue;
      }
    }
    // Tört-bővítés/-egyszerűsítés jelölése („8÷4 / 12÷4 = 2/3”: számláló és nevező külön osztva) — nem balról jobbra értékelendő.
    const fractionOp = (seg: string) => /\s\/\s/.test(seg) && /[÷:]/.test(seg);
    const values = segments.map((seg) => fractionOp(seg) ? null : evaluateExpression(seg));
    // Sorszám + ezres tagolás kétértelműsége („3 133 + 126 = 259” = a 3. lépés): ha a vezető csoport elhagyásával az állítás igaz,
    // nem ítéljük hamisnak (a valódi ezres tagolású hamis állítás így sem marad rejtve, ha a rövidebb olvasat is hamis).
    const leadGroup = segments[0].match(/^\d{1,3}\s+(?=\d{3}(?!\d))/);
    if (leadGroup && values[0] !== null && values[1] != null && Math.abs(values[0] - values[1]) > 1e-6) {
      const alt = evaluateExpression(segments[0].slice(leadGroup[0].length));
      if (alt !== null && Math.abs(alt - values[1]) < 1e-6) continue;
    }
    // „1/2 = 0,5 = 50%”: a százalékjellel záruló utolsó tag a század része.
    if (/^\s*%/.test(after) && values.at(-1) != null) values[values.length - 1] = values.at(-1)! / 100;
    for (let i = 1; i < segments.length; i++) {
      const a = values[i - 1], b = values[i];
      if (a === null || b === null) continue;
      if (Math.abs(a - b) > 1e-6) { problems.push(`${segments[i - 1].replace(/\s+/g, " ")} = ${segments[i].replace(/\s+/g, " ")} (helyesen: ${a})`); break; }
    }
  }
  return problems;
}

/** Bank items' texts with false arithmetic, for the packet validator. */
export function arithmeticClaimProblems(packet: { methods?: Array<{ id: string; prompt?: string; answer?: string }>; tasks?: Array<{ id: string; q?: string; sample?: string; typedAnswers?: readonly TypedAnswer[] }>; quiz?: Array<{ id: string; question?: string; feedbackPerOption?: string[] }> }): string[] {
  const problems: string[] = [];
  for (const m of packet.methods ?? []) for (const bad of falseArithmeticClaims(`${m.prompt ?? ""}\n${m.answer ?? ""}`)) problems.push(`${m.id}: hibás számítás a módszerben: ${bad}`);
  for (const t of packet.tasks ?? []) for (const bad of falseArithmeticClaims(`${t.q ?? ""}\n${t.sample ?? ""}`)) problems.push(`${t.id}: hibás számítás a feladatban vagy a mintában: ${bad}`);
  // Spec 2026-09-30 (U1, C13): a típusos REFERENCIA igazsága — a kérdés kifejezéséből újraszámolva (a típusos mező önmagában
  // nem javítja a hibás számítást: Astra 4–6. kör, korpusz 5e9e2a84 „111”).
  // A tétel-azonosító a sor elején (javítási jogosultság és mentés is így ismeri fel a tételhibát).
  for (const t of packet.tasks ?? []) if (t.typedAnswers?.length && t.q) problems.push(...referenceValueProblems({ id: t.id, q: t.q, typedAnswers: t.typedAnswers }).map((p) => p.startsWith(`${t.id}: `) ? `${t.id}: hibás referencia: ${p.slice(t.id.length + 2)}` : `${t.id}: hibás referencia: ${p}`));
  for (const q of packet.quiz ?? []) for (const bad of falseArithmeticClaims(`${q.question ?? ""}\n${(q.feedbackPerOption ?? []).join("\n")}`)) problems.push(`${q.id}: hibás számítás a kérdésben vagy a magyarázatban: ${bad}`);
  return problems;
}
