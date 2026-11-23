#!/usr/bin/env bash
# WEBSULI kapusor-zár (C-72): egy gépen egyszerre EGY helyi kapu / böngészős tesztkör / vak kör futhat.
# Használat egy sor-szkript elején:   source ~/.claude/scripts/websuli-kapusor.sh; kapusor_be "<név>"
# A zár a szkript kilépésekor magától felszabadul. Beragadt zár: ha a tulajdonos PID már nem él, a következő várakozó átveszi.
KAPUSOR_ZAR="${KAPUSOR_ZAR:-/c/Users/kosaz/.claude/websuli-kapusor.lock}"
kapusor_be() {
  local nev="${1:-nevtelen}" i=0 max="${KAPUSOR_MAX_VAR:-240}"
  # 2. vak kör L6: a zár szülőkönyvtára hiányzik / nem írható → hiba, nem „foglalt”; a várakozás véges (alapból 240 × 30 s = 2 óra).
  local szulo; szulo=$(dirname "$KAPUSOR_ZAR")
  if [ ! -d "$szulo" ] || [ ! -w "$szulo" ]; then echo "[kapusor] a zár helye nem írható: $szulo (KAPUSOR_ZAR)"; return 2; fi
  while ! mkdir "$KAPUSOR_ZAR" 2>/dev/null; do
    [ -d "$KAPUSOR_ZAR" ] || { echo "[kapusor] a zár nem hozható létre: $KAPUSOR_ZAR"; return 2; }
    local pid; pid=$(cat "$KAPUSOR_ZAR/pid" 2>/dev/null)
    if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then rm -f "$KAPUSOR_ZAR/pid" "$KAPUSOR_ZAR/nev"; rmdir "$KAPUSOR_ZAR" 2>/dev/null; continue; fi
    i=$((i+1)); [ $((i % 20)) = 1 ] && echo "[kapusor] $nev vár: $(cat "$KAPUSOR_ZAR/nev" 2>/dev/null) fut"
    [ "$i" -ge "$max" ] && { echo "[kapusor] $nev: a várakozás elérte a korlátot ($max × 30 s)"; return 3; }
    sleep 30
  done
  echo $$ > "$KAPUSOR_ZAR/pid"; echo "$nev" > "$KAPUSOR_ZAR/nev"
  trap 'rm -f "$KAPUSOR_ZAR/pid" "$KAPUSOR_ZAR/nev"; rmdir "$KAPUSOR_ZAR" 2>/dev/null' EXIT
  echo "[kapusor] $nev fut ($(date +%H:%M))"
}
