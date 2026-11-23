---
name: bank-model-opus-decision
description: A gyakorlóbank modellje marad az Opus 5.5 — olcsóbb OpenRouter-jelöltek mérve és elvetve (2026-10-16); a gyorsítás a párhuzamos bank
metadata:
  node_type: memory
  type: project
  modified: 2026-10-16T18:18:17.146Z
---

Tulajdonosi döntés 2026-10-16: a gyakorlóbank modellje marad az Opus 5.5 (tartalék GPT-6.1 Sol). Az olcsóbb bankmodell-mérést
a tulajdonos félbeszakította: „ezt nem ússzuk meg olcsóbb modellel”.

Mért (a „Medve” matek-lecke, job b3c07512, Opus 5.5 lektor):
- gpt-6-luna (high): elkészült, de 14/19 bukott kísérlet (sémahiba, pl. számként adott `typedAnswers`), 983 s, 5,5%
  lektor-blokkoló banktétel, 0,13 USD;
- deepseek-v4-pro (high): a 2. fejezet bankja a javítókörök után is hibás maradt (üres `typedAnswers`) → a gyártás megállt volna.
- A qwen3.8-max-0902, a minimax-m3 és a muse-spark-1.3 nem futott le.

**Why:** a bank a leghibásabb szakasz; az olcsó modellek sémahibái javítókörökben elviszik az időt és bukást okoznak.

**How to apply:** ne javasolj újra olcsóbb bankmodellt bizonyíték nélkül. A gyorsítás iránya a párhuzamos bank (#265: 1898 s →
1022 s), nem a modellcsere. Kapcsolódó: [[lesson-trial-harness]].
