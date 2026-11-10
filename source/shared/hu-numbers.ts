/**
 * Számok magyar kiolvasása a kisfilm hangjához (spec 2026-11-10-fejezet-kisfilmek-v2, 9e). A hangmodell a számjegyet bizonytalanul
 * olvassa, a forgatókönyvíró pedig elgépelheti a kiírt számot (mért eset: „Százthúsz”) — ezért a felolvasandó szövegben a számjegyeket
 * a program írja át szavakká. Tiszta függvények.
 */
const ONES = ["", "egy", "kettő", "három", "négy", "öt", "hat", "hét", "nyolc", "kilenc"];
const TENS = ["", "tíz", "húsz", "harminc", "negyven", "ötven", "hatvan", "hetven", "nyolcvan", "kilencven"];

function below1000(n: number): string {
  let out = "";
  const hundreds = Math.floor(n / 100), rest = n % 100, tens = Math.floor(rest / 10), ones = rest % 10;
  if (hundreds) out += (hundreds === 1 ? "" : hundreds === 2 ? "két" : ONES[hundreds]) + "száz";
  if (tens === 1 && ones) out += "tizen" + ONES[ones];
  else if (tens === 2 && ones) out += "huszon" + ONES[ones];
  else out += TENS[tens] + ONES[ones];
  return out;
}

/** Egész szám (0 – 999 999) magyarul; a tartományon kívül a számjegyek maradnak. */
export function huNumberWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999) return String(n);
  if (n === 0) return "nulla";
  const thousands = Math.floor(n / 1000), rest = n % 1000;
  const head = thousands ? (thousands === 1 ? "" : below1000(thousands).replace(/kettő$/, "két")) + "ezer" : "";
  // 2000 fölött az ezresek és a maradék közé kötőjel kerül (kétezer-ötszáz); a kiejtést ez nem érinti.
  return head + (thousands && rest && n > 2000 ? "-" : "") + (rest ? below1000(rest) : "");
}

const FRACTION = ["", "tized", "század", "ezred"];
/** A szöveg számjegyei szavakkal: egészek és (legfeljebb három tizedesjegyű) tizedes törtek; a többi változatlan. */
export function spokenHu(text: string): string {
  return text.replace(/(\d{1,6})(?:[.,](\d{1,3}))?(?!\d)/g, (match, whole: string, fraction?: string) => {
    if (whole.length > 1 && whole.startsWith("0")) return match;
    const base = huNumberWords(Number(whole));
    return fraction ? `${base} egész ${huNumberWords(Number(fraction))} ${FRACTION[fraction.length]}` : base;
  });
}
