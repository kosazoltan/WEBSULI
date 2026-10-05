/**
 * Review #193 (9): kézzel jóváhagyott kizárás-lista a tantárgyi skill MINTATÉTELEIHEZ. A szülő-ellenőrzött korpuszban is akad
 * hibás kulcs; ami ide kerül, abból nem lesz minta a skillben (a bank-sor marad, a tulajdonos a forrás-leckét javíthatja).
 * Kulcs: a tétel lenyomata (`fingerprint`); indok kötelező. Új sor = kézi, indokolt döntés.
 */
export const SAMPLE_EXCLUSIONS: Readonly<Record<string, { reason: string; provenance: string }>> = {
  "008d483b4c978586": {
    reason: "Hibás kulcs: a „jegy” + -val/-vel helyesen „jeggyel”; a tétel a kötőjeles „jegy-gyel” alakot jelöli helyesnek.",
    provenance: "legacy_html:37c4179d-0adc-4c2f-a438-997aee7604f3 („5 osztály Magyar Irodalom Jókai Mór”)",
  },
};

export const isExcludedSample = (fingerprint: string): boolean => Object.hasOwn(SAMPLE_EXCLUSIONS, fingerprint);
