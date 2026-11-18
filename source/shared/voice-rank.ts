/**
 * Spec 2026-11-18-tananyag-gyartas-minoseg, S8a (E31): a böngésző hangjainak rangsora a lecke nyelvéhez — tiszta függvény, DOM-típus
 * nélkül (kliens és teszt közös). A böngésző a hangokat tetszőleges sorrendben adja: Windows-on az első `en-GB` hang gyakran a régi,
 * gépies helyi hang, miközben a listában természetes hangzású brit hang is van.
 */
export type RankableVoice = { name: string; lang: string; localService?: boolean; default?: boolean };

/** A gyártók név szerinti minőségjelzői (Edge: „Online (Natural)”, Apple: „(Enhanced)” / „(Premium)”, Android: „Neural”). */
const QUALITY_MARKER = /natural|online|neural|premium|enhanced/i;
/** Régi, gépies helyi motorok jelzői (Windows SAPI „Desktop”, eSpeak, Apple „Compact”). */
const ROBOT_MARKER = /desktop|espeak|compact/i;
/**
 * Ismert, jó minőségű brit hangok a böngészők dokumentált hangneveiből (Chrome: „Google UK English …”; Edge: Sonia, Ryan, Libby,
 * Maisie, Thomas; Apple: Daniel, Kate, Serena, Oliver, Stephanie, Martha, Arthur). Csak `en-GB` leckénél számít.
 */
export const KNOWN_BRITISH_VOICES = ["google uk english", "sonia", "ryan", "libby", "maisie", "thomas", "daniel", "kate", "serena", "oliver", "stephanie", "martha", "arthur"] as const;

const norm = (lang: string) => lang.trim().replace("_", "-").toLowerCase();

/**
 * A nyelvhez használható hangok indexe a legjobbtól a leggyengébbig; más nyelvű hang nem kerül a listába (üres lista: a `lang` dönt).
 * Sorrend: pontos régió (`en-GB`) > azonos nyelv más régió (`en-US`, `en`); ezen belül minőségjelző a névben > ismert brit hangnév >
 * hálózati hang (`localService === false`) > nem gépies helyi hang; azonos pontnál a böngésző eredeti sorrendje.
 */
export function rankVoices(voices: ReadonlyArray<RankableVoice>, language: string): number[] {
  const target = norm(language);
  const base = target.split("-")[0];
  if (!base) return [];
  const british = target === "en-gb";
  const scored: Array<{ index: number; score: number }> = [];
  voices.forEach((voice, index) => {
    const lang = norm(voice?.lang ?? "");
    const exact = lang === target;
    if (!exact && lang !== base && !lang.startsWith(`${base}-`)) return;
    const name = (voice.name ?? "").toLowerCase();
    let score = exact ? 100 : 0;
    if (QUALITY_MARKER.test(name)) score += 16;
    if (british && exact && KNOWN_BRITISH_VOICES.some(known => name.includes(known))) score += 8;
    if (voice.localService === false) score += 4;
    if (!ROBOT_MARKER.test(name)) score += 2;
    scored.push({ index, score });
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map(s => s.index);
}
