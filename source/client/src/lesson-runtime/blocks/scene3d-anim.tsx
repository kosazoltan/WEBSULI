import { useEffect, useMemo, useRef, useState } from "react";
import type * as ThreeNS from "three";

import { parseVisualParams, type Scene3dParams } from "@shared/lesson-visual-params";

/**
 * Spec 2026-09-30 (docs/specs/2026-09-30-abratervezo-3d.md): forgatható 3D-jelenet.
 *
 * A modell leíró adatot ad (alakzat, hely, méret, szín, felirat), a rajz itt készül three.js-szel —
 * végrehajtandó kód nem kerül a leckébe. A three.js csak ennél a blokknál töltődik be (lazy import),
 * a feliratok HTML-címkék (élesek, kontrasztosak), minden képkockán a 3D pont vetítésével. Húzással
 * forgatható; a vászon `touch-action: pan-y`, így telefonon a függőleges görgetés megmarad.
 */

type AnimProps = { params: Record<string, unknown>; caption: string };
type Obj = Scene3dParams["objects"][number];
type Label = { text: string; x: number; y: number; z: number };

const VIEW_ANGLES: Record<NonNullable<Scene3dParams["view"]>, { azimuth: number; elevation: number }> = {
  iso: { azimuth: Math.PI / 4, elevation: (32 * Math.PI) / 180 },
  front: { azimuth: 0, elevation: (14 * Math.PI) / 180 },
  top: { azimuth: Math.PI / 6, elevation: (68 * Math.PI) / 180 },
};
const MIN_ELEVATION = (8 * Math.PI) / 180;
const MAX_ELEVATION = (80 * Math.PI) / 180;

/** Egy objektum feliratának 3D-helye: az alakzat teteje fölött (folyónál a középső pont). */
function labelAnchor(o: Obj): [number, number, number] {
  if (o.shape === "river" && o.points) {
    const [x, z] = o.points[Math.floor(o.points.length / 2)];
    return [x, 0.4, z];
  }
  const [w, h, d] = o.size ?? [1, 1, 1];
  // A lépcsős tömb tetején gyakran másik elem áll (szentély): a felirata az oldalfalára mutat, nem a csúcsra.
  if (o.shape === "stairs") return [o.at[0] + w * 0.42, o.at[1] + h * 0.3, o.at[2] + d * 0.42];
  const top = o.shape === "sphere" ? w : h;
  return [o.at[0], o.at[1] + top + 0.35, o.at[2]];
}

export function scene3dLabels(p: Scene3dParams): Label[] {
  return [
    ...p.objects.filter((o) => o.label).map((o) => { const [x, y, z] = labelAnchor(o); return { text: o.label!, x, y, z }; }),
    ...(p.labels ?? []).map((l) => ({ text: l.text, x: l.at[0], y: l.at[1], z: l.at[2] })),
  ];
}

function buildScene(THREE: typeof ThreeNS, p: Scene3dParams) {
  const scene = new THREE.Scene();
  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
  const edgeMaterial = track(new THREE.LineBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.35 }));
  const content = new THREE.Group();
  scene.add(content);

  const addMesh = (geometry: ThreeNS.BufferGeometry, color: string, x: number, y: number, z: number, rotY = 0, edges = true) => {
    track(geometry);
    const material = track(new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02 }));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = (rotY * Math.PI) / 180;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    content.add(mesh);
    if (edges) {
      const line = new THREE.LineSegments(track(new THREE.EdgesGeometry(geometry, 30)), edgeMaterial);
      line.position.copy(mesh.position);
      line.rotation.copy(mesh.rotation);
      content.add(line);
    }
  };

  for (const o of p.objects) {
    const [x, y, z] = o.at;
    const [w, h, d] = o.size ?? [1, 1, 1];
    switch (o.shape) {
      case "box": addMesh(new THREE.BoxGeometry(w, h, d), o.color, x, y + h / 2, z, o.rotY); break;
      case "plane": { const t = Math.max(0.05, Math.min(h, 0.2)); addMesh(new THREE.BoxGeometry(w, t, d), o.color, x, y + t / 2, z, o.rotY); break; }
      case "cylinder": addMesh(new THREE.CylinderGeometry(w / 2, w / 2, h, 40), o.color, x, y + h / 2, z, o.rotY, false); break;
      case "cone": addMesh(new THREE.ConeGeometry(w / 2, h, 40), o.color, x, y + h / 2, z, o.rotY, false); break;
      case "sphere": addMesh(new THREE.SphereGeometry(w / 2, 32, 20), o.color, x, y + w / 2, z, 0, false); break;
      case "stairs": {
        // Felfelé kisebbedő szintek (zikkurat): a legfelső a talp ~35%-a; minden szint kicsit világosabb.
        const n = o.steps ?? 4;
        const levelH = h / n;
        const base = new THREE.Color(o.color);
        for (let i = 0; i < n; i++) {
          const k = 1 - (0.65 * i) / Math.max(1, n - 1);
          const color = base.clone().lerp(new THREE.Color(0xffffff), 0.07 * i);
          addMesh(new THREE.BoxGeometry(w * k, levelH, d * k), `#${color.getHexString()}`, x, y + levelH * (i + 0.5), z, o.rotY);
        }
        break;
      }
      case "river": {
        // A talajra fektetett szalag a simított középvonal mentén.
        const pts = (o.points ?? []).map(([px, pz]) => new THREE.Vector3(px, 0, pz));
        const curve = new THREE.CatmullRomCurve3(pts);
        const samples = curve.getSpacedPoints(Math.max(24, pts.length * 12));
        const half = (o.width ?? 1) / 2;
        const positions: number[] = [];
        const index: number[] = [];
        samples.forEach((pt, i) => {
          const next = samples[Math.min(i + 1, samples.length - 1)];
          const prev = samples[Math.max(i - 1, 0)];
          const dir = new THREE.Vector3().subVectors(next, prev).normalize();
          const normal = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(half);
          positions.push(pt.x + normal.x, 0.03 + y, pt.z + normal.z, pt.x - normal.x, 0.03 + y, pt.z - normal.z);
          if (i < samples.length - 1) { const a = i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setIndex(index);
        geometry.computeVertexNormals();
        const material = track(new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.35, metalness: 0.05, side: THREE.DoubleSide }));
        track(geometry);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        content.add(mesh);
        break;
      }
    }
  }

  const box = new THREE.Box3().setFromObject(content);
  const center = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(2, sphere.radius);
  // A talaj-korong a jelenet vízszintes kiterjedéséhez igazodik (a magasság nem növeli), és a keretezés része.
  const groundRadius = Math.max(1.5, Math.hypot(box.max.x - box.min.x, box.max.z - box.min.z) / 2) * 1.12;
  const ground = new THREE.Mesh(
    track(new THREE.CircleGeometry(groundRadius, 64)),
    track(new THREE.MeshStandardMaterial({ color: p.ground ?? "#e7dcc3", roughness: 1 })),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(center.x, -0.001, center.z);
  ground.receiveShadow = true;
  scene.add(ground);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9a88a, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(center.x - radius, radius * 2, center.z + radius * 1.2);
  sun.target.position.copy(center);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const s = radius * 1.6;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.5, far: radius * 6 });
  scene.add(sun, sun.target);

  const groundPoints = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => new THREE.Vector3(center.x + groundRadius * Math.cos((k * Math.PI) / 4), 0, center.z + groundRadius * Math.sin((k * Math.PI) / 4)));
  return { scene, center, radius, box, groundPoints, dispose: () => disposables.forEach((x) => x.dispose()) };
}

export function Scene3dAnim({ params, caption }: AnimProps) {
  const parsed = useMemo(() => parseVisualParams("scene3d", params), [params]);
  const hostRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const lineRefs = useRef<Array<SVGLineElement | null>>([]);
  const dotRefs = useRef<Array<SVGCircleElement | null>>([]);
  const overlayRef = useRef<SVGSVGElement>(null);
  const resetRef = useRef<() => void>(() => undefined);
  const [failed, setFailed] = useState(false);
  const labels = useMemo(() => (parsed ? scene3dLabels(parsed) : []), [parsed]);

  useEffect(() => {
    const host = hostRef.current;
    if (!parsed || !host) return;
    let disposed = false;
    let cleanup = () => undefined as void;
    void import("three").then((THREE) => {
      if (disposed) return;
      let renderer: ThreeNS.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        setFailed(true);
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.style.display = "block";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      host.prepend(renderer.domElement);
      const { scene, center, radius, box, groundPoints, dispose } = buildScene(THREE, parsed);
      const camera = new THREE.PerspectiveCamera(38, 4 / 3, 0.1, radius * 20);
      const start = VIEW_ANGLES[parsed.view ?? "iso"];
      let { azimuth, elevation } = start;
      let distance = radius / Math.sin((19 * Math.PI) / 180);
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      let spinning = !reduced;
      const place = () => {
        camera.position.set(
          center.x + distance * Math.cos(elevation) * Math.sin(azimuth),
          center.y + distance * Math.sin(elevation),
          center.z + distance * Math.cos(elevation) * Math.cos(azimuth),
        );
        camera.lookAt(center);
      };
      resetRef.current = () => { azimuth = start.azimuth; elevation = start.elevation; spinning = false; };

      const resize = () => {
        const width = host.clientWidth || 320;
        const height = Math.round((width * 3) / 4);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      resize();
      // A kiinduló nézetben a jelenet befoglaló dobozának sarkai a képkocka ~88%-án belül legyenek (se levágás, se apró kép).
      const corners = [...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => new THREE.Vector3(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z)), ...groundPoints];
      for (let pass = 0; pass < 4; pass++) {
        place();
        camera.updateMatrixWorld();
        const extent = Math.max(...corners.map((c) => { const v = c.clone().project(camera); return Math.max(Math.abs(v.x), Math.abs(v.y)); }));
        if (!Number.isFinite(extent) || extent <= 0) break;
        distance *= extent / 0.92;
      }
      const observer = new ResizeObserver(resize);
      observer.observe(host);

      let dragging: { x: number; y: number } | null = null;
      const onDown = (e: PointerEvent) => { dragging = { x: e.clientX, y: e.clientY }; spinning = false; renderer.domElement.setPointerCapture?.(e.pointerId); };
      const onMove = (e: PointerEvent) => {
        if (!dragging) return;
        azimuth -= ((e.clientX - dragging.x) / Math.max(200, host.clientWidth)) * Math.PI * 1.4;
        elevation = Math.min(MAX_ELEVATION, Math.max(MIN_ELEVATION, elevation + ((e.clientY - dragging.y) / 300) * 1.2));
        dragging = { x: e.clientX, y: e.clientY };
      };
      const onUp = () => { dragging = null; };
      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointermove", onMove);
      renderer.domElement.addEventListener("pointerup", onUp);
      renderer.domElement.addEventListener("pointercancel", onUp);

      let visible = true;
      const io = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? true; });
      io.observe(host);
      const projected = new THREE.Vector3();
      let last = performance.now();
      let frame = 0;
      const tick = (now: number) => {
        frame = requestAnimationFrame(tick);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (!visible) return;
        if (spinning) azimuth += dt * 0.25;
        place();
        renderer.render(scene, camera);
        const width = host.clientWidth;
        const height = Math.round((width * 3) / 4);
        // Feliratok: vetítés, a vászonra szorítás, majd ütközés-feloldás (a később jövő felirat lejjebb/feljebb tolva);
        // a mutatóvonal a 3D pontot köti a felirathoz, így eltolás után is egyértelmű, mit nevez meg.
        const boxes: Array<{ x: number; y: number; w: number; h: number; ax: number; ay: number; hidden: boolean }> = [];
        labels.forEach((label, i) => {
          const el = labelRefs.current[i];
          if (!el) return;
          projected.set(label.x, label.y, label.z).project(camera);
          const ax = ((projected.x + 1) / 2) * width;
          const ay = ((1 - projected.y) / 2) * height;
          const w = el.offsetWidth, h = el.offsetHeight;
          const box = { x: Math.min(width - w - 2, Math.max(2, ax - w / 2)), y: Math.min(height - h - 2, Math.max(2, ay - h - 10)), w, h, ax, ay, hidden: projected.z > 1 };
          for (let guard = 0; guard < 12; guard++) {
            const hit = boxes.find((b) => box.x < b.x + b.w + 3 && b.x < box.x + box.w + 3 && box.y < b.y + b.h + 3 && b.y < box.y + box.h + 3);
            if (!hit) break;
            const down = hit.y + hit.h + 4;
            box.y = down + h <= height - 2 ? down : Math.max(2, hit.y - h - 4);
            if (box.y === hit.y - h - 4 && box.y <= 2) break;
          }
          boxes[i] = box;
          el.style.transform = `translate(${Math.round(box.x)}px, ${Math.round(box.y)}px)`;
          el.style.opacity = box.hidden ? "0" : "1";
          const line = lineRefs.current[i];
          const dot = dotRefs.current[i];
          if (line && dot) {
            const tx = Math.min(box.x + box.w - 4, Math.max(box.x + 4, box.ax));
            const ty = box.y + box.h / 2 < box.ay ? box.y + box.h : box.y;
            line.setAttribute("x1", String(box.ax)); line.setAttribute("y1", String(box.ay));
            line.setAttribute("x2", String(tx)); line.setAttribute("y2", String(ty));
            dot.setAttribute("cx", String(box.ax)); dot.setAttribute("cy", String(box.ay));
            line.style.opacity = dot.style.opacity = box.hidden ? "0" : "1";
          }
        });
        overlayRef.current?.setAttribute("viewBox", `0 0 ${width} ${height}`);
      };
      frame = requestAnimationFrame(tick);

      cleanup = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        io.disconnect();
        renderer.domElement.removeEventListener("pointerdown", onDown);
        renderer.domElement.removeEventListener("pointermove", onMove);
        renderer.domElement.removeEventListener("pointerup", onUp);
        renderer.domElement.removeEventListener("pointercancel", onUp);
        dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; cleanup(); };
  }, [parsed, labels]);

  if (!parsed) return null;
  return (
    <figure className="border rounded-lg bg-card p-4" data-anim="scene3d">
      {failed ? (
        <ul className="lesson-figure-paper mx-auto max-w-lg list-disc rounded-md p-4 pl-8 text-[#0f172a]" aria-label={caption}>
          {labels.map((l) => <li key={l.text}>{l.text}</li>)}
        </ul>
      ) : (
        <>
          <div
            ref={hostRef}
            role="img"
            aria-label={caption}
            className="lesson-figure-paper relative mx-auto max-w-lg overflow-hidden rounded-md"
            style={{ aspectRatio: "4 / 3", touchAction: "pan-y", cursor: "grab" }}
          >
            <svg ref={overlayRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
              {labels.map((label, i) => (
                <g key={`${label.text}-${i}`}>
                  <line ref={(el) => { lineRefs.current[i] = el; }} stroke="#0f172a" strokeWidth="1.5" strokeOpacity="0.7" style={{ opacity: 0 }} />
                  <circle ref={(el) => { dotRefs.current[i] = el; }} r="3" fill="#0f172a" style={{ opacity: 0 }} />
                </g>
              ))}
            </svg>
            {labels.map((label, i) => (
              <span
                key={`${label.text}-${i}`}
                ref={(el) => { labelRefs.current[i] = el; }}
                aria-hidden="true"
                className="pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-md border border-slate-300 bg-white/95 px-2 py-0.5 text-[13px] font-semibold leading-tight text-[#0f172a] shadow-sm sm:text-sm"
                style={{ opacity: 0 }}
              >
                {label.text}
              </span>
            ))}
          </div>
          <div className="mx-auto mt-2 flex max-w-lg flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Húzd az ujjad vagy az egeret a forgatáshoz.</span>
            <button type="button" className="min-h-9 rounded-md border px-3 text-xs" onClick={() => resetRef.current()}>↻ Alaphelyzet</button>
          </div>
        </>
      )}
      {caption ? <figcaption className="text-sm text-muted-foreground mt-2">{caption}</figcaption> : null}
    </figure>
  );
}
