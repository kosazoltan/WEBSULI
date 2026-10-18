"""Iskolai nyelvi tanmenetek kivonata -> server/data/nyelvi-tanmenet.json (docs/specs/2026-10-18-tanmenet-kiegeszites.md).

Bemenet: a kutatás JSON-ja (iskolánként, évfolyamonként a témák sorrendje, óraszám vagy hónap, kulcsszavak).
Évfolyamonként EGY elsődleges forrás (CHOICE); a téma annyi „órát” kap, amennyi az óraszáma (ennek hiányában 1-et).
"""
import json
import re
import sys

CHOICE = {  # (nyelv, évfolyam) -> a forrás URL-jének egyedi részlete
    ("angol", 3): "Gardonyi_helyi_tanterv",
    ("angol", 4): "baracska.hu/data/files/atk1",
    ("angol", 5): "helyi_tanterv_angol_2020",
    ("angol", 6): "tamasiaroniskola.hu/wp-content/uploads/2021/01/6_angol",
    ("angol", 7): "helyi_tanterv_angol_2020",
    ("angol", 8): "helyi_tanterv_angol_2020",
    ("francia", 8): "francia_nyelv",
}


def span(unit):
    if unit.get("hours"):
        return int(unit["hours"])
    m = re.match(r"\s*(\d+)\s*[–-]\s*(\d+)", str(unit.get("lessons") or ""))
    return int(m.group(2)) - int(m.group(1)) + 1 if m else 1


def main(src, dst):
    data = json.load(open(src, encoding="utf-8"))
    plans = []
    for (subject, grade), frag in CHOICE.items():
        entry = next((e for e in data if e["subject"] == subject and e["grade"] == grade and frag in e["source"]), None)
        if not entry:
            print("hiányzik:", subject, grade)
            continue
        lessons = []
        for u in sorted(entry["units"], key=lambda x: x.get("order") or 0):
            topic = re.sub(r"^\s*UNVERIFIED:\s*", "", (u.get("title") or "")).strip()
            words = ", ".join(u.get("keywords") or [])
            for _ in range(max(1, span(u))):
                lessons.append([topic, f"{topic}: {words}" if words else topic])
        school = re.split(r"\s*[;(]", entry.get("school", ""))[0].strip()
        plans.append({"grade": grade, "subject": subject, "title": f"{subject.capitalize()} {grade}. (iskolai tanmenet: {school})",
                      "source": entry["source"], "lessons": lessons})
    with open(dst, "w", encoding="utf-8") as f:
        json.dump({"about": "Iskolák nyilvános (helyi tantervi / tanmeneti) nyelvi menetrendje; évfolyamonként egy forrás, URL-lel.",
                   "plans": plans}, f, ensure_ascii=False, separators=(",", ":"))
    print("nyelvi tanmenet:", len(plans))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
