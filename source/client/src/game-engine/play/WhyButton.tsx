import { Lightbulb } from "lucide-react";

/**
 * J0c — „Miért?” gomb (végrehajtás J0c „Szerződés”; terv 4.1/3, D2, J5; 9. szakasz).
 *
 * Hibás / lejárt válasz után a megoldás-kijelzés alatt és utána még 4 mp-ig látszik (a `usePlayQuestion` `whyVisible`-je
 * dönti el). A játék NEM áll meg magától: csak akkor, ha a gyerek megnyitja.
 *
 * A lap felelőssége (G-1 őr: a `buildFeedback` hívás és a `<QuizFeedbackCard` JSX a LAPON marad):
 *
 *   const [why, setWhy] = useState<FeedbackCard | null>(null);
 *   const openWhy = () => {
 *     const last = q.director?.lastWrong();
 *     if (!last) return;
 *     setPausedForWhy(true);                       // a meglévő szünet-állapot, a PauseMenu NÉLKÜL
 *     setWhy(buildFeedback({ quiz: last.quiz, chosenIndex: last.pickedOriginalIndex, attempt: 1, ageBand: "kid" }));
 *   };
 *   {why && <QuizFeedbackCard card={why} onDismiss={() => { setWhy(null); setPausedForWhy(false); }} />}
 *
 * A kártya a meglévő modális réteget használja (z 90): a „kártya alatt áll az óra” szabály érvényes.
 */
export type WhyButtonProps = { visible: boolean; onOpen: () => void };

export default function WhyButton({ visible, onOpen }: WhyButtonProps) {
  if (!visible) return null;
  return (
    <button type="button" className="play-why" data-testid="play-why" onClick={onOpen} aria-label="Miért ez a jó válasz? Magyarázat (a játék megáll)">
      <Lightbulb className="play-why-icon" aria-hidden="true" />
      <span>Miért?</span>
    </button>
  );
}
