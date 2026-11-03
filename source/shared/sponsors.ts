/**
 * Spec 2026-11-03-szponzor-fejlec: a tananyagkészítés támogatói a nyilvános főoldalon. A tulajdonos által megadott címek
 * (bestchange.hu, expresszzalog.hu) végcélja, 2026-11-03-án ellenőrizve: a https://bestchange.hu önaláírt tanúsítványt ad, a
 * http://bestchange.hu a „Exclusive Best Change – a megbízható váltótárs” lapra visz; az expresszzalog.hu a /hu/ kezdőlapra. A logó 2× felbontású WebP.
 */
export type Sponsor = { id: string; name: string; url: string; logo: string; width: number; height: number };

export const SPONSORS: readonly Sponsor[] = [
  { id: "exclusive-change", name: "Exclusive Change", url: "https://www.excbestchange.hu/hu/", logo: "/sponsors/exclusive-change.webp", width: 357, height: 96 },
  { id: "expressz-zalog", name: "Expressz Zálog", url: "https://www.expresszzalog.hu/hu/", logo: "/sponsors/expressz-zalog.webp", width: 287, height: 96 },
];
