import type { VocabEntry } from "./types";
import { VOCAB_DE_L0 } from "./de/level-0";
import { VOCAB_DE_L1 } from "./de/level-1";
import { VOCAB_DE_L2 } from "./de/level-2";
import { VOCAB_DE_L3 } from "./de/level-3";
import { VOCAB_DE_L4 } from "./de/level-4";

/** Német gyűjtőfájl — csak dinamikus importtal töltendő (külön Vite-darab: `vocab-de-<hash>.js`). */
export const VOCAB_DE: VocabEntry[] = [...VOCAB_DE_L0, ...VOCAB_DE_L1, ...VOCAB_DE_L2, ...VOCAB_DE_L3, ...VOCAB_DE_L4];
export { VOCAB_DE_STAGE } from "./de/stage";
