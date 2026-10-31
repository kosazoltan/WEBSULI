import assert from "node:assert/strict";
import test from "node:test";

import {
  captureStill,
  chooseCamera,
  classifyCameraError,
  rearCameras,
  startCamera,
  stopStream,
  type CaptureStillDeps,
  type MediaDevicesLike,
  type StreamLike,
  type TrackLike,
  type VideoInputLike,
} from "../client/src/lib/camera-capture";

/** docs/specs/2026-10-31-tananyag-fenykepezo.md — a Post Planner élő-kamera technika portjának tiszta magja. */

test("hiba-besorolás: engedély / nincs kamera / foglalt / nem támogatott / egyéb", () => {
  assert.equal(classifyCameraError({ name: "NotAllowedError" }), "permission");
  assert.equal(classifyCameraError({ name: "SecurityError" }), "permission");
  assert.equal(classifyCameraError({ name: "NotFoundError" }), "no_camera");
  assert.equal(classifyCameraError({ name: "OverconstrainedError" }), "no_camera");
  assert.equal(classifyCameraError({ name: "NotReadableError" }), "busy");
  assert.equal(classifyCameraError({ name: "AbortError" }), "busy");
  assert.equal(classifyCameraError({ name: "TypeError" }), "unsupported");
  assert.equal(classifyCameraError(new Error("x")), "failed");
  assert.equal(classifyCameraError(null), "failed");
});

const dev = (deviceId: string, label: string, kind = "videoinput"): VideoInputLike => ({ deviceId, label, kind });

test("hátsó kamerák: címke szerint; címke nélkül minden videóbemenet; a mikrofon sosem", () => {
  const list = [dev("m1", "Mikrofon", "audioinput"), dev("f1", "Front Camera"), dev("b1", "Back Camera"), dev("b2", "Hátsó kamera")];
  assert.deepEqual(rearCameras(list).map((d) => d.deviceId), ["b1", "b2"]);
  assert.deepEqual(rearCameras([dev("x", "Camera 0"), dev("m1", "Mic", "audioinput")]).map((d) => d.deviceId), ["x"]);
});

test("kamera-választás: az elmentett eszköz előnyben; különben az első hátsó; üres listán null", () => {
  const list = [dev("b1", "Back Camera"), dev("b2", "Back Ultra Wide")];
  assert.equal(chooseCamera(list, "b2")?.deviceId, "b2");
  assert.equal(chooseCamera(list, "nincs-mar")?.deviceId, "b1");
  assert.equal(chooseCamera(list, null)?.deviceId, "b1");
  assert.equal(chooseCamera([], null), null);
});

test("stopStream: minden tracket leállít, a hibázó track nem akasztja meg; null-tűrő", () => {
  const stopped: string[] = [];
  const stream = {
    getVideoTracks: () => [],
    getTracks: () => [
      { stop: () => { stopped.push("a"); } },
      { stop: () => { throw new Error("már leállt"); } },
      { stop: () => { stopped.push("c"); } },
    ],
  } as StreamLike;
  stopStream(stream);
  assert.deepEqual(stopped, ["a", "c"]);
  stopStream(null);
  stopStream(undefined);
});

function fakeTrack(input: { deviceId: string; focusMode?: string[]; torch?: boolean }): TrackLike & { applied: MediaTrackConstraints[]; stopped: boolean } {
  const self = {
    applied: [] as MediaTrackConstraints[],
    stopped: false,
    getCapabilities: () => ({ ...(input.focusMode ? { focusMode: input.focusMode } : {}), ...(input.torch !== undefined ? { torch: input.torch } : {}) }),
    getSettings: () => ({ deviceId: input.deviceId }),
    applyConstraints: async (c: MediaTrackConstraints) => { self.applied.push(c); },
    stop: () => { self.stopped = true; },
  };
  return self;
}

function fakeStream(track: ReturnType<typeof fakeTrack>): StreamLike {
  return { getVideoTracks: () => [track], getTracks: () => [track] };
}

test("startCamera: environment-kérés, engedély után váltás az elmentett hátsóra, csak támogatott constraint", async () => {
  const first = fakeTrack({ deviceId: "b1" });
  const second = fakeTrack({ deviceId: "b2", focusMode: ["manual", "continuous"], torch: true });
  const requests: MediaStreamConstraints[] = [];
  const media: MediaDevicesLike = {
    getUserMedia: async (constraints) => {
      requests.push(constraints);
      return requests.length === 1 ? fakeStream(first) : fakeStream(second);
    },
    enumerateDevices: async () => [dev("b1", "Back Camera"), dev("b2", "Back Tele Camera")],
  };
  const started = await startCamera(media, "b2");
  assert.equal(requests.length, 2, "a váltás második getUserMedia-kérés");
  assert.deepEqual((requests[0].video as { facingMode?: unknown }).facingMode, { ideal: "environment" });
  assert.deepEqual((requests[1].video as { deviceId?: unknown }).deviceId, { exact: "b2" });
  assert.equal(first.stopped, true, "az első stream leállt a váltáskor");
  assert.equal(started.deviceId, "b2");
  assert.deepEqual(second.applied, [{ advanced: [{ focusMode: "continuous", torch: false }] }]);
});

test("startCamera: képesség nélküli tracknél nincs applyConstraints; nincs váltás, ha már a jó kamera él", async () => {
  const track = fakeTrack({ deviceId: "b1" });
  const media: MediaDevicesLike = {
    getUserMedia: async () => fakeStream(track),
    enumerateDevices: async () => [dev("b1", "Back Camera")],
  };
  const started = await startCamera(media, null);
  assert.equal(started.deviceId, "b1");
  assert.deepEqual(track.applied, []);
  assert.equal(track.stopped, false);
});

test("startCamera: engedély-hiba → permission, és nem marad nyitott stream; hiányzó getUserMedia → unsupported", async () => {
  const media: MediaDevicesLike = {
    getUserMedia: async () => { throw Object.assign(new Error("denied"), { name: "NotAllowedError" }); },
    enumerateDevices: async () => [],
  };
  await assert.rejects(startCamera(media, null), (e: Error & { cameraError?: string }) => e.cameraError === "permission");
  await assert.rejects(startCamera(undefined, null), (e: Error & { cameraError?: string }) => e.cameraError === "unsupported");
});

test("startCamera: track nélküli stream → no_camera, és a stream leáll", async () => {
  let stopped = 0;
  const media: MediaDevicesLike = {
    getUserMedia: async () => ({ getVideoTracks: () => [], getTracks: () => [{ stop: () => { stopped++; } }] }),
    enumerateDevices: async () => [],
  };
  await assert.rejects(startCamera(media, null), (e: Error & { cameraError?: string }) => e.cameraError === "no_camera");
  assert.ok(stopped >= 1, "a track nélküli stream is leállt");
});

const blobOf = (tag: string) => ({ tag } as unknown as Blob);
const video = (w: number, h: number) => ({ videoWidth: w, videoHeight: h });

function captureDeps(input: { photo?: { blob: Blob; width: number; height: number } | "error"; frame?: Blob | null }): CaptureStillDeps {
  return {
    createImageCapture: input.photo
      ? () => ({ takePhoto: async () => { if (input.photo === "error") throw new Error("nem támogatott"); return input.photo!.blob; } })
      : null,
    measure: async () => (input.photo && input.photo !== "error" ? { width: input.photo.width, height: input.photo.height } : { width: 0, height: 0 }),
    frameToBlob: async () => input.frame ?? null,
  };
}

test("exponálás: takePhoto-út, ha a kép eléri a minimumot", async () => {
  const still = await captureStill({ track: {}, video: video(1280, 720) }, captureDeps({ photo: { blob: blobOf("p"), width: 4000, height: 3000 } }));
  assert.equal(still?.path, "takePhoto");
  assert.equal(still?.width, 4000);
});

test("exponálás: kicsi takePhoto → videókocka-út (ha a kocka eléri a minimumot)", async () => {
  const still = await captureStill({ track: {}, video: video(1920, 1080) }, captureDeps({ photo: { blob: blobOf("kicsi"), width: 640, height: 480 }, frame: blobOf("kocka") }));
  assert.equal(still?.path, "frame");
  assert.deepEqual([still?.width, still?.height], [1920, 1080]);
});

test("exponálás: hibázó takePhoto → kocka-út; kicsi kocka → null (natív kamera)", async () => {
  const viaFrame = await captureStill({ track: {}, video: video(1600, 900) }, captureDeps({ photo: "error", frame: blobOf("kocka") }));
  assert.equal(viaFrame?.path, "frame");
  const none = await captureStill({ track: {}, video: video(1280, 720) }, captureDeps({ photo: "error", frame: blobOf("kocka") }));
  assert.equal(none, null, "1600 alatt a kocka nem elég — natív út");
});

test("exponálás: ImageCapture nélkül egyből a kocka-út; null kocka → null", async () => {
  const still = await captureStill({ track: {}, video: video(2048, 1536) }, captureDeps({ frame: blobOf("kocka") }));
  assert.equal(still?.path, "frame");
  assert.equal(await captureStill({ track: {}, video: video(2048, 1536) }, captureDeps({ frame: null })), null);
});
