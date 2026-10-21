import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { SPEECH_BRIDGE_SCRIPT } from "../server/lib/speech-bridge";
import { serializeResults } from "../client/src/lib/speech-bridge-host";

/* Spec 2026-10-21-diktalas-hid: a kereszt-domaines tananyag-keret diktálása a főoldalon fut (a gyökérok javítása). */

function frameContext(opts: { framed: boolean }) {
  const posted: Array<Record<string, unknown>> = [];
  const listeners: Array<(ev: { source: unknown; data: unknown }) => void> = [];
  const parent = { postMessage: (data: Record<string, unknown>) => posted.push(data) };
  const win: Record<string, unknown> = {
    addEventListener: (type: string, fn: (ev: { source: unknown; data: unknown }) => void) => { if (type === "message") listeners.push(fn); },
  };
  win.self = win;
  win.top = opts.framed ? {} : win;
  win.parent = opts.framed ? parent : win;
  const timers: Array<() => void> = [];
  const context = vm.createContext({ window: win, document: { documentElement: { lang: "hu" } }, setTimeout: (fn: () => void) => { timers.push(fn); return 0; }, console });
  vm.runInContext(SPEECH_BRIDGE_SCRIPT.replace(/^<script>|<\/script>$/g, ""), context);
  const fromParent = (data: Record<string, unknown>) => listeners.forEach((fn) => fn({ source: parent, data }));
  return { win, posted, fromParent, timers, parent };
}

test("diktálás-híd: keretben a SpeechRecognition a főoldalnak küld, az eredmény a natív alakban érkezik vissza", () => {
  const { win, posted, fromParent } = frameContext({ framed: true });
  const SR = win.webkitSpeechRecognition as new () => Record<string, unknown> & { start(): void };
  assert.equal(win.SpeechRecognition, SR, "mindkét név a hídra mutat");
  const engine = new SR();
  engine.lang = "en-GB";
  const events: string[] = [];
  let transcript = "";
  engine.onresult = (e: { resultIndex: number; results: Array<Array<{ transcript: string }> & { isFinal: boolean }> }) => {
    const r = e.results[e.resultIndex];
    events.push(`result:${r.isFinal}`); transcript = r[0].transcript;
  };
  engine.onend = () => events.push("end");
  engine.start();
  assert.equal(posted[0].type, "websuli-sr:start");
  assert.equal(posted[0].lang, "en-GB");
  const id = posted[0].id;
  fromParent({ type: "websuli-sr:ack", id });
  fromParent({ type: "websuli-sr:result", id, resultIndex: 0, results: [{ isFinal: true, alternatives: [{ transcript: "Hello teacher" }] }] });
  fromParent({ type: "websuli-sr:end", id });
  assert.deepEqual(events, ["result:true", "end"]);
  assert.equal(transcript, "Hello teacher");
});

test("diktálás-híd: a főoldal hibája látható hibaként ér vissza; idegen forrás üzenete hatástalan; keret nélkül nincs híd", () => {
  const { win, posted, fromParent } = frameContext({ framed: true });
  const SR = win.SpeechRecognition as new () => Record<string, unknown> & { start(): void };
  const engine = new SR();
  const errors: string[] = [];
  engine.onerror = (e: { error: string }) => errors.push(e.error);
  engine.start();
  fromParent({ type: "websuli-sr:error", id: posted[0].id, error: "not-allowed" });
  assert.deepEqual(errors, ["not-allowed"]);
  const unframed = frameContext({ framed: false });
  assert.equal(unframed.win.SpeechRecognition, undefined, "külön lapon a natív felismerés marad (a híd nem települ)");
});

test("diktálás-híd: ha nincs WebSuli-főoldal (nincs nyugta), nem ragad be — hibával lezárul", () => {
  const { win, timers } = frameContext({ framed: true });
  const SR = win.SpeechRecognition as new () => Record<string, unknown> & { start(): void };
  const engine = new SR();
  const seen: string[] = [];
  engine.onerror = (e: { error: string }) => seen.push(`error:${e.error}`);
  engine.onend = () => seen.push("end");
  engine.start();
  timers.forEach((t) => t());
  assert.deepEqual(seen, ["error:service-not-allowed", "end"]);
});

test("diktálás-híd (főoldal): a felismerés eredménye klónozható alakban, a resultIndex-től", () => {
  const alt = (t: string) => ({ transcript: t, confidence: 0.9 });
  const r1 = Object.assign([alt("első")], { isFinal: true });
  const r2 = Object.assign([alt("második"), alt("masodik")], { isFinal: false });
  assert.deepEqual(serializeResults([r1, r2], 1), [{ isFinal: false, alternatives: [alt("második"), alt("masodik")] }]);
});
