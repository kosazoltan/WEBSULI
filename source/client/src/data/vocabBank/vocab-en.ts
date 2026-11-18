import type { VocabEntry } from "./types";
import { VOCAB_EN_L0 } from "./en/level-0";
import { VOCAB_EN_L1 } from "./en/level-1";
import { VOCAB_EN_L2 } from "./en/level-2";
import { VOCAB_EN_L3 } from "./en/level-3";
import { VOCAB_EN_L4 } from "./en/level-4";

/** Angol gyűjtőfájl — csak dinamikus importtal töltendő (külön Vite-darab: `vocab-en-<hash>.js`). */
export const VOCAB_EN: VocabEntry[] = [...VOCAB_EN_L0, ...VOCAB_EN_L1, ...VOCAB_EN_L2, ...VOCAB_EN_L3, ...VOCAB_EN_L4];
export { VOCAB_EN_STAGE } from "./en/stage";
