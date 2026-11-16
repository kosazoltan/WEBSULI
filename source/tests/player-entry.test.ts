import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";

// A `tsconfig.json` `jsx: "preserve"` (a Vite végzi az átalakítást); a node-os tesztben a `React` globálisként kell.
(globalThis as { React?: typeof React }).React = React;

import PlayerEntry from "../client/src/components/PlayerEntry";
import { PLAYER_ACCOUNT_KEY, PLAYER_ME_KEY, PLAYER_STATUS_KEY, playerAccountKey } from "../client/src/hooks/usePlayer";

/**
 * J8-belépő — a Játékok oldal „Belépés” / „Fiókom” belépője (végrehajtás „J8-belépő”). Statikus renderelés a gyorsítótárba
 * előre betöltött állapotokkal; a böngészős mérés (≥ 48 px, átfedés, 3 nézet) a tests/player-entry.spec.ts-ben.
 */

type Seed = { status?: { enabled: boolean } | null; me?: unknown; account?: Record<string, unknown> | null; user?: unknown };

function render(seed: Seed, spy?: { qc?: QueryClient }): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => null } } });
  if (seed.status !== undefined && seed.status !== null) qc.setQueryData(PLAYER_STATUS_KEY, seed.status);
  if (seed.me !== undefined) qc.setQueryData(PLAYER_ME_KEY, seed.me);
  if (seed.account) qc.setQueryData(playerAccountKey(String(seed.account.id)), seed.account);
  if (!(seed.status?.enabled === false)) qc.setQueryData(["/api/auth/user"], seed.user === undefined ? null : seed.user);
  if (spy) spy.qc = qc;
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client: qc }, createElement(Router, { ssrPath: "/games", children: createElement(PlayerEntry) })),
  );
}

const ME = { id: "p-1", nickname: "Villám Róka", needsProfile: false };
const ACCOUNT = { id: "p-1", nickname: "Villám Róka", avatar: "star-sun", needsProfile: false, maskedEmail: "d***@p***.hu", googleLinked: false, learnerLinked: false, createdAt: "2026-11-16T10:00:00.000Z" };

test("flag KI: semmit nem renderel (a mai kinézet változatlan)", () => {
  assert.equal(render({ status: { enabled: false } }), "");
  // Hiába van játékos-adat a gyorsítótárban, a flag KI dönt.
  assert.equal(render({ status: { enabled: false }, me: ME }), "");
  // Kikapcsolt flagnél a belépő nem indít admin-munkamenet lekérést (a mai kérés-készlet változatlan).
  const spy: { qc?: QueryClient } = {};
  render({ status: { enabled: false } }, spy);
  assert.equal(spy.qc!.getQueryCache().find({ queryKey: ["/api/auth/user"] }), undefined);
  assert.equal(spy.qc!.getQueryCache().find({ queryKey: PLAYER_ME_KEY }), undefined);
});

test("a státusz még tölt / hibázott (nincs adat): semmit nem renderel", () => {
  assert.equal(render({}), "");
});

test("flag BE + kijelentkezve: „Belépés” a /belepes-re, első látogatáskor magyarázattal, jelszó és párbaj-ígéret nélkül", () => {
  const html = render({ status: { enabled: true }, me: null });
  assert.match(html, /data-testid="link-player-login"/);
  assert.match(html, /href="\/belepes"/);
  assert.match(html, />Belépés</);
  assert.match(html, /data-testid="player-entry-hint"/);
  assert.match(html, /becenevet meg avatart/);
  assert.doesNotMatch(html, /párbaj/i, "nem ígérünk olyat, ami még nincs a fiókban");
  assert.doesNotMatch(html, /link-player-account/);
});

test("flag BE + belépve: „Fiókom” a szerver-becenévvel és avatarral, a /fiok-ra visz", () => {
  const html = render({ status: { enabled: true }, me: ME, account: ACCOUNT });
  assert.match(html, /href="\/fiok"/);
  assert.match(html, /data-testid="link-player-account"/);
  assert.match(html, /data-testid="player-entry-nickname"[^>]*>Villám Róka</);
  assert.match(html, /data-avatar="star-sun"/);
  assert.doesNotMatch(html, /link-player-login/);
});

test("a becenév szövegként jelenik meg (XSS) és csonkolódik: truncate + min-w-0 a hosszú névhez", () => {
  const nick = `<img src=x onerror="window.__xss=1">`.padEnd(40, "W");
  const html = render({ status: { enabled: true }, me: { ...ME, nickname: nick } });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
  assert.match(html, /class="truncate [^"]*" data-testid="player-entry-nickname"/);
  assert.match(html, /class="flex min-w-0 flex-1 flex-col/);
});

test("belépve, de még nincs becenév: „Válassz becenevet!”, a /fiok-ra visz", () => {
  const html = render({ status: { enabled: true }, me: { id: "p-2", nickname: null, needsProfile: true } });
  assert.match(html, /href="\/fiok"/);
  assert.match(html, /Válassz becenevet!/);
});

test("tiltott fiók korlátozott munkamenettel: „Fiókom” a /fiok-ra, becenév és avatar nélkül, nincs hiba", () => {
  const html = render({ status: { enabled: true }, me: { banned: true } });
  assert.match(html, /href="\/fiok"/);
  assert.match(html, /Adataim és beállításaim/);
  assert.doesNotMatch(html, /data-avatar=/);
  assert.doesNotMatch(html, /link-player-login/);
});

test("felnőtt / admin munkamenet mellett nem hiteti el, hogy simán be lehet lépni játékosként", () => {
  const html = render({ status: { enabled: true }, me: null, user: { id: "u-1", isAdmin: true } });
  assert.match(html, /felnőtt vagy admin fiókkal vagy belépve/);
  assert.match(html, /href="\/belepes"/);
  assert.doesNotMatch(html, /link-player-account/);
});

test("a belépő csak a játékos-kulcsokat használja (a fiók-gyorsítótár kulcsa a játékos azonosítóját tartalmazza)", () => {
  assert.deepEqual(playerAccountKey("p-1"), [PLAYER_ACCOUNT_KEY[0], "p-1"]);
});
