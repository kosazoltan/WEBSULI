"""Maintain self-hosted fonts. Requires fonttools[woff]; never runs during app startup.

Downloads unmodified, pinned OFL sources; converts the complete font to WOFF2
(no character subsetting), verifies Hungarian glyphs, and records hashes.
A family already in manifest.json whose WOFF2 files still match their recorded
sha256 is kept byte-for-byte (not re-downloaded, not re-encoded).
"""
import hashlib
import io
import json
import pathlib
import urllib.parse
import urllib.request

from fontTools.ttLib import TTFont

DEST = pathlib.Path(__file__).resolve().parents[1] / "client/public/fonts"
# Kötelező: a teljes magyar ábécé előre összetett (NFC) alakban — ennek hiánya leállítja a szkriptet.
LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÁÉÍÓÖŐÚÜŰáéíóöőúüű"
# Kombinálható ékezetjelek (felbontott, NFD szövegre). Websuli Design (2026-10-16): az Inter cmap-jéből az U+030B hiányzik;
# a tananyag-lejátszó a szöveget NFC-re normalizálja, így ez nem jelenik meg. A fedettség a manifestbe kerül, nem titkolt.
COMBINING = "́̈̋"
HU = LETTERS + COMBINING
# Websuli Design (docs/specs/2026-10-16-websuli-design.md): Nunito Sans (1–5. o.) és Inter (0., 6–12. o.) a tananyagban; a
# korábbi családok az alkalmazás más részei miatt maradnak.
FAMILIES = [("nunito", "Nunito"), ("sourcesans3", "Source Sans 3"), ("sourceserif4", "Source Serif 4"),
            ("nunitosans", "Nunito Sans"), ("inter", "Inter")]


def get(url):
    with urllib.request.urlopen(url, timeout=45) as response:
        return response.read()


def face(entry):
    return (f'@font-face {{ font-family: "{entry["family"]}"; font-style: {entry["style"]}; '
            f'font-weight: {entry["weight"][0]:g} {entry["weight"][1]:g}; font-display: swap; '
            f'src: url("./{entry["file"]}") format("woff2"); }}')


def kept(previous, family):
    """A manifest szerint már ellenőrzött család bejegyzései, ha a fájlok bájtra egyeznek (különben None)."""
    old = [f for f in previous.get("fonts", []) if f["family"] == family]
    if not old:
        return None
    for entry in old:
        path = DEST / entry["file"]
        if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != entry["sha256"]:
            return None
    return old


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    manifest_path = DEST / "manifest.json"
    previous = json.loads(manifest_path.read_text("utf8")) if manifest_path.exists() else {}
    result = {"requiredCharacters": LETTERS, "combiningMarks": COMBINING, "fonts": []}
    for directory, family in FAMILIES:
        reuse = kept(previous, family)
        if reuse:
            result["fonts"].extend(reuse)
            continue
        old = next((f for f in previous.get("fonts", []) if f["family"] == family), None)
        revision = old["revision"] if old else json.loads(get(
            "https://api.github.com/repos/google/fonts/commits?path=ofl/" + directory + "&per_page=1"))[0]["sha"]
        entries = json.loads(get(f"https://api.github.com/repos/google/fonts/contents/ofl/{directory}?ref={revision}"))
        for entry in entries:
            if entry["name"] == "OFL.txt":
                (DEST / f"{directory}-OFL.txt").write_bytes(get(entry["download_url"]))
            if not entry["name"].endswith(".ttf"):
                continue
            original = get(entry["download_url"])
            font = TTFont(io.BytesIO(original))
            missing = [c for c in LETTERS if not font.getBestCmap().get(ord(c))]
            if missing:
                raise RuntimeError(f"{family}: missing {missing}")
            style = "italic" if "Italic" in entry["name"] else "normal"
            filename = f"{directory}-{style}.woff2"
            font.flavor = "woff2"
            font.save(DEST / filename)
            # Verify the encoded artifact too, not only its upstream source.
            encoded = TTFont(DEST / filename)
            assert all(encoded.getBestCmap().get(ord(c)) for c in LETTERS)
            axis = next(a for a in encoded["fvar"].axes if a.axisTag == "wght")
            assert axis.minValue <= 400 and axis.maxValue >= 800
            result["fonts"].append({"family": family, "style": style, "file": filename,
                "revision": revision, "source": entry["download_url"],
                "sourceSha256": hashlib.sha256(original).hexdigest(),
                "sha256": hashlib.sha256((DEST / filename).read_bytes()).hexdigest(),
                "glyphCount": len(encoded.getBestCmap()), "hungarianVerified": True,
                "combiningMissing": [f"U+{ord(c):04X}" for c in COMBINING if not encoded.getBestCmap().get(ord(c))],
                "internalFamily": encoded["name"].getDebugName(1),
                "postScriptName": encoded["name"].getDebugName(6),
                "weight": [axis.minValue, axis.maxValue]})
    faces = [face(e) for e in result["fonts"]]
    (DEST / "lesson-fonts.css").write_text("/* Complete, locally hosted OFL fonts; see manifest.json. */\n" + "\n".join(faces) + "\n", "utf8")
    manifest_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", "utf8")
    print(json.dumps({"verifiedFaces": len(result["fonts"]), "families": [f[1] for f in FAMILIES],
                      "woff2Bytes": sum(p.stat().st_size for p in DEST.glob("*.woff2"))}, ensure_ascii=False))


if __name__ == "__main__":
    main()
