---
name: main-agvedelem
description: "A WEBSULI main-re csak PR-on át — tulajdonosi döntés 2026-11-22 az ágvédelemről, miután két közvetlen push (Hermes / agentic-qa-kit záró hurok) eltörte a memória-index őrét"
metadata:
  node_type: memory
  type: project
  originSessionId: 5e40d429-1a44-43d0-a815-181a3773f233
  modified: 2026-11-22T10:29:16.642Z
---

2026-11-22-én a WEBSULI főágára két commit került közvetlenül, PR és kapuk nélkül (`edee295f` „docs(hermes)”, `0645f48f` „chore(zaro-hurok) … agentic-qa-kit” — egy másik gépen futó záró-hurok eszközből). A `0645f48f` egy indexeletlen memóriafájlt hozott (`memory/notes/00-Index.md`), ezért a `memory-index-guard` őr a főágon bukott, és minden PR push-kapuja (C-61) megállt. Javítás: PR #526 (`34d58a4d`). Harmadik közvetlen push ugyanaznap 11:27-kor (`01dc6680` „Hermes-agent checker-útvonal”): EZEN a gépen egy másik ügynök a fő checkout helyi main-jére commitolt, majd a #526 után rárebase-elve pusholt — a fő checkout ezért nem volt ff-frissíthető. Teendő ilyenkor: a helyi commitot ágra menteni (tulajdonosi döntés űrlapon), main → origin/main (`reset --keep`), majd ellenőrizni, hogy nem került-e közben az originre.

**Why:** a tulajdonos űrlapon döntött: „Ágvédelem a main-en (Javasolt)” — a main-re csak PR-on át, kötelező zöld ellenőrzésekkel; a beállítást a TULAJDONOS kapcsolja be a GitHubon (Settings → Branches), én repo-beállítást nem módosítok.

**How to apply:** ha a push-kapu C-61-gyel bukik és a főágon PR nélküli commit van, előbb azt nézd meg (`git log origin/main`), és kis PR-ral javítsd; amíg az ágvédelem nincs bekapcsolva, minden session elején ellenőrizd a főág zöldjét. A másik gép záró-hurok vázából átvett ötletek a WEBSULI saját változatában: [[futas-vegi-hurok]].
