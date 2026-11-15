import type { VocabEntry } from "./types";
import { VOCAB_FR_L0 } from "./fr/level-0";
import { VOCAB_FR_L1 } from "./fr/level-1";
import { VOCAB_FR_L2 } from "./fr/level-2";
import { VOCAB_FR_L3 } from "./fr/level-3";
import { VOCAB_FR_L4 } from "./fr/level-4";

/** Francia gyűjtőfájl — csak dinamikus importtal töltendő (külön Vite-darab: `vocab-fr-<hash>.js`). */
export const VOCAB_FR: VocabEntry[] = [...VOCAB_FR_L0, ...VOCAB_FR_L1, ...VOCAB_FR_L2, ...VOCAB_FR_L3, ...VOCAB_FR_L4];
export { VOCAB_FR_STAGE } from "./fr/stage";
