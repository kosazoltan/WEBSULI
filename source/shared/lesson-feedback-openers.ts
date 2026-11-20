/**
 * Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (S5a; alap: docs/specs/2026-11-18-tananyag-gyartas-minoseg.md S5a): a válasz
 * utáni bátorító / megerősítő nyitás kódszótárból, évfolyamsávonként, kérdésenként a magból választva. A modell csak a tartalmi
 * indoklást írja; a mért egyhangúság oka (a hibás válaszok 46,8%-a „Jó próba…”) a promptba írt mintamondat volt.
 *
 * Csak a `variety` jelölővel mentett (a `STUDIO_LESSON_VARIETY` kapcsolóval gyártott) leckén hat — a jelöletlen lecke megjelenítése
 * változatlan (önálló beolvaszthatóság). Tiszta modul: DOM és környezeti változó nélkül.
 */
import type { AgeBand } from "./lesson-schema";
import { choiceSeed } from "./option-order";
import { seedFrom, seededPick } from "./seeded";
import { stripVerdictPrefix } from "./lesson-ui-text";

/** A lecke jelölőjének verziója: a lejátszó ebből tudja, hogy a nyitást a kód adja. */
export const LESSON_VARIETY_VERSION = "valtozatossag-1";

export type LessonVarietyMarker = { version: string };

/**
 * Sávonként hibás- és helyes-nyitás. Szabályok (teszt: tests/lesson-feedback-openers.test.ts): ≤ 40 karakter, írásjellel zárul, egyedi,
 * egy kezdőszó a lista legfeljebb 15%-a; a nyitás nem ígér és nem minősít (nem állítja, hogy a válasz „majdnem jó” volt), és az
 * ítélet („Még nem helyes.” / „Helyes!”) után természetesen olvasható. Hangnem: `kid` meleg, egyszerű; `teen` közvetlen, nem gyerekes;
 * `senior` tárgyszerű.
 */
export const FEEDBACK_OPENERS: Record<AgeBand, { wrong: readonly string[]; right: readonly string[] }> = {
  kid: {
    wrong: [
      "Semmi baj, nézzük meg együtt!", "Nem gond, ebből tanulunk.", "Gyere, keressük meg a kulcsot!", "Próbáljuk meg másképp!",
      "Hibázni szabad, ettől tanulsz.", "Nézd csak, mi történt itt!", "Ez egy jó tanulási pillanat.", "Lépjünk vissza egyet!",
      "Kis nyomozás következik.", "Figyeld, hol csúszott el!", "Ne aggódj, megoldjuk.", "Most jön a titok nyitja.",
      "Ezt sokan elsőre így gondolják.", "Kapaszkodj, megmutatom!", "Vegyük sorra a lépéseket!", "Egy apró részlet a kulcs.",
      "Ez is közelebb visz a megoldáshoz.", "Bátran próbálkoztál!", "Gondoljuk át újra!", "Itt egy kis segítség.",
      "Mindjárt kiderül, miért.", "Kövesd velem a nyomot!", "Tanulni épp így kell.", "Örülök, hogy megpróbáltad!",
    ],
    right: [
      "Eltaláltad!", "Ügyes vagy!", "Hurrá, ez az!", "Remek munka!", "Nagyon jól gondoltad!", "Telitalálat!",
      "Ez bizony így van!", "Csillagos ötös!", "Jól figyeltél!", "Bravó!", "Kitűnő!", "Pompás, mehetünk tovább!",
      "Ez igen!", "Fantasztikus!", "Hajrá, így tovább!", "Klassz!", "Éljen, sikerült!", "Mesteri!",
    ],
  },
  teen: {
    wrong: [
      "Nézzük meg, hol csúszott el.", "Ez gyakori tévedés.", "Érdemes még egyszer átgondolni.", "Itt egy apró részlet dönt.",
      "Nem baj, ebből lehet tanulni.", "Vegyük végig lépésenként.", "Ebbe a csapdába sokan beleesnek.", "Figyeld meg a különbséget.",
      "Most összeáll a kép.", "Nézzük pontosan, mi a helyzet.", "Hasznos hiba: sokat elárul.", "Gondold át még egyszer!",
      "Egy kis pontosítás jön.", "Mutatom, mi a trükk.", "Semmi gáz, kibogozzuk.", "Kövessük a gondolatmenetet.",
      "Kulcskérdés: mit kér a feladat?", "Ezen sokan elakadnak.", "Lássuk, mi a helyes út.", "Tanulságos válasz volt.",
      "Próbáljuk meg más szemmel.", "Ilyenkor érdemes visszalépni.", "Bontsuk szét a feladatot.", "A részletekben van a válasz.",
    ],
    right: [
      "Pontos válasz!", "Így kell ezt!", "Remek gondolatmenet!", "Telitalálat!", "Ügyesen kiszúrtad!", "Ez a kulcs!",
      "Éles szem!", "Szépen dolgoztál!", "Stimmel!", "Megvan!", "Precíz!", "Kifogástalan!",
      "Profi megoldás!", "Ez ül!", "Le a kalappal!", "Hibátlan!", "Nagyon jó!", "Erős válasz!",
    ],
  },
  senior: {
    wrong: [
      "Érdemes újragondolni.", "Nézzük meg a gondolatmenetet.", "Ez tipikus buktató.", "A részlet itt döntő.",
      "Vizsgáljuk meg közelebbről.", "Itt egy finom különbség van.", "Ebből sokat lehet tanulni.", "Gyakori félreértés.",
      "Bontsuk elemeire a kérdést.", "Pontosítsunk egy ponton.", "Lássuk, hol tér el az érvelés.", "Ez a megközelítés félrevisz.",
      "Térjünk vissza a definícióhoz.", "Ellenőrizzük a feltételeket.", "Hasznos tévedés, nézzük az okát.", "Más szempontból tisztább.",
      "Gondoljuk végig lépésenként.", "Mérlegeljük újra a lehetőségeket.", "Kövessük a logikát.", "Ilyenkor érdemes visszalépni.",
      "Figyeljünk a pontos megfogalmazásra.", "Tanulságos eset.", "Rendezzük a gondolatokat.", "Vessük össze a lehetőségeket.",
    ],
    right: [
      "Pontos.", "Helytálló.", "Korrekt gondolatmenet.", "Megalapozott válasz.", "Precíz megoldás.", "Kiváló érvelés.",
      "Ez a lényeg.", "Jól látod.", "Telitalálat.", "Meggyőző.", "Stimmel.", "Hibátlan.",
      "Logikus következtetés.", "Alapos válasz.", "Világos gondolatmenet.", "Szabatos.", "Lényegre törő.", "Átgondolt válasz.",
    ],
  },
};

/** A nyitás kulcsa: a térkép és a kérdés tartalma (a Tananyag lap `check` blokkjának nincs azonosítója — terv 4. szakasz 3. pont). */
export function feedbackOpenerKey(mapId: string, question: string, options: readonly string[]): string {
  return `${mapId}\u0002${choiceSeed(question, options)}`;
}

/** A kérdés nyitása: a magból választva — ugyanarra a kulcsra mindig ugyanaz (újratöltésen és mentett válasznál is). */
export function feedbackOpener(kind: "right" | "wrong", band: AgeBand, key: string): string {
  return seededPick(FEEDBACK_OPENERS[band][kind], seedFrom(`${kind}\u0001${key}`))!;
}

// A régi, modell írta nyitás: a bátorító fordulat KÖZVETLENÜL írásjellel (és esetleg „de / azonban / ám” kötéssel) folytatva. A „Jó,
// hogy…”, „Szépen látszik…”, „Majdnem minden…” tartalmi kezdet, nem vágódik (a fordulat után nem írásjel áll).
const LEGACY_OPENER = new RegExp(
  String.raw`^\s*(?:jó\s+próba(?:lkozás)?|szép\s+próbálkozás|ügyes\s+(?:gondolat|próbálkozás|próba)|jó\s+(?:gondolat|ötlet|megérzés|meglátás)` +
    String.raw`|majdnem(?:\s+jó)?|szuper|remek|nagyszerű|kiváló|ügyes|szép\s+munka|jól\s+gondoltad)` +
    String.raw`\s*(?:[,;:–—-]\s*(?:de|azonban|ám)(?=\s)|[.!,;:–—-])\s*`,
  "iu",
);

/** A régi bátorító előtag levágása; 12 karakternél rövidebb maradéknál az eredeti szöveg marad. A maradék nagybetűvel kezdődik. */
export function stripLegacyOpener(text: string): string {
  const rest = text.replace(LEGACY_OPENER, "");
  if (rest === text || rest.trim().length < 12) return text;
  return rest.charAt(0).toLocaleUpperCase("hu-HU") + rest.slice(1);
}

/**
 * A visszajelzés megjelenítése. Jelöletlen lecke: a mai kimenet (az ítélet-előtag levágása). Jelölt lecke: a kódszótári nyitás és a
 * régi bátorító előtag nélküli indoklás (a kapcsolóval gyártott leckében a modell nem ír nyitást — ha mégis, itt levágódik).
 */
export function feedbackView(input: {
  right: boolean;
  text: string;
  variety: { marker: LessonVarietyMarker | undefined; band: AgeBand; key: string } | undefined;
}): { opener?: string; reason: string } {
  const reason = stripVerdictPrefix(input.text, input.right);
  if (!input.variety?.marker) return { reason };
  return { opener: feedbackOpener(input.right ? "right" : "wrong", input.variety.band, input.variety.key), reason: reason ? stripLegacyOpener(reason) : reason };
}

/**
 * Mentéskor: BE kapcsolónál a szerver írja a jelölőt; KI kapcsolónál a (modelltől esetleg jött) jelölő törlődik — a jelölőt kizárólag
 * a szerver adhatja. Nem lecke alakú bemenetet változatlanul ad vissza.
 */
export function withVarietyMarker<T>(lesson: T, enabled: boolean): T {
  if (!lesson || typeof lesson !== "object" || Array.isArray(lesson)) return lesson;
  const { variety: _dropped, ...rest } = lesson as Record<string, unknown>;
  return (enabled ? { ...rest, variety: { version: LESSON_VARIETY_VERSION } } : rest) as T;
}
