import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Spec: docs/specs/2026-10-13-robot-ikon.md — the site must ship its own icons (not Replit's).
const root = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC = path.join(root, "client", "public");
const pub = (p: string) => path.join(PUBLIC, p.replace(/^\//, ""));

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Walks every chunk: signature, IHDR first, at least one IDAT, IEND last, no truncation. */
function pngInfo(b: Buffer, label: string): { w: number; h: number } {
  assert.ok(b.subarray(0, 8).equals(PNG_SIGNATURE), `${label}: bad PNG signature`);
  const types: string[] = [];
  let pos = 8;
  while (pos < b.length) {
    assert.ok(pos + 12 <= b.length, `${label}: truncated chunk header`);
    const len = b.readUInt32BE(pos);
    types.push(b.subarray(pos + 4, pos + 8).toString("ascii"));
    pos += 12 + len;
    assert.ok(pos <= b.length, `${label}: truncated chunk data`);
  }
  assert.equal(types[0], "IHDR", `${label}: IHDR must come first`);
  assert.ok(types.includes("IDAT"), `${label}: no image data`);
  assert.equal(types[types.length - 1], "IEND", `${label}: missing IEND`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function pngSize(file: string): { w: number; h: number } {
  return pngInfo(fs.readFileSync(file), file);
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
  const sizes: number[] = [];
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16;
    const size = b[e];
    const bytes = b.readUInt32LE(e + 8);
    const offset = b.readUInt32LE(e + 12);
    assert.ok(offset + bytes <= b.length, `ico entry ${i}: payload out of bounds`);
    // each entry embeds a complete PNG whose real size matches the directory entry
    assert.deepEqual(pngInfo(b.subarray(offset, offset + bytes), `ico entry ${i}`), { w: size, h: size });
    sizes.push(size);
  }
  assert.deepEqual(sizes.sort((a, c) => a - c), [16, 32, 48]);
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
