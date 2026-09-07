/**
 * M-4 — mit mondjunk a gyereknek a Próba után, ha nem járt játékidő.
 *
 * Miért külön modul: a kupon-küszöb bevezetésével keletkezett egy eset, ami korábban
 * nem létezett — a gyerek MINDENT eltalál, és mégsem kap kupont, mert kevés kérdés
 * volt a szakaszban. A régi felület ilyenkor azt írta volna ki, hogy „Ez még nem elég
 * a játékidőhöz. Nézd át ezeket:", majd egy ÜRES listát. Az nemcsak csúnya, hanem
 * hazug is: nincs mit átnéznie.
 *
 * Tiszta függvény, hogy a három esetet teszt tudja rögzíteni, ne a képernyő.
 */

export type ProbaMessageInput = {
  correctCount: number;
  total: number;
  /** Hány helyes válasz kell játékidőhöz; a szerver küldi a reward_policy-ből. */
  minCorrectForCoupon: number;
  hasCoupon: boolean;
  /** Ezt a szakaszt ma már jutalmazta a rendszer. */
  alreadyRewarded: boolean;
  weakConceptIds: string[];
};

export type ProbaMessage =
  | { kind: "coupon" }
  /** Ma már kapott ezért a szakaszért — nem hiba, csak nincs újabb. */
  | { kind: "already_rewarded"; text: string }
  /** Jól ment, de kevés a helyes válasz a küszöbhöz. */
  | { kind: "need_more_correct"; text: string; missing: number }
  /** Vannak gyenge fogalmak — ezeket kell átnézni. */
  | { kind: "review"; text: string; weakConceptIds: string[] };

export function probaMessage(input: ProbaMessageInput): ProbaMessage {
  if (input.hasCoupon) return { kind: "coupon" };

  if (input.alreadyRewarded) {
    return {
      kind: "already_rewarded",
      text: "Ezért a szakaszért ma már kaptál játékidőt. A gyakorlás viszont most is számít!",
    };
  }

  // Sorrend: ha van gyenge fogalom, azt kell átnézni — az fontosabb, mint a darabszám.
  if (input.weakConceptIds.length > 0) {
    return {
      kind: "review",
      text: "Ez még nem elég a játékidőhöz. Nézd át ezeket, aztán próbáld újra:",
      weakConceptIds: input.weakConceptIds,
    };
  }

  const missing = Math.max(0, input.minCorrectForCoupon - input.correctCount);
  if (missing > 0) {
    return {
      kind: "need_more_correct",
      text:
        `Szép munka: ${input.correctCount}/${input.total} lett. Játékidőhöz ` +
        `${input.minCorrectForCoupon} helyes válasz kell — még ${missing} hiányzik. ` +
        "Haladj tovább a következő szakasszal, ott összejön!",
      missing,
    };
  }

  // Minden helyes, a küszöb is megvan, kupon mégsincs: nem találunk ki magyarázatot.
  return {
    kind: "review",
    text: "Ez most nem ért játékidőt. Próbáld újra egy kicsit később.",
    weakConceptIds: [],
  };
}
