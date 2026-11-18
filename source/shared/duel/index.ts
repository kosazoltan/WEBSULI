/**
 * A párbaj-szabálymotor gyűjtő-exportja (`@shared/duel`): szabály (`rules`), kérdéssor (`questions`), előre megírt
 * reakciók (`reactions`). Az online állapotgép a `room-machine.ts`, a protokoll a `protocol.ts` (külön importálandók).
 * Kliens és szerver közös, tiszta TS (J19 őr alatt). Az egyeszközös meccs-motor (`match.ts`) a JM1r-ben megszűnt (D20).
 */
export * from "./rules";
export * from "./questions";
export * from "./reactions";
