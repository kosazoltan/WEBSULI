/**
 * A közös játékréteg gyűjtő-exportja (terv 6.1; végrehajtás J0a + J0b). A játékszeletek innen importálnak:
 * `import { createQuestionDirector, createReviewQueue, createFixedLoop } from "@/game-engine/play";`
 *
 * J0a: fix lépésű hurok, játékérzet (rázás / hitstop / tween), intenzitás-Director. J0b: tanulási mag (típusok, ismétlési
 * sor, áramlat, kombó, hullám, menet-statisztika, kérdés-ütemező + forrás-illesztők). J0c: kérdés-sáv (`InlineQuestion`),
 * `usePlayQuestion` / `useQuestionDirector`, `WhyButton`, `ResultReview`, felolvasás és beállítás. A seedelt RNG a
 * `@shared/game-rng`-ből jön (kliens és szerver közös).
 */
export * from "./types";
export * from "./loop";
export * from "./feel";
export * from "./director";
export * from "./flow";
export * from "./combo";
export * from "./waves";
export * from "./runStats";
export * from "./reviewQueue";
export * from "./questionDirector";
export { wallClockMs } from "./clock";
// J0c — közös UI: kérdés-sáv, „Miért?”, eredmény-lista, felolvasás, beállítás, React-kötés.
export * from "./gameSettings";
export * from "./speech";
export * from "./useQuestionDirector";
export { default as InlineQuestion, INLINE_QUESTION_SKINS, PlaySpeechToggle, type InlineQuestionProps, type InlineQuestionSkin } from "./InlineQuestion";
export { default as WhyButton, type WhyButtonProps } from "./WhyButton";
export { default as ResultReview, RESULT_REVIEW_EXPLANATION_MAX, clipExplanation, type ResultReviewProps } from "./ResultReview";
