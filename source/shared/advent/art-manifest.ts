/**
 * Adventi naptár — a KÉSZ képek jegyzéke: azonosító → fájlnév a `client/public/advent/2026/` alatt (tartalom-hash a névben).
 * A tulajdonos válogatása után az `approve-advent.ts` írja (S3c); addig üres, és a felület helyőrzőket mutat.
 */
export const ADVENT_ART_BASE = "/advent/2026/";
export const ADVENT_ART: Readonly<Record<string, string>> = {};
