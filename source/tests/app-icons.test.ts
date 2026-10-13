import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Spec: docs/specs/2026-10-13-robot-ikon.md — the site must ship its own icons (not Replit's).
const root = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC = path.join(root, "client", "public");
const pub = (p: string) => path.join(PUBLIC, p.replace(/^\//, ""));

function pngSize(file: string): { w: number; h: number } {
  const b = fs.readFileSync(file);
  assert.equal(b.subarray(1, 4).toString("ascii"), "PNG", `${file} is not a PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

test("PNG icons exist with the size their role requires", () => {
  const expected: Record<string, number> = {
    "favicon.png": 32,
    "icon-192.png": 192,
    "icon-512.png": 512,
    "apple-touch-icon.png": 180,
    "icon-maskable-512.png": 512,
  };
  for (const [name, size] of Object.entries(expected)) {
    assert.deepEqual(pngSize(pub(name)), { w: size, h: size }, name);
  }
});

test("favicon.ico is a real ICO with 16/32/48 entries", () => {
  const b = fs.readFileSync(pub("favicon.ico"));
  assert.deepEqual([...b.subarray(0, 4)], [0, 0, 1, 0]);
  const count = b.readUInt16LE(4);
  assert.equal(count, 3);
  const sizes = Array.from({ length: count }, (_, i) => b[6 + i * 16]).sort((a, c) => a - c);
  assert.deepEqual(sizes, [16, 32, 48]);
});

test("manifest icons point at existing files with truthful sizes and both purposes", () => {
  const manifest = JSON.parse(fs.readFileSync(pub("manifest.json"), "utf8")) as {
    icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
  };
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(pub(icon.src)), `missing ${icon.src}`);
    if (icon.type === "image/png") {
      const { w, h } = pngSize(pub(icon.src));
      assert.equal(icon.sizes, `${w}x${h}`, icon.src);
    }
  }
  const purposes = manifest.icons.flatMap((i) => (i.purpose ?? "any").split(/\s+/));
  assert.ok(purposes.includes("maskable"));
  assert.ok(purposes.includes("any"));
});

test("index.html icon links resolve to existing files; the old book icon is gone", () => {
  const html = fs.readFileSync(path.join(root, "client", "index.html"), "utf8");
  for (const rel of ["icon", "alternate icon", "apple-touch-icon"]) {
    const m = html.match(new RegExp(`<link rel="${rel}"[^>]*href="([^"]+)"`));
    assert.ok(m, `missing <link rel="${rel}">`);
    assert.ok(fs.existsSync(pub(m[1])), `${rel} → ${m[1]} missing`);
  }
  assert.doesNotMatch(fs.readFileSync(pub("favicon.svg"), "utf8"), /Book icon/);
});
