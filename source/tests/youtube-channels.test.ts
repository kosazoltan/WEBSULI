import assert from "node:assert/strict";
import test from "node:test";

import { fnv1a, pickYoutubeChannel, YOUTUBE_CHANNELS } from "../shared/youtube-channels";
import { newsletterHtml } from "../shared/newsletter";

/** docs/specs/2026-10-31-hirlevel-youtube-ajanlo.md */

test("bank: egyedi azonosítók, https-es YouTube-URL-ek, értelmes évfolyamsávok", () => {
  assert.equal(new Set(YOUTUBE_CHANNELS.map((c) => c.id)).size, YOUTUBE_CHANNELS.length, "az id-k egyediek");
  for (const c of YOUTUBE_CHANNELS) {
    assert.match(c.url, /^https:\/\/www\.youtube\.com\//, c.id);
    assert.ok(c.grades[0] >= 1 && c.grades[1] <= 12 && c.grades[0] <= c.grades[1], `${c.id}: évfolyamsáv`);
    assert.ok(c.name.trim() && c.description.trim() && c.keywords.length > 0, `${c.id}: kitöltött mezők`);
  }
});

test("érdeklődés-illesztés: történelem-érdeklődésű 6.-os történelem-témájú csatornát kap", () => {
  for (let day = 1; day <= 10; day++) {
    const c = pickYoutubeChannel(["történelem", "lovagok"], 6, `2026-11-0${day % 9 + 1}|l1`);
    assert.ok(c, "van csatorna");
    assert.ok(["tizes-lista", "tortenelem-tananyagtar", "videotanar"].includes(c.id), `témába vágó, kapott: ${c.id}`);
    assert.ok(c.keywords.some((k) => k.startsWith("tortenel")), `${c.id}: történelem-kulcsszavas`);
  }
});

test("általános ajánlás: nem illő érdeklődésű 2.-os a kicsiknek szóló csatornát kapja", () => {
  assert.equal(pickYoutubeChannel(["foci"], 2, "2026-11-02|l1")?.id, "kerekmese");
  assert.equal(pickYoutubeChannel([], 2, "2026-11-03|l2")?.id, "kerekmese");
});

test("évfolyamsávon kívül (0. évfolyam) nincs ajánlás", () => {
  assert.equal(pickYoutubeChannel(["történelem"], 0, "2026-11-02|l1"), null);
});

test("determinizmus: azonos seed azonos csatornát ad (aznapi újrapróba)", () => {
  const a = pickYoutubeChannel(["űrkutatás", "tudomány"], 7, "2026-11-02|l1");
  const b = pickYoutubeChannel(["űrkutatás", "tudomány"], 7, "2026-11-02|l1");
  assert.equal(a?.id, b?.id);
});

test("rotáció: több illő csatornánál a seed-tér legalább két különböző csatornát ad", () => {
  const ids = new Set<string>();
  for (let i = 0; i < 20; i++) ids.add(pickYoutubeChannel([], 6, `2026-11-${String(i + 1).padStart(2, "0")}|l1`)!.id);
  assert.ok(ids.size >= 2, `rotáció a napok között, kapott: ${[...ids].join(", ")}`);
});

test("fnv1a: determinisztikus, nem-negatív", () => {
  assert.equal(fnv1a("2026-11-02|l1"), fnv1a("2026-11-02|l1"));
  assert.ok(fnv1a("") >= 0 && fnv1a("x") >= 0);
});

test("levélsablon: channel-lel van VIDEÓ-AJÁNLÓ blokk (név + URL, escape-elve), nélküle nincs", () => {
  const base = { first: "Marci", title: "Cím", teaser: "Teaser.", question: "Miért?", articleUrl: "https://qubit.hu/a" };
  const html = newsletterHtml({ ...base, channel: { name: "Szertár <és> társai", url: "https://www.youtube.com/szertar?a=1&b=2", description: "Kísérletek." } });
  assert.match(html, /VIDEÓ-AJÁNLÓ/);
  assert.match(html, /Szertár &lt;és&gt; társai/, "a név escape-elve");
  assert.match(html, /https:\/\/www\.youtube\.com\/szertar\?a=1&amp;b=2/, "az URL escape-elve");
  assert.doesNotMatch(newsletterHtml(base), /VIDEÓ-AJÁNLÓ/, "channel nélkül nincs blokk");
  assert.doesNotMatch(newsletterHtml({ ...base, channel: null }), /VIDEÓ-AJÁNLÓ/, "null channel: nincs blokk");
});
