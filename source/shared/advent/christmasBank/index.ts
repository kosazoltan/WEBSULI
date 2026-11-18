import type { ChristmasItem } from "../assignment";
import { CHRISTMAS_01_04 } from "./items-01-04";
import { CHRISTMAS_05_08 } from "./items-05-08";
import { CHRISTMAS_09_12 } from "./items-09-12";

/**
 * Adventi naptár — a teljes karácsonyi kérdéskészlet (1–12. évfolyam). Csak a szerver és a tesztek importálják: a kérdést a
 * szerver adja ki, a helyes válasz a kliens-csomagba nem kerül.
 */
export const CHRISTMAS_ITEMS: readonly ChristmasItem[] = [...CHRISTMAS_01_04, ...CHRISTMAS_05_08, ...CHRISTMAS_09_12];
