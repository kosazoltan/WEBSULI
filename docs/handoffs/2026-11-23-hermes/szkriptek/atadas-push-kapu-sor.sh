#!/usr/bin/env bash
# A nyitott PR-ok ágai (#510, #513, #521, #529, #540) SZÁNDÉKOSAN nincsenek a listában: rájuk érdemi javító push csak a
# teljes javító folyamattal (fejazonos vak ítélet) mehet — átadó dokumentum 4. és 13.2 fejezet.
# Átadás előtti push-kapu sor: főág-összefésülés (ütközésnél visszavonás), node_modules, gate:push. Eredmény: push-eredmeny.tsv
S=${S:-$HOME/websuli-atadas-naplok}; mkdir -p "$S" || { echo "a naplómappa nem hozható létre: $S"; exit 2; }
S=$(cd "$S" && pwd) || exit 2   # 2. vak kör L13: abszolút út, a munkafaváltás után is
OUT=$S/push-eredmeny.tsv
# 1. vak kör L6: a segéd a szkript mellől töltődik; a zárat CSAK a segéd saját EXIT-trapje engedi fel (felülírni tilos).
REPO="${WEBSULI_ROOT:-/d/repo/WEBSULI}"
REPO=$(cd "$REPO" 2>/dev/null && pwd) || { echo "nincs ilyen mappa: ${WEBSULI_ROOT:-/d/repo/WEBSULI}"; exit 2; }
git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1 || { echo "nem git-repó: $REPO (WEBSULI_ROOT)"; exit 2; }
git -C "$REPO" remote get-url origin | grep -q 'kosazoltan/WEBSULI' || { echo "nem a WEBSULI repó: $REPO"; exit 2; }
source "$(dirname "$(readlink -f "$0")")/websuli-kapusor.sh"
kapusor_be "atadas push-kapu sor" || exit 1
for n in advent-c advent-s6 aranyos-kapuk tgm-s6c tgm-sk2 vak-v2 zaro-hurok szoletra-szintezes-2 szoletra-a1-bank szoletra-szintezes kitakaro-elovagas kisfilm-leallitas vak-futtato-1 vak-futtato-2 vak-ellenor-deepseek docs-potlasok eredmeny-bontas foterv gepkoltoztetes-folytatas teljes-revizio advent-kepgyarto; do
  w=$REPO/.claude/worktrees/$n
  cd "$w" || { printf '%s\t-\t-\tNINCS_MUNKAFA\n' "$n" >>"$OUT"; continue; }
  b=$(git branch --show-current)
  if [ -n "$(git status --porcelain)" ]; then printf '%s\t%s\t%s\tPISZKOS_FA\n' "$n" "$b" "$(git rev-parse --short HEAD)" >>"$OUT"; continue; fi
  if ! git merge-base --is-ancestor origin/main HEAD; then
    if ! git merge -q --no-edit origin/main >"$S/merge-$n.log" 2>&1; then
      git merge --abort >/dev/null 2>&1
      printf '%s\t%s\t%s\tUTKOZES_A_FOAGGAL\t%s\n' "$n" "$b" "$(git rev-parse --short HEAD)" "$(git diff --name-only --diff-filter=U | head -3 | tr '\n' ' ')" >>"$OUT"; continue
    fi
  fi
  [ -d source/node_modules ] || npm.cmd ci --prefix source --ignore-scripts >"$S/ci-$n.log" 2>&1
  : >"$S/gate-$n.log" || { echo "a napló nem írható: $S/gate-$n.log"; exit 2; }
  npm run gate:push >"$S/gate-$n.log" 2>&1; kod=$?
  if [ "$kod" = 0 ] && grep -q "pre-push-gate: ZÖLD" "$S/gate-$n.log"; then r=ZOLD; else r="BUKOTT($kod)"; fi
  printf '%s\t%s\t%s\t%s\t%s\n' "$n" "$b" "$(git rev-parse HEAD)" "$r" "$(grep -E '\| FAIL ' "$S/gate-$n.log" | cut -d'|' -f1 | sed 's/ *$//' | tr '\n' ';')" >>"$OUT"
done
echo KESZ >>"$OUT"
