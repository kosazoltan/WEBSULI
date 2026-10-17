"""lessons.json + sources.json -> server/data/tanmenet-2020.json (tömör, forrás-URL-lel). Csak stdlib."""
import json
import os
import sys


def stem(name):
    return os.path.splitext(os.path.basename(name))[0].lower()


def main(lessons_path, sources_path, out_path):
    lessons = json.load(open(lessons_path, encoding="utf-8"))
    sources = json.load(open(sources_path, encoding="utf-8"))
    url_of = {stem(s["url"]): s for s in sources}
    out = []
    for e in lessons:
        src = url_of.get(stem(e["file"]))
        if not e["subject"] or not src:
            continue
        out.append({
            "grade": e["grade"],
            "subject": e["subject"],
            "title": src["title"],
            "source": src["url"],
            "lessons": [[l["section"], l["topic"]] for l in e["lessons"]],
        })
    out.sort(key=lambda x: (x["grade"], x["subject"], x["title"]))
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({
            "about": "Oktatási Hivatal — A 2020-as NAT-hoz illeszkedő mintatanmenetek "
                     "(https://www.oktatas.hu/kozneveles/kerettantervek/2020_nat/mintatanmenetek), kivonat: az órák sorrendje.",
            "plans": out,
        }, f, ensure_ascii=False, separators=(",", ":"))
    print("tanmenet:", len(out), "->", out_path, os.path.getsize(out_path) // 1024, "KB")


if __name__ == "__main__":
    main(*sys.argv[1:4])
