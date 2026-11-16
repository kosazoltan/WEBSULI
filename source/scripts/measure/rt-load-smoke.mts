/**
 * JM2 — helyi terheléses füstteszt a valós idejű réteghez (terv 10.8 „Kapacitás”, JM-A17 előmérés; a JM11 bővíti).
 *
 *   node --import tsx scripts/measure/rt-load-smoke.mts [szobák=50] [fő/szoba=4] [polling|default]
 *
 * A SZERVER külön gyermekfolyamatban fut (a valódi Express + `/api/rt` router + Socket.IO-kapu, adatbázis nélkül), így a
 * mért heap / RSS / eseményhurok-késés csak a szerveré. A kliensek ebben a folyamatban: szobánként egy gazda + (fő−1)
 * csatlakozó, rövid meccsek (7 kör; a kliensek 150–900 ms után véletlen opciót választanak, így minden kör korán zárul).
 * Kimenet: JSON a mért számokkal (alapállapot, csúcs, a meccsek ideje). Éles rendszerhez NEM kapcsolódik.
 */
import { fork, type ChildProcess } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const SERVER_FLAG = "--rt-load-server";

async function runServer(): Promise<void> {
  const express = (await import("express")).default;
  const { rtConfig } = await import("../../server/realtime/config");
  const { createRealtimeService } = await import("../../server/realtime");
  const { createQuestionProvider } = await import("../../server/realtime/question-provider");
  const { createRtRouter } = await import("../../server/routes/rt");
  const env = {
    MP_MODE: "on",
    MP_MAX_ROOMS: "1000",
    MP_MAX_CONNECTIONS: "10000",
    MP_MAX_CONNECTIONS_PER_IP: "5000",
    MP_TICKETS_PER_MIN_PER_IP: "10000",
    MP_ROOMS_PER_MIN_PER_IP: "10000",
    MP_JOINS_PER_MIN_PER_IP: "10000",
    NODE_ENV: "test",
  };
  const rt = createRealtimeService({
    config: () => rtConfig(env),
    roomConfig: { provider: createQuestionProvider(), timing: { countdownMs: 300, revealMs: 300 } },
    secret: "rt-load-secret-0123456789abcdef0123456789",
    logger: { info: () => {}, warn: () => {} },
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => false;
    next();
  });
  app.use("/api/rt", createRtRouter(rt));
  const loop = monitorEventLoopDelay({ resolution: 1 });
  loop.enable();
  let peakHeap = 0;
  let peakRss = 0;
  setInterval(() => {
    const m = process.memoryUsage();
    peakHeap = Math.max(peakHeap, m.heapUsed);
    peakRss = Math.max(peakRss, m.rss);
  }, 100).unref();
  app.get("/__metrics", (req, res) => {
    if (req.query.gc === "1") (globalThis as unknown as { gc?: () => void }).gc?.();
    const m = process.memoryUsage();
    res.json({
      heapUsed: m.heapUsed,
      rss: m.rss,
      peakHeap,
      peakRss,
      loopP50: loop.percentile(50) / 1e6,
      loopP99: loop.percentile(99) / 1e6,
      loopMax: loop.max / 1e6,
      status: rt.status(),
      counters: rt.metrics.counters,
      rejected: rt.metrics.rejectedSnapshot(),
    });
    if (req.query.reset === "1") {
      loop.reset();
      peakHeap = m.heapUsed;
      peakRss = m.rss;
    }
  });
  const server = http.createServer(app);
  rt.attach(server);
  server.listen(0, "127.0.0.1", () => process.send?.({ port: (server.address() as AddressInfo).port }));
}

async function runClients(): Promise<void> {
  const rooms = Number(process.argv[2] ?? 50);
  const perRoom = Number(process.argv[3] ?? 4);
  const transports = process.argv[4] === "polling" ? (["polling"] as const) : (["polling", "websocket"] as const);
  const { io } = await import("socket.io-client");
  const { connectRt } = await import("../../client/src/lib/rt/rtClient");

  const child: ChildProcess = fork(fileURLToPath(import.meta.url), [SERVER_FLAG], { execArgv: ["--import", "tsx", "--expose-gc"], stdio: "inherit" });
  const port: number = await new Promise((resolve) => child.once("message", (m: { port: number }) => resolve(m.port)));
  const base = `http://127.0.0.1:${port}`;
  const origin = `http://localhost:${port}`;
  const metrics = async (q = "") => (await fetch(`${base}/__metrics${q}`)).json();

  const ticket = async (body: unknown) => {
    const r = await fetch(`${base}/api/rt/ticket`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`ticket ${r.status}`);
    return ((await r.json()) as { ticket: string }).ticket;
  };
  const connect = async (t: string) => connectRt({ ticket: t, url: base, ioFactory: io, transports: [...transports], extraHeaders: { origin }, ackTimeoutMs: 20_000 });

  await metrics("?gc=1");
  const baseline = await metrics("?reset=1&gc=1");
  const t0 = Date.now();
  type Conn = Awaited<ReturnType<typeof connect>>;
  const allConns: Conn[] = [];
  let answerAcks = 0;
  let answerFails = 0;

  const playRoom = async (r: number): Promise<number> => {
    const host = await connect(await ticket({ intent: "create" }));
    allConns.push(host);
    const ack = await host.request("room:create", { gameId: "parbaj", mode: "duel", grade: 3 + (r % 10), settings: {} });
    if (!ack.ok || !ack.roomCode) throw new Error(`create ${JSON.stringify(ack)}`);
    const code = ack.roomCode;
    const members: Conn[] = [host];
    for (let i = 1; i < perRoom; i++) {
      const c = await connect(await ticket({ intent: "join", code }));
      allConns.push(c);
      const j = await c.request("room:join", { code, grade: 3 + ((r + i) % 10) });
      if (!j.ok) throw new Error(`join ${JSON.stringify(j)}`);
      await c.request("room:ready", { ready: true });
      members.push(c);
    }
    const started = Date.now();
    const finished = members.map(
      (m) =>
        new Promise<void>((resolve) => {
          m.socket.on("round:open", (o: { round: number; options: string[] }) => {
            setTimeout(() => {
              void m.request("round:answer", { round: o.round, optionIndex: Math.floor(Math.random() * o.options.length), clientRtMs: null }).then((a) => {
                if (a.ok) answerAcks++;
                else answerFails++;
              });
            }, 150 + Math.random() * 750);
          });
          m.socket.once("match:result", () => resolve());
        }),
    );
    const s = await host.request("room:start", {});
    if (!s.ok) throw new Error(`start ${JSON.stringify(s)}`);
    await Promise.all(finished);
    return Date.now() - started;
  };

  // A szobák felépítése kis csomagokban (valós érkezés), a meccsek párhuzamosan futnak.
  const sample: Array<Record<string, number>> = [];
  const sampler = setInterval(() => {
    void metrics().then((m) => sample.push({ t: Date.now() - t0, heap: m.heapUsed, rss: m.rss, conns: m.status.connections, matches: m.status.activeMatches }));
  }, 1000);
  const matchTimes = await Promise.all(Array.from({ length: rooms }, (_, r) => new Promise<number>((resolve) => setTimeout(resolve, r * 40)).then(() => playRoom(r))));
  clearInterval(sampler);
  const peak = await metrics();
  for (const c of allConns) c.close();
  await new Promise((r) => setTimeout(r, 1500));
  const afterClose = await metrics("?gc=1");
  child.kill();

  const mb = (b: number) => Math.round((b / 1048576) * 10) / 10;
  const sorted = matchTimes.slice().sort((a, b) => a - b);
  const maxConns = Math.max(0, ...sample.map((s) => s.conns));
  const maxMatches = Math.max(0, ...sample.map((s) => s.matches));
  console.log(
    JSON.stringify(
      {
        rooms,
        perRoom,
        transports,
        clients: rooms * perRoom,
        totalMs: Date.now() - t0,
        matchMs: { p50: sorted[Math.floor(sorted.length / 2)], max: sorted[sorted.length - 1] },
        serverHeapMB: { baseline: mb(baseline.heapUsed), peak: mb(peak.peakHeap), afterClose: mb(afterClose.heapUsed) },
        serverRssMB: { baseline: mb(baseline.rss), peak: mb(peak.peakRss) },
        heapPerConnectionKB: Math.round(((peak.peakHeap - baseline.heapUsed) / Math.max(1, rooms * perRoom)) / 1024),
        eventLoopMs: { p50: Math.round(peak.loopP50 * 10) / 10, p99: Math.round(peak.loopP99 * 10) / 10, max: Math.round(peak.loopMax * 10) / 10 },
        observedMax: { connections: maxConns, activeMatches: maxMatches },
        answers: { ok: answerAcks, rejected: answerFails },
        server: { counters: peak.counters, rejected: peak.rejected },
      },
      null,
      2,
    ),
  );
}

if (process.argv.includes(SERVER_FLAG)) await runServer();
else await runClients();
