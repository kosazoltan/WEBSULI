import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createGpuTimer, type GpuTimerGl } from "../client/src/game-engine/perf/gpuTimer";

/**
 * `?perf=1` GPU-időmérés kontextusvesztés után (PR #504, Codex P2; terv: docs/specs/2026-11-17-kockavadasz-telefon.md, 6. —
 * „a panel a visszaállás után tovább mér”). Hamis `gl`: a vesztéskor élő lekérdezések a visszaállás után érvénytelenek, a
 * `getQueryParameter` rájuk soha nem ad eredményt — ahogy a valódi WebGL-ben.
 */

type FakeQuery = { generation: number; ready: boolean; ns: number };

function fakeGl() {
  const state = { lost: false, generation: 0, extRequests: 0, deleted: 0, nextNs: 2_000_000 };
  const made: FakeQuery[] = [];
  let open: FakeQuery | null = null;
  const gl: GpuTimerGl = {
    QUERY_RESULT_AVAILABLE: 1,
    QUERY_RESULT: 2,
    getExtension(name) {
      if (name !== "EXT_disjoint_timer_query_webgl2") return null;
      state.extRequests += 1;
      return state.lost ? null : { TIME_ELAPSED_EXT: 10, GPU_DISJOINT_EXT: 11 };
    },
    createQuery() {
      if (state.lost) return null;
      const q: FakeQuery = { generation: state.generation, ready: false, ns: state.nextNs };
      made.push(q);
      return q as unknown as WebGLQuery;
    },
    deleteQuery() {
      state.deleted += 1;
    },
    beginQuery(_target, query) {
      open = query as unknown as FakeQuery;
    },
    endQuery() {
      open = null;
    },
    getQueryParameter(query, pname) {
      const q = query as unknown as FakeQuery;
      // Vesztett kontextuson és régi (érvénytelen) lekérdezésre a WebGL null-t ad.
      if (state.lost || q.generation !== state.generation) return null;
      return pname === 1 ? q.ready : q.ns;
    },
    getParameter() {
      return false;
    },
    isContextLost() {
      return state.lost;
    },
  };
  return {
    gl,
    state,
    /** A GPU „elkészül” a nyitva nem lévő lekérdezésekkel. */
    finishAll() {
      for (const q of made) if (q !== open) q.ready = true;
    },
    lose() {
      state.lost = true;
    },
    restore() {
      state.lost = false;
      state.generation += 1;
    },
  };
}

function frame(timer: ReturnType<typeof createGpuTimer>) {
  timer.poll();
  timer.begin(false);
  timer.end();
}

describe("createGpuTimer", () => {
  it("rendes működés: a kész lekérdezésekből ms-átlag lesz", () => {
    const f = fakeGl();
    const timer = createGpuTimer(f.gl);
    assert.equal(timer.available, true);
    frame(timer);
    f.finishAll();
    frame(timer);
    assert.equal(timer.average(), 2);
  });

  it("kontextusvesztés és visszaállás után a mérés folytatódik (a sor nem akad be, új minta érkezik)", () => {
    const f = fakeGl();
    const timer = createGpuTimer(f.gl);
    // Két függő lekérdezés a vesztés pillanatában.
    frame(timer);
    frame(timer);
    assert.equal(timer.pendingCount, 2);

    f.lose();
    timer.contextLost();
    assert.equal(timer.pendingCount, 0, "a vesztett kontextus lekérdezései eldobva");
    assert.equal(timer.average(), null, "a régi minták eldobva");
    for (let i = 0; i < 6; i++) frame(timer);
    assert.equal(timer.pendingCount, 0, "vesztett kontextuson nem gyűlik lekérdezés");

    f.restore();
    f.state.nextNs = 5_000_000;
    timer.contextRestored();
    assert.equal(timer.available, true);
    assert.ok(f.state.extRequests >= 2, "a kiterjesztés a visszaállás után újra lekérve");
    // A visszaállás után sok képkocka: a sor soha nem telik be, és az új költség jelenik meg.
    for (let i = 0; i < 12; i++) {
      frame(timer);
      f.finishAll();
      assert.ok(timer.pendingCount <= 1, `a sor nem akad be (képkocka ${i}: ${timer.pendingCount})`);
    }
    assert.equal(timer.average(), 5);
  });

  it("ha a vesztés eseménye nem érkezik meg, a poll maga veszi észre a halott kontextust", () => {
    const f = fakeGl();
    const timer = createGpuTimer(f.gl);
    frame(timer);
    frame(timer);
    f.lose();
    timer.poll();
    assert.equal(timer.pendingCount, 0);
    f.restore();
    timer.contextRestored();
    for (let i = 0; i < 8; i++) {
      frame(timer);
      f.finishAll();
    }
    assert.equal(timer.average(), 2);
  });

  it("kiterjesztés nélkül nem mér és nem dob", () => {
    const f = fakeGl();
    f.lose();
    const timer = createGpuTimer(f.gl);
    assert.equal(timer.available, false);
    frame(timer);
    assert.equal(timer.average(), null);
    assert.equal(createGpuTimer(null).available, false);
  });

  it("a szinkron próba alatt (skip) nem indít lekérdezést; a minták törölhetők", () => {
    const f = fakeGl();
    const timer = createGpuTimer(f.gl);
    timer.begin(true);
    timer.end();
    assert.equal(timer.pendingCount, 0);
    frame(timer);
    f.finishAll();
    frame(timer);
    timer.clearSamples();
    assert.equal(timer.average(), null);
    timer.dispose();
    assert.equal(timer.pendingCount, 0);
  });
});
