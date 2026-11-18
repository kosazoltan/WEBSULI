import { useEffect, useState } from "react";
import { loadVocabBank } from "../../data/vocabBank/loader";
import type { VocabLang } from "../../data/vocabBank/types";
import { createSeenHistory, type StorageLike } from "./seenHistory";
import { createVocabSource, type VocabSource } from "./vocabSource";

/** A böngésző localStorage-a, ha elérhető; különben null (a napló ilyenkor futáson belüli memóriában él). */
export function safeLocalStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch (_err) {
    return null;
  }
}

/**
 * A szóbank-forrás egy játékhoz. `null`, amíg tölt, ha `enabled === false`, vagy ha a betöltés hibázott — a játék
 * ilyenkor a meglévő kézi bankkal megy (terv 5. szakasz). A hibaágon nincs konzolírás (az e2e konzolhiba-mérés
 * miatt). A szóbank bekötése ezzel az egy hívással kapcsolható ki.
 *
 * A hiányos mondat itt a rövid JÁTÉK-ALAKÚ (`clozeStyle: "game"`, kanban #50): fordítás nélkül, a 9 mp-es válaszablakban
 * olvasható, egyértelmű elterelőkkel — a hét játék ezen a hookon át kapja.
 */
export function useVocabQuizSource(lang: VocabLang, enabled: boolean = true): VocabSource | null {
  const [source, setSource] = useState<VocabSource | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSource(null);
      return;
    }
    let cancelled = false;
    setSource(null);
    loadVocabBank(lang).then(
      entries => {
        if (!cancelled) setSource(createVocabSource({ lang, entries, history: createSeenHistory(safeLocalStorage()), clozeStyle: "game" }));
      },
      () => {
        if (!cancelled) setSource(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [lang, enabled]);

  return source;
}
