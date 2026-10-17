"""tables.json -> lessons.json: tanmenetenként az órák sorrendje (témakör + óracím), évfolyamra bontva. Csak stdlib."""
import json
import re
import sys
import unicodedata

LESSON_NO = re.compile(r"^\s*(\d{1,3})\s*(?:[.\-–—]\s*(\d{1,3}))?\.?\s*(?:óra)?\s*$")
GRADE_HDR = re.compile(r"(\d{1,2})\s*\.\s*évfolyam", re.I)

CODE_SUBJECT = {
    "MAT": "matematika", "MIR": "magyar-irodalom", "MNY": "magyar-nyelvtan", "TER": "termeszetismeret",
    "KOR": "kornyezetismeret", "BIO": "biologia", "FIZ": "fizika", "KEM": "kemia", "FOL": "foldrajz",
    "TOR": "tortenelem", "DIG": "informatika", "ENZ": "enek-zene", "ETI": "hit-es-erkolcstan",
    "HNI": "tarsadalmi-ismeretek", "ALP": "tarsadalmi-ismeretek",
}
NAME_SUBJECT = [
    (r"matemat", "matematika"), (r"irodalom|olvas", "magyar-irodalom"), (r"magyar_nyelv|nyelvtan", "magyar-nyelvtan"),
    (r"termeszettud|termtud", "termeszetismeret"), (r"kornyezetism", "kornyezetismeret"), (r"biolog", "biologia"),
    (r"fizik", "fizika"), (r"kemia", "kemia"), (r"foldrajz", "foldrajz"), (r"tort|tori", "tortenelem"),
    (r"digital", "informatika"), (r"enek", "enek-zene"), (r"etika", "hit-es-erkolcstan"), (r"hon_es_nep", "tarsadalmi-ismeretek"),
    (r"kornyezet_es_egeszseg", "biologia"),
]


def ascii_fold(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


def subject_of(fname):
    m = re.search(r"OH[-_]([A-Z]{3})", fname)
    if m and m.group(1) in CODE_SUBJECT:
        return CODE_SUBJECT[m.group(1)]
    f = ascii_fold(fname)
    if "magyar_nyelv_es" in f or "magyar_nyelv__es" in f:
        return "magyar-nyelv-es-irodalom"
    for pat, subj in NAME_SUBJECT:
        if re.search(pat, f):
            return subj
    return None


def grades_of(fname, page_grade):
    m = re.search(r"OH[-_][A-Z]{3}(\d{2})(\d{2})?", fname)
    if m and m.group(2):
        a, b = int(m.group(1)), int(m.group(2))
        if b == a + 1:
            return [a, b]
    m = re.search(r"(\d{1,2})-(\d{1,2})", fname)
    if m and int(m.group(2)) == int(m.group(1)) + 1:
        return [int(m.group(1)), int(m.group(2))]
    return [page_grade]


MONTH = re.compile(r"^(szeptember|október|november|december|január|február|március|április|május|június)", re.I)
HEADER_HINT = re.compile(r"sorszám|az óra témája|a tanóra címe|témák|^óra$|^hét$|óraszám", re.I)
TOPIC_COL_HINT = re.compile(r"témája|címe|órákra bontása|tananyag", re.I)
NUMLIKE = re.compile(r"^[\s.\d–\-—/]*(óra|hét|hete)?\s*$", re.I)


def parse(tables):
    lessons, section, grade_mark = [], "", None
    for tbl in tables:
        topic_col, in_lessons = None, False
        for row in tbl:
            cells = [c.strip() for c in row]
            nonempty = [c for c in cells if c]
            if not nonempty:
                continue
            uniq = set(nonempty)
            if len(uniq) == 1:  # teljes szélességű sor: évfolyamjelölés vagy témakör-fejléc
                text = nonempty[0]
                g = GRADE_HDR.search(text)
                if g and len(text) < 40:
                    grade_mark = int(g.group(1))
                elif len(text) < 160 and not NUMLIKE.match(text) and not HEADER_HINT.search(text):
                    section = text
                continue
            if HEADER_HINT.search(cells[0]) or (len(cells) > 1 and HEADER_HINT.search(cells[1]) and not in_lessons):
                topic_col = next((i for i, c in enumerate(cells) if TOPIC_COL_HINT.search(c) and i > 0), 1)
                in_lessons = True
                continue
            month_row = bool(MONTH.match(cells[0]))
            if not (in_lessons or month_row):
                continue
            first = cells[0]
            m = LESSON_NO.match(first)
            count = 1
            if m and m.group(2) and int(m.group(2)) > int(m.group(1)):
                count = int(m.group(2)) - int(m.group(1)) + 1
            # „Témák | órák | az óra témája” forma: az első oszlop szöveges témakör
            if first and not NUMLIKE.match(first) and not month_row and topic_col and topic_col >= 2:
                section = first
            col = topic_col if topic_col is not None and topic_col < len(cells) else 1
            topic = cells[col] if col < len(cells) and cells[col] else next((c for c in cells[1:] if c and not NUMLIKE.match(c)), "")
            if not topic or NUMLIKE.match(topic):
                continue
            for _ in range(count):
                lessons.append({"section": section, "topic": topic[:200], "grade": grade_mark})
    return lessons


def main(src, dst):
    data = json.load(open(src, encoding="utf-8"))
    out, empty = [], []
    for fname, tables in data.items():
        page_grade = int(re.match(r"g(\d+)__", fname).group(1))
        base = fname.split("__", 1)[1]
        lessons = parse(tables)
        if len(lessons) < 10:
            empty.append((fname, len(lessons)))
            continue
        grades = grades_of(base, page_grade)
        if len(grades) == 2:
            marked = [l for l in lessons if l["grade"] in grades]
            if len(marked) >= len(lessons) * 0.8:
                per = {g: [l for l in lessons if l["grade"] == g] for g in grades}
            else:  # nincs évfolyamjelölés → fele-fele
                half = len(lessons) // 2
                per = {grades[0]: lessons[:half], grades[1]: lessons[half:]}
        else:
            per = {grades[0]: lessons}
        for g, ls in per.items():
            out.append({"file": base, "pageGrade": page_grade, "grade": g, "subject": subject_of(base),
                        "lessons": [{"section": l["section"], "topic": l["topic"]} for l in ls]})
    json.dump(out, open(dst, "w", encoding="utf-8"), ensure_ascii=False)
    print("tanmenet-szakasz:", len(out), "| kevés/nem értelmezhető:", len(empty))
    for e in empty:
        print("   ", e)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
