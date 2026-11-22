// Tesztsegéd: a FŐÁG kitakarói változatlan másolatban, a „nem gyengébb a főágnál” regressziós összevetéshez
// (docs/specs/2026-11-19-kitakaro-negyzetes-regex.md, 12. pont — szűkítés, tulajdonos 2026-11-22).
// Forrás: origin/main 114eaa638e3be01a616217f397f684c38210c8a1 —
//   scripts/qa/gates/lib.mjs `REDACTIONS` + `redact`, scripts/qa/gates/external-review.mjs `maskSecrets`,
//   source/scripts/design-assets/lib.ts `redact`. Szándékosan NEM `git show`-val olvassuk futáskor: a CI sekély klónjában
//   az origin/main nem elérhető. A regexek a főág alakjában (`{n,}`) vannak — csak kis bemeneten futtatandók.

const REDACTIONS = [
  [/postgres(?:ql)?:\/\/[^\s"'`<>]+/gi, '<db-url>'],
  [/\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{16,}\b/g, '<token>'],
  [/\bgithub_pat_[A-Za-z0-9_]{16,}\b/g, '<token>'],
  [/\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}\b/g, '<token>'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '<aws-key>'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g, 'Bearer <token>'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, '<email>'],
];

/** A főág kapu-`redact`-ja. */
export function mainRedact(text) {
  let out = String(text ?? '');
  for (const [re, rep] of REDACTIONS) out = out.replace(re, rep);
  return out;
}

/** A főág külső ellenőri `maskSecrets`-e (a hívók utána `.slice(0, n)`-nel vágtak). */
export function mainMaskSecrets(s, key) {
  let out = String(s ?? "");
  if (key) out = out.split(key).join("***");
  return out.replace(/AIza[0-9A-Za-z_\-]{20,}/g, "AIza***");
}

/** A főág képgyártói `redact`-ja (a hibaág utána `.slice(0, 300)`-zal vágott). */
export function mainDesignRedact(text, key) {
  let out = key ? text.split(key).join("[kulcs]") : text;
  out = out.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [kulcs]").replace(/sk-or-[A-Za-z0-9_-]+/g, "[kulcs]");
  return out;
}
